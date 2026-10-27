import { v } from 'convex/values'

import { internal } from './_generated/api'
import { mutation } from './_generated/server'
import { requireUser } from './auth'
import { guard } from './e2e'

/* The demo account's browser test (docs/specs/2026-10-27-demo-account.md):
   the test user marked demo and refilled in batches, as demo.make does.
   Test backend only (`guard`); the next reset makes it Artem again. */
export const makeDemo = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .unique()
    if (profile === null) throw new Error('reset first')
    await ctx.db.patch(profile._id, { demo: true, asOwner: undefined })
    await ctx.scheduler.runAfter(0, internal.demo.refill, { ownerId })
    return null
  },
})
