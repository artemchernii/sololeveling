import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalAction, internalMutation, mutation } from './_generated/server'
import { requireUser } from './auth'
import { chart } from './market'
import { UNPRICED } from '../src/lib/market'

/* A share's year, read again once for candles and volume (13 Oct:
   "candles? volume?"). Every reading stores a day's open, high, low and
   shares traded from now on (market.storePrices); the days stored before
   have only a close. Its page asks, for that one share, the first time
   it is opened — never for everything owned at once ("I hope its not
   gonna make DB full in a week"). The four are written onto the rows
   already there, by day: no row is added, moved or written twice. */

const DAY = 86_400_000
/* The year a position's page loads (invest.priceLine), and a range from
   Yahoo that covers all of it — '1y' ends a day short of its first. */
const YEAR = 367 * DAY
const RANGE = '2y'
/* How far a read close may sit from the stored one and still be the
   same reading of that day. Further is another one — a split since —
   and its open and high do not belong on this close. */
const SAME_CLOSE = 0.01

export const ask = mutation({
  args: { instrumentId: v.id('instruments') },
  returns: v.union(
    v.literal('reading'),
    v.literal('fresh'),
    v.literal('nothing'),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const inst = await ctx.db.get(args.instrumentId)
    if (inst === null || inst.ownerId !== ownerId)
      throw new Error('No such share')
    /* The test backend keeps its mock prices, as prices.refresh does. */
    if (process.env.E2E === '1') return 'fresh'
    if (inst.type === UNPRICED) return 'nothing'
    if (inst.barsReadAt !== undefined) return 'fresh'
    await ctx.scheduler.runAfter(0, internal.bars.read, {
      instrumentId: inst._id,
    })
    return 'reading'
  },
})

export const read = internalAction({
  args: { instrumentId: v.id('instruments') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const inst = await ctx.runQuery(internal.market.instrument, args)
    if (inst === null || inst.type === UNPRICED) return null
    /* A failed read leaves the share unmarked: its page asks again. */
    const c = await chart(inst.symbol, RANGE)
    const from = Date.now() - YEAR - DAY
    if (c === null) return null
    await ctx.runMutation(internal.bars.store, {
      instrumentId: inst._id,
      rows: c.closes.flatMap((r) =>
        r.asOf < from ||
        r.open === undefined ||
        r.high === undefined ||
        r.low === undefined ||
        r.volume === undefined
          ? []
          : [
              {
                ...r,
                open: r.open,
                high: r.high,
                low: r.low,
                volume: r.volume,
              },
            ],
      ),
    })
    return null
  },
})

/** Writes each bar onto the stored row of its day that has none, and
    marks the share as read. Returns how many rows it wrote. */
export const store = internalMutation({
  args: {
    instrumentId: v.id('instruments'),
    rows: v.array(
      v.object({
        asOf: v.number(),
        price: v.number(),
        open: v.number(),
        high: v.number(),
        low: v.number(),
        volume: v.number(),
      }),
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const inst = await ctx.db.get(args.instrumentId)
    if (inst === null) return 0
    const dayOf = (t: number) => Math.floor(t / DAY)
    const byDay = new Map(args.rows.map((r) => [dayOf(r.asOf), r]))
    const have = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q
          .eq('ownerId', inst.ownerId)
          .eq('instrumentId', inst._id)
          .gte('asOf', Date.now() - YEAR),
      )
      .take(400)
    let written = 0
    for (const h of have) {
      const r = byDay.get(dayOf(h.asOf))
      if (r === undefined || h.open !== undefined) continue
      if (Math.abs(r.price - h.price) > h.price * SAME_CLOSE) continue
      const { open, high, low, volume } = r
      await ctx.db.patch(h._id, { open, high, low, volume })
      written++
    }
    await ctx.db.patch(inst._id, { barsReadAt: Date.now() })
    return written
  },
})
