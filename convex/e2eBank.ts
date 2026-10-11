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

/** The mock ActivoBank becomes a bank the app can connect: convex/bankApi.ts
    answers for it. Its own step, so no other test's account changes. */
export const reachable = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const accounts = await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(50)
    for (const a of accounts)
      if (a.name === 'ActivoBank')
        await ctx.db.patch(a._id, { institution: 'activo' })
    return null
  },
})

/** The canned bank's next answer for the connected mock ActivoBank, and
    its last answer made five hours old — so opening Finances asks again.
    `twin` also puts the top-up Revolut's file wrote here yesterday. */
export const answer = mutation({
  args: { as: v.union(v.literal('two'), v.literal('twin'), v.literal('many')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const links = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) => q.eq('ownerId', ownerId))
      .take(50)
    for (const link of links) {
      if (link.status !== 'linked' || link.uids === undefined) continue
      await ctx.db.patch(link._id, {
        uids: link.uids.map((u) => ({
          ...u,
          uid: `${u.uid.split(':')[0]}:${args.as}`,
        })),
        checkedAt: Date.now() - 5 * 3_600_000,
      })
      if (args.as === 'twin')
        await ctx.db.insert('logs', {
          ownerId,
          area: 'money',
          kind: 'move',
          occurredAt: Date.now() - 86_400_000,
          value: -700,
          unit: 'eur',
          text: 'Top-up by *2789',
          accountId: link.accountId,
          meta: { merchant: 'Top-up by *2789', raw: 'Top-up by *2789' },
        })
    }
    return null
  },
})
