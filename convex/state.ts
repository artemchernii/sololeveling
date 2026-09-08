import { v } from 'convex/values'

import { requireUser } from './auth'
import { mutation } from './_generated/server'
import { areaValidator } from './schema'

/* The only way a number reaches the CURRENT STATE strip. Nothing is seeded, so
   without this five of its six cells would be permanently empty (PLAN.md §3).

   A snapshot is append-only, like a log: recording a new weight does not edit
   the old one, it supersedes it. currentState() reads the latest row per key,
   which is what makes "latest wins" true rather than merely intended. */

export const record = mutation({
  args: {
    area: areaValidator,
    key: v.string(),
    value: v.optional(v.number()),
    textValue: v.optional(v.string()),
    unit: v.optional(v.string()),
    recordedAt: v.number(),
  },
  returns: v.id('stateSnapshots'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    /* A snapshot that says nothing is not a state. Refusing here keeps the
       strip from rendering an empty cell that claims to hold a value. */
    if (args.value === undefined && args.textValue === undefined) {
      throw new Error('A state needs a value or a text value')
    }

    return await ctx.db.insert('stateSnapshots', {
      ownerId,
      area: args.area,
      key: args.key,
      value: args.value,
      textValue: args.textValue,
      unit: args.unit,
      recordedAt: args.recordedAt,
    })
  },
})

/**
 * Undo a mis-typed state. Same reasoning as logs.remove: append-only means a
 * value is never edited into a different truth, not that a typo is forever.
 * Removing the newest row makes the one before it current again.
 */
export const remove = mutation({
  args: { snapshotId: v.id('stateSnapshots') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const snapshot = await ctx.db.get(args.snapshotId)
    if (snapshot === null || snapshot.ownerId !== ownerId) {
      throw new Error('No such snapshot')
    }
    await ctx.db.delete(args.snapshotId)
    return null
  },
})
