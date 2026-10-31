import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { query } from './_generated/server'
import { mutation } from './write'

/* His targets in euros (31 Oct, docs/specs/2026-10-31-targets.md): read
   by Portfolio's TARGET lens, saved from its edit. Stored as he typed
   them; what is to add is worked out on the page, never stored. */

const BUCKET = v.union(
  v.literal('gold'),
  v.literal('bonds'),
  v.literal('crypto'),
  v.literal('keep'),
)
const target = v.object({ bucket: BUCKET, min: v.number(), max: v.number() })

export const list = query({
  args: {},
  returns: v.array(target),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('targets')
      .withIndex('by_owner_bucket', (q) => q.eq('ownerId', ownerId))
      .take(10)
    return rows.map(({ bucket, min, max }) => ({ bucket, min, max }))
  },
})

/** Every bucket at once, as the edit saves them. */
export const save = mutation({
  args: { targets: v.array(target) },
  returns: v.null(),
  handler: async (ctx, { targets }) => {
    const ownerId = await requireUser(ctx)
    if (new Set(targets.map((t) => t.bucket)).size !== targets.length)
      throw new ConvexError('TARGET_TWICE')
    for (const t of targets)
      if (
        !Number.isFinite(t.min) ||
        !Number.isFinite(t.max) ||
        t.min < 0 ||
        t.max < t.min
      )
        throw new ConvexError('TARGET_RANGE')
    for (const t of targets) {
      const found = await ctx.db
        .query('targets')
        .withIndex('by_owner_bucket', (q) =>
          q.eq('ownerId', ownerId).eq('bucket', t.bucket),
        )
        .unique()
      if (found === null) await ctx.db.insert('targets', { ownerId, ...t })
      else await ctx.db.patch(found._id, { min: t.min, max: t.max })
    }
    return null
  },
})
