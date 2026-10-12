import { v } from 'convex/values'

import { internal } from './_generated/api'
import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { UNPRICED } from '../src/lib/market'

/* Prices while Finances is open (13 Oct: "when we have finances open =>
   we fetch, and after that every 30 min, but if its not opened we dont
   care and fetch daily"). The screen asks; a reading younger than half an
   hour is left alone, so a reload or a second tab does not ask Yahoo
   again. The price is still stored and dated before it is shown — source
   4's rule — and the daily run after New York closes is untouched. */

export const FRESH_FOR = 30 * 60_000
/** How many tickers are looked at to tell how old the last reading is. */
const SAMPLE = 5

export const refresh = mutation({
  args: {},
  returns: v.union(
    v.literal('reading'),
    v.literal('fresh'),
    v.literal('nothing'),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const held = (
      await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) => q.eq('ownerId', ownerId))
        .take(50)
    )
      .filter((i) => i.type !== UNPRICED)
      .slice(0, SAMPLE)
    if (held.length === 0) return 'nothing'
    let newest = 0
    for (const i of held) {
      const row = await ctx.db
        .query('prices')
        .withIndex('by_owner_instrument_time', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', i._id),
        )
        .order('desc')
        .first()
      if (row !== null) newest = Math.max(newest, row.fetchedAt)
    }
    if (Date.now() - newest < FRESH_FOR) return 'fresh'
    await ctx.scheduler.runAfter(0, internal.market.readAll, {
      pricesOnly: true,
      ownerId,
    })
    return 'reading'
  },
})
