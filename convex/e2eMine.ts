import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { rebuildLedgers } from './ledgers'
import { requireUser } from './auth'
import { guard } from './e2e'
import { closes } from './e2eFundamentals'
import { SOURCE } from './fundamentals'
import { UNPRICED } from '../src/lib/market'

const DAY = 86_400_000

/* Four positions for Insights' band 3 MINE (19 Oct, spec I2), each with
   a known Portfolio verdict from its stored closes: VUAA a fund that
   holds (the biggest), AVGO a share to add (with a fresh reading),
   NVDA a share to wait on with no country stored yet, and OZON frozen — no price, no verdict. */
const SEED = [
  {
    symbol: 'VUAA.L',
    name: 'Vanguard S&P 500',
    type: 'ETF',
    shape: 'hold',
    shares: 6,
  },
  { symbol: 'AVGO', name: 'Broadcom', type: 'EQUITY', shape: 'add', shares: 3 },
  {
    symbol: 'NVDA',
    name: 'NVIDIA',
    type: 'EQUITY',
    shape: 'wait',
    shares: 1.5,
  },
  {
    symbol: 'OZON',
    name: 'Ozon Holdings',
    type: UNPRICED,
    shape: null,
    shares: 10,
  },
] as const
/* The many case (20 Oct, his "looks small … check yourself"): eleven
   more, so the heatmap is as tall as his fifteen. */
const MORE = [
  ['IWDA.AS', 'iShares Core MSCI World', 'ETF', 'add', 9],
  ['VHYL.L', 'Vanguard FTSE All-World High Dividend', 'ETF', 'hold', 7],
  ['SHLD.L', 'Global X Defense Tech', 'ETF', 'wait', 4],
  ['IGLN.L', 'iShares Physical Gold', 'ETF', 'hold', 5],
  ['MSFT', 'Microsoft', 'EQUITY', 'hold', 1.2],
  ['SAP', 'SAP', 'EQUITY', 'add', 1],
  ['NVO', 'Novo Nordisk', 'EQUITY', 'wait', 1.1],
  ['ASML', 'ASML Holding', 'EQUITY', 'hold', 0.6],
  ['LLY', 'Eli Lilly', 'EQUITY', 'add', 0.4],
  ['BTC-EUR', 'Bitcoin EUR', 'CRYPTOCURRENCY', 'hold', 0.004],
  ['VFEG.L', 'Vanguard FTSE Emerging Markets', 'ETF', 'wait', 3],
] as const

const COUNTRY: Partial<Record<string, string>> = {
  AVGO: 'United States',
  MSFT: 'United States',
  LLY: 'United States',
  SAP: 'Germany',
  NVO: 'Denmark',
  ASML: 'Netherlands',
}
const HEALTH = new Set(['NVO', 'LLY'])

export const positions = mutation({
  /* `part` 1 and 2 add the many case's eleven in two calls: one call
     would pass a mutation's read limit on a re-run. */
  args: { part: v.optional(v.union(v.literal(1), v.literal(2))) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const account = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .first()
    if (account === null) throw new Error('reset first')
    const now = Date.now()
    const today = Math.floor(now / DAY) * DAY
    for (const ago of [100, 40, 10, 1])
      await ctx.db.insert('fxRates', {
        ownerId,
        currency: 'USD',
        rate: 0.86,
        asOf: today - ago * DAY,
        fetchedAt: now,
        source: 'ECB',
      })
    const seed =
      args.part === undefined
        ? SEED
        : MORE.slice(args.part === 1 ? 0 : 6, args.part === 1 ? 6 : 11).map(
            ([symbol, name, type, shape, shares]) => ({
              symbol,
              name,
              type,
              shape,
              shares,
            }),
          )
    for (const s of seed) {
      /* Reset keeps tickers: the same one each time, its days afresh. */
      const found = await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) =>
          q.eq('ownerId', ownerId).eq('symbol', s.symbol),
        )
        .first()
      /* Other specs store the same tickers under their own names. */
      const own = {
        name: s.name,
        exchange: s.type === 'ETF' ? 'LSE' : 'NMS',
        currency: 'USD',
        type: s.type,
      }
      if (found !== null) await ctx.db.patch(found._id, own)
      const id =
        found?._id ??
        (await ctx.db.insert('instruments', {
          ownerId,
          symbol: s.symbol,
          ...own,
        }))
      /* Portfolio's tags: AVGO's country stored, NVDA's not yet. */
      if (s.type === 'EQUITY')
        await ctx.db.patch(id, {
          sectorFrom: 'yahoo',
          sectorReadAt: now,
          sector: HEALTH.has(s.symbol) ? 'health' : 'tech',
          country: COUNTRY[s.symbol],
          countryReadAt: COUNTRY[s.symbol] ? now : undefined,
        })
      for (const old of await ctx.db
        .query('prices')
        .withIndex('by_owner_instrument_time', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', id),
        )
        .take(400))
        await ctx.db.delete(old._id)
      for (const old of await ctx.db
        .query('holdings')
        .withIndex('by_owner_instrument', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', id),
        )
        .take(20))
        await ctx.db.delete(old._id)
      if (s.shape !== null) {
        const cs = closes(s.shape)
        for (let k = 0; k < 300; k++)
          await ctx.db.insert('prices', {
            ownerId,
            instrumentId: id,
            price: cs[k],
            currency: 'USD',
            asOf: today - (300 - k) * DAY + 21 * 3_600_000,
            fetchedAt: now,
            source: 'Yahoo Finance',
          })
      }
      await ctx.db.insert('holdings', {
        ownerId,
        accountId: account._id,
        instrumentId: id,
        shares: s.shares,
        asOf: now,
      })
      if (s.symbol === 'AVGO')
        await ctx.db.insert('fundamentals', {
          ownerId,
          instrumentId: id,
          asOf: now - 0.2 * DAY,
          source: SOURCE,
          industry: 'Semiconductors',
          currency: 'USD',
          target: { mean: 412.5, low: 310, high: 500, count: 41 },
          revenueGrowth: 0.22,
        })
    }
    await rebuildLedgers(ctx, ownerId)
    return null
  },
})
