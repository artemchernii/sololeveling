import { v } from 'convex/values'

import { requireUser } from './auth'
import { query } from './_generated/server'
import { mutation } from './write'

/* N1 (15 Oct). The bell: today's notifications, newest first, and a tap
   that clears one's dot. "Today" starts at the caller's own midnight, so
   the client passes it. */

const MAX_TODAY = 30

export const today = query({
  args: { since: v.number() },
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    return await ctx.db
      .query('notifications')
      .withIndex('by_owner_and_sent', (q) =>
        q.eq('ownerId', ownerId).gte('sentAt', args.since),
      )
      .order('desc')
      .take(MAX_TODAY)
  },
})

export const markRead = mutation({
  args: { id: v.id('notifications') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const row = await ctx.db.get(args.id)
    if (row === null || row.ownerId !== ownerId) {
      throw new Error('No such notification')
    }
    if (row.readAt === undefined) {
      await ctx.db.patch(args.id, { readAt: Date.now() })
    }
    return null
  },
})
