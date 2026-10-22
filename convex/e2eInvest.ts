import { v } from 'convex/values'

import { requireUser } from './auth'
import { guard } from './e2e'
import { investMorning } from './investAlerts'
import { internal } from './_generated/api'
import { action, internalMutation } from './_generated/server'

/* N3 mock step (docs/specs/2026-10-22-n3-investment-alerts.md). Test
   backend only. After `e2eSignals.heldShare`: a close two hours ago 6%
   above the one before — a big day — then this morning's share alerts. */
export const ringShares = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const now = Date.now()
    await ctx.runMutation(internal.e2eInvest.bigClose, { ownerId, now })
    await investMorning(ctx, ownerId, now)
    return null
  },
})

export const bigClose = internalMutation({
  args: { ownerId: v.string(), now: v.number() },
  returns: v.null(),
  handler: async (ctx, { ownerId, now }) => {
    guard()
    const msft = await ctx.db
      .query('instruments')
      .withIndex('by_owner_symbol', (q) =>
        q.eq('ownerId', ownerId).eq('symbol', 'MSFT'),
      )
      .first()
    if (msft === null) throw new Error('heldShare first')
    const last = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', msft._id),
      )
      .order('desc')
      .first()
    if (last === null) throw new Error('heldShare first')
    await ctx.db.insert('prices', {
      ownerId,
      instrumentId: msft._id,
      price: Math.round(last.price * 106) / 100,
      currency: 'USD',
      asOf: now - 2 * 3_600_000,
      fetchedAt: now,
      source: 'Yahoo Finance',
    })
    return null
  },
})
