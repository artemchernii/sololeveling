import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { query } from './_generated/server'
import { mutation } from './write'

/* Held names kept out of EVERYTHING OWNED (1 Nov, his "excluded list").
   ⊘ HIDE on a position's page puts one here; the list folds it under
   HIDDEN. Nothing else reads it: worth, the map and TARGET still count
   every share. */

/** More than he would ever fold away; a read stays small. */
const MAX = 100

export const list = query({
  args: {},
  returns: v.array(v.id('instruments')),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('hides')
      .withIndex('by_owner_instrument', (q) => q.eq('ownerId', ownerId))
      .take(MAX)
    return rows.map((r) => r.instrumentId)
  },
})

/** ⊘ HIDE, or SHOW to bring it back. One row in the list can be the
    same company under two codes (GOOGL · GOOG): all of them at once. */
export const set = mutation({
  args: { instrumentIds: v.array(v.id('instruments')), hidden: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { instrumentIds, hidden }) => {
    const ownerId = await requireUser(ctx)
    if (instrumentIds.length === 0 || instrumentIds.length > 4)
      throw new ConvexError('HIDE_COUNT')
    for (const instrumentId of instrumentIds) {
      const thing = await ctx.db.get(instrumentId)
      if (thing === null || thing.ownerId !== ownerId)
        throw new ConvexError('NOT_FOUND')
    }
    const now = await ctx.db
      .query('hides')
      .withIndex('by_owner_instrument', (q) => q.eq('ownerId', ownerId))
      .take(MAX)
    for (const instrumentId of instrumentIds) {
      const found = now.find((r) => r.instrumentId === instrumentId)
      if (hidden && found === undefined) {
        if (now.length >= MAX) throw new ConvexError('HIDDEN_FULL')
        await ctx.db.insert('hides', {
          ownerId,
          instrumentId,
          hiddenAt: Date.now(),
        })
      }
      if (!hidden && found !== undefined) await ctx.db.delete(found._id)
    }
    return null
  },
})
