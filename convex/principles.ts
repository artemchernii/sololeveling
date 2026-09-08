import { v } from 'convex/values'

import { requireUser } from './auth'
import { query } from './_generated/server'
import schema from './schema'

/* PLAN.md §3b.5. The six lines from the source brief §16 are the only fixture
   data this app has, and they are written by seed.ts. This module only reads
   them — there is no create, because a principle you can add from a screen at
   2am is a mood, not a principle. */

export const list = query({
  args: {},
  returns: v.array(schema.doc('principles')),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    return await ctx.db
      .query('principles')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(50)
  },
})
