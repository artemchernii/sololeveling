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
/** Tickers looked at, at most, to tell how old the last reading is. */
const MAX_TICKERS = 500
/** How many of the newest scheduled jobs are looked at for a reading
    already on its way. */
const RECENT_JOBS = 30

export const refresh = mutation({
  args: {},
  returns: v.union(
    v.literal('reading'),
    v.literal('fresh'),
    v.literal('nothing'),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    /* The test backend keeps its mock prices: a reading from Yahoo there
       changed every total the browser tests expect (13 Oct). */
    if (process.env.E2E === '1') return 'fresh'
    /* Only held tickers are read (17 Oct), so the newest reading of any
       ticker tells; one row each, stopping at the first fresh one. */
    const tickers = (
      await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) => q.eq('ownerId', ownerId))
        .take(MAX_TICKERS)
    ).filter((i) => i.type !== UNPRICED)
    if (tickers.length === 0) return 'nothing'
    let newest = 0
    for (const i of tickers) {
      const row = await ctx.db
        .query('prices')
        .withIndex('by_owner_instrument_time', (q) =>
          q.eq('ownerId', ownerId).eq('instrumentId', i._id),
        )
        .order('desc')
        .first()
      if (row !== null) newest = Math.max(newest, row.fetchedAt)
      if (Date.now() - newest < FRESH_FOR) return 'fresh'
    }
    if (Date.now() - newest < FRESH_FOR) return 'fresh'
    /* One reading at a time (14 Oct). A reading of every ticker takes a
       minute or two, and until its first prices land a second ask — a
       second tab, the page shown again, the effect React runs twice in
       development — still sees old prices. Two readings side by side
       saved the same rows at the same moment: 465 collisions on
       `prices` in three days, each one redone. */
    const jobs = await ctx.db.system
      .query('_scheduled_functions')
      .order('desc')
      .take(RECENT_JOBS)
    const running = jobs.some(
      (j) =>
        (j.state.kind === 'pending' || j.state.kind === 'inProgress') &&
        j.name.endsWith('readAll') &&
        (j.args[0] as { ownerId?: string } | undefined)?.ownerId === ownerId,
    )
    if (running) return 'reading'
    await ctx.scheduler.runAfter(0, internal.market.readAll, {
      pricesOnly: true,
      ownerId,
    })
    return 'reading'
  },
})
