import { v } from 'convex/values'

import { requireUser } from './auth'
import { requireLiveArea } from './areas'
import { internalMutation, mutation } from './_generated/server'
import { areaSlug } from './schema'

/* The only way a number reaches the CURRENT STATE strip. Nothing is seeded, so
   without this five of its six cells would be permanently empty (PLAN.md §3).

   A snapshot is append-only, like a log: recording a new weight does not edit
   the old one, it supersedes it. currentState() reads the latest row per key,
   which is what makes "latest wins" true rather than merely intended. */

export const record = mutation({
  args: {
    area: areaSlug,
    key: v.string(),
    value: v.optional(v.number()),
    textValue: v.optional(v.string()),
    unit: v.optional(v.string()),
    recordedAt: v.number(),
  },
  returns: v.id('stateSnapshots'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    await requireLiveArea(ctx, ownerId, args.area)

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

/**
 * `cefr_level` becomes `cefr_level:portuguese` (R6b-b).
 *
 * The key was global while there was one language. A second one would have
 * overwritten the first — "latest row wins" is what makes currentState true,
 * and with one key that truth becomes a lie the moment two languages share
 * it. The slug goes in the key rather than into a new index: the key is
 * already a string and `by_owner_key_time` already leads with owner and key,
 * so the composite reads as the same range scan.
 *
 * An internal mutation with no identity of its own — it migrates every
 * owner's rows, each under the owner they already carry. Idempotent: a row
 * already carrying a suffixed key is skipped, so running it twice is running
 * it once.
 *
 * Run once against the deployment:
 *   npx convex run state:migrateCefrKeys
 */
export const migrateCefrKeys = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    /* Every owner's rows, so this cannot be scoped by an owner index. It is
       a one-off over a table holding one row per weigh-in and level, which is
       small — and it is internal, so no client can reach it. */
    const rows = await ctx.db.query('stateSnapshots').collect()
    let moved = 0
    for (const row of rows) {
      if (row.key !== 'cefr_level') continue
      await ctx.db.patch(row._id, { key: `cefr_level:${row.area}` })
      moved += 1
    }
    return moved
  },
})
