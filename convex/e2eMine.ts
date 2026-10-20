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
   NVDA a share to wait on, and OZON frozen — no price, no verdict. */
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

export const positions = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
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
    for (const s of SEED) {
      /* Reset keeps tickers: the same one each time, its days afresh. */
      const found = await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) =>
          q.eq('ownerId', ownerId).eq('symbol', s.symbol),
        )
        .first()
      const id =
        found?._id ??
        (await ctx.db.insert('instruments', {
          ownerId,
          symbol: s.symbol,
          name: s.name,
          exchange: s.type === 'ETF' ? 'LSE' : 'NMS',
          currency: 'USD',
          type: s.type,
        }))
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
