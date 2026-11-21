import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'
import { ringFor } from './watch'

const DAY = 86_400_000

/* The watchlist's names (1 Nov, watchlist.spec.ts): three not owned,
   each with a year of closes in dollars, as the nightly check stores
   them. Test backend only (`guard`). */
const NAMES: ReadonlyArray<[string, string, number, number]> = [
  // symbol, name, the year's first close, the latest
  ['AMD', 'Advanced Micro Devices', 120, 141.2],
  ['TSM', 'Taiwan Semiconductor', 125, 172.85],
  ['NVO', 'Novo Nordisk', 128, 58.4],
]
const DAYS = 260

export const names = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const now = Date.now()
    for (const [symbol, name, first, last] of NAMES) {
      /* Instruments and prices outlive the reset: the same ticker's
         row is used again, its old closes taken off. */
      const own = { name, exchange: 'NMS', currency: 'USD', type: 'EQUITY' }
      const found = await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) =>
          q.eq('ownerId', ownerId).eq('symbol', symbol),
        )
        .first()
      if (found !== null) await ctx.db.patch(found._id, own)
      const instrumentId =
        found?._id ??
        (await ctx.db.insert('instruments', { ownerId, symbol, ...own }))
      for (const old of await ctx.db
        .query('prices')
        .withIndex('by_owner_instrument_time', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', instrumentId),
        )
        .take(1000))
        await ctx.db.delete(old._id)
      /* A climb to a peak two thirds in, then down to the latest. */
      const peak = Math.max(first, last) * 1.3
      for (let i = 0; i < DAYS; i++) {
        const x = i / (DAYS - 1)
        const price =
          x < 2 / 3
            ? first + (peak - first) * (x * 1.5)
            : peak + (last - peak) * ((x - 2 / 3) * 3)
        await ctx.db.insert('prices', {
          ownerId,
          instrumentId,
          price: Math.round(price * 100) / 100,
          currency: 'USD',
          asOf: now - (DAYS - 1 - i) * DAY,
          fetchedAt: now,
          source: 'Yahoo Finance',
        })
      }
      await ctx.db.insert('watches', { ownerId, instrumentId, addedAt: now })
    }
    return null
  },
})

/** A close past a name's alert, then the 21:30 job's ring. */
export const ring = mutation({
  args: { symbol: v.string(), price: v.number() },
  returns: v.number(),
  handler: async (ctx, { symbol, price }) => {
    const ownerId = await requireUser(ctx)
    guard()
    const inst = await ctx.db
      .query('instruments')
      .withIndex('by_owner_symbol', (q) =>
        q.eq('ownerId', ownerId).eq('symbol', symbol),
      )
      .first()
    if (inst === null) throw new Error('names first')
    await ctx.db.insert('prices', {
      ownerId,
      instrumentId: inst._id,
      price,
      currency: 'USD',
      asOf: Date.now() + DAY,
      fetchedAt: Date.now(),
      source: 'Yahoo Finance',
    })
    return await ringFor(ctx, ownerId)
  },
})
