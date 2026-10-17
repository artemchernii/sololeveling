import { v } from 'convex/values'

import { requireUser } from './auth'
import { guard } from './e2e'
import { internal } from './_generated/api'
import { action, internalMutation } from './_generated/server'

/* N2 mock steps (docs/specs/2026-10-17-n2-finances-alerts.md). Test
   backend only: requireUser, then the guard. */

/** A €5,000 bill on `day` from the first account, then this morning's
    job, now — so the bell has a money alert to show. */
export const ringMorning = action({
  args: { day: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    await ctx.runMutation(internal.e2eMoney.bigBill, { ownerId, day: args.day })
    await ctx.runAction(internal.moneyAlerts.morning, { ownerId })
    return null
  },
})

export const bigBill = internalMutation({
  args: { ownerId: v.string(), day: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    guard()
    const first = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', args.ownerId))
      .first()
    if (first === null) throw new Error('no account in the mock')
    await ctx.db.insert('recurring', {
      ownerId: args.ownerId,
      name: 'Preply',
      kind: 'expense',
      amount: 5000,
      accountId: first._id,
      cadence: 'monthly',
      day: args.day,
    })
    return null
  },
})
