import { v } from 'convex/values'

import { requireUser } from './auth'
import { guard } from './e2e'
import { mutation } from './_generated/server'

/* Mock steps for a connected bank (docs/specs/2026-10-11-bank-connections.md).
   Test backend only: each opens with requireUser, then the guard. */

/** The bank's approval ran out a minute ago, on every link the test user
    has: what a card shows months after connecting. */
export const end = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const links = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) => q.eq('ownerId', ownerId))
      .take(50)
    for (const link of links)
      await ctx.db.patch(link._id, { validUntil: Date.now() - 60_000 })
    return null
  },
})
