import { v } from 'convex/values'

import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'

/* R8 · S2's browser test: the test user as a new person — no profile, no
   log — after reset gave them both. Test backend only. */
export const newPerson = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    for (const p of await ctx.db
      .query('profiles')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .collect())
      await ctx.db.delete(p._id)
    for (const l of await ctx.db
      .query('logs')
      .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
      .collect())
      await ctx.db.delete(l._id)
    return null
  },
})
