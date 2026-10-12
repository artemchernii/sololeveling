import { v } from 'convex/values'

import { requireUser } from './auth'
import { guard } from './e2e'
import { mutation } from './_generated/server'

/* Mock steps for UPDATE on one account (docs/specs/2026-10-10-one-update.md,
   piece 3b). Test backend only: requireUser, then the guard. */

/** Revolut — a bank that is also a broker — connected to the bank an hour
    ago: its card keeps UPDATE for the broker's files, and its free cash is
    the bank's number. */
export const linkRevolut = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(50)
    const revolut = accounts.find((a) => a.name === 'Revolut')
    if (!revolut) throw new Error('no Revolut in the mock')
    const now = Date.now()
    await ctx.db.insert('bankLinks', {
      ownerId,
      accountId: revolut._id,
      status: 'linked',
      validUntil: now + 90 * 86_400_000,
      checkedAt: now - 3_600_000,
      startedAt: now - 3_600_000,
    })
    return null
  },
})
