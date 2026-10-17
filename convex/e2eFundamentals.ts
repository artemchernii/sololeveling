import { v } from 'convex/values'

import { mutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { requireUser } from './auth'
import { guard } from './e2e'
import { SOURCE } from './fundamentals'

const DAY = 86_400_000
const LAST = 343.86

/**
 * 300 daily closes ending on $343.86 yesterday, shaped so the lines
 * give a known call (16 Oct, the fundamentals slice): `add` rises in
 * small zigzags then dips for 12 days — above SMA 200, under SMA 50;
 * `hold` zigzags up to the end — above both, RSI near 65; `wait`
 * zigzags down — under both.
 */
export function closes(shape: 'add' | 'hold' | 'wait'): Array<number> {
  const out: Array<number> = [0]
  for (let i = 1; i < 300; i++) {
    const zig = i % 2 === 0 ? 1.1 : -0.6
    const step =
      shape === 'wait' ? -zig : shape === 'add' && i >= 288 ? -1.5 : zig
    out.push(out[i - 1] + step)
  }
  const shift = LAST - out[299]
  return out.map((c) => Math.round((c + shift) * 100) / 100)
}

const readingArgs = v.object({
  ageDays: v.number(),
  targetMean: v.optional(v.number()),
  revenueGrowth: v.optional(v.number()),
  ratingMean: v.optional(v.number()),
  ratingKey: v.optional(v.string()),
})

/**
 * A Broadcom-like share held (or a fund, or one sold out) with closes
 * of `shape`, two buys, and — for a share — one Yahoo reading
 * `ageDays` old: AVGO's numbers unless the test names others. Sector
 * averages for its P/E card. Test backend only (`guard`).
 */
export const share = mutation({
  args: {
    shape: v.union(v.literal('add'), v.literal('hold'), v.literal('wait')),
    symbol: v.optional(v.string()),
    fund: v.optional(v.boolean()),
    sold: v.optional(v.boolean()),
    reading: v.optional(readingArgs),
  },
  returns: v.id('instruments'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const account = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .first()
    if (account === null) throw new Error('reset first')
    const symbol = args.symbol ?? (args.fund ? 'VUAA.L' : 'AVGO')
    const instrumentId = await instrument(ctx, ownerId, symbol, !!args.fund)
    const now = Date.now()
    const today = Math.floor(now / DAY) * DAY
    const cs = closes(args.shape)
    for (let k = 0; k < 300; k++)
      await ctx.db.insert('prices', {
        ownerId,
        instrumentId,
        price: cs[k],
        currency: 'USD',
        asOf: today - (300 - k) * DAY + 21 * 3_600_000,
        fetchedAt: now,
        source: 'Yahoo Finance',
      })
    for (const ago of [100, 40, 10, 1])
      await ctx.db.insert('fxRates', {
        ownerId,
        currency: 'USD',
        rate: 0.86,
        asOf: today - ago * DAY,
        fetchedAt: now,
        source: 'ECB',
      })
    const trade = (side: 'buy' | 'sell', shares: number, ago: number) =>
      ctx.db.insert('trades', {
        ownerId,
        accountId: account._id,
        instrumentId,
        side,
        shares,
        priceEur: Math.round(cs[300 - ago] * 0.86 * 100) / 100,
        occurredAt: today - ago * DAY + 15 * 3_600_000,
      })
    await trade('buy', 1.5, 100)
    await trade('buy', 0.75, 40)
    if (args.sold) await trade('sell', 2.25, 10)
    else
      await ctx.db.insert('holdings', {
        ownerId,
        accountId: account._id,
        instrumentId,
        shares: 2.25,
        asOf: now,
      })
    if (!args.fund) {
      const r = args.reading ?? { ageDays: 1 }
      await ctx.db.insert('fundamentals', {
        ownerId,
        instrumentId,
        asOf: now - r.ageDays * DAY,
        source: SOURCE,
        industry: 'Semiconductors',
        currency: 'USD',
        target: { mean: r.targetMean ?? 412.5, low: 310, high: 500, count: 41 },
        rating: {
          mean: r.ratingMean ?? 1.6,
          key: r.ratingKey ?? 'buy',
          strongBuy: 14,
          buy: 22,
          hold: 5,
          sell: 0,
          strongSell: 0,
        },
        revenueGrowth: r.revenueGrowth ?? 0.22,
        revenue: {
          now: { asOf: Date.UTC(2026, 6, 31), value: 15.95e9 },
          was: { asOf: Date.UTC(2025, 6, 31), value: 13.07e9 },
        },
        pe: { forward: 33.8, trailing: 88.4 },
        dividend: { yield: 0.0069, rate: 2.36, exDay: Date.UTC(2026, 8, 22) },
      })
      for (const [industry, firms, forwardPe] of [
        ['Semiconductor', 66, 37.29],
        ['Total Market', 5994, 27.66],
      ] as const)
        await ctx.db.insert('sectorAverages', {
          ownerId,
          industry,
          year: 2026,
          firms,
          forwardPe,
          source: 'Damodaran · NYU Stern',
          fetchedAt: now,
        })
    }
    return instrumentId
  },
})

/* Reset keeps tickers: the same one each time, its days stored afresh. */
async function instrument(
  ctx: MutationCtx,
  ownerId: string,
  symbol: string,
  fund: boolean,
): Promise<Id<'instruments'>> {
  const found = await ctx.db
    .query('instruments')
    .withIndex('by_owner_symbol', (q) =>
      q.eq('ownerId', ownerId).eq('symbol', symbol),
    )
    .first()
  const id =
    found?._id ??
    (await ctx.db.insert('instruments', {
      ownerId,
      symbol,
      name: fund ? 'Vanguard S&P 500' : 'Broadcom',
      exchange: fund ? 'LSE' : 'NMS',
      currency: 'USD',
      type: fund ? 'ETF' : 'EQUITY',
    }))
  await ctx.db.patch(id, { yearsReadAt: undefined })
  for (const table of ['prices'] as const)
    for (const old of await ctx.db
      .query(table)
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
  return id
}
