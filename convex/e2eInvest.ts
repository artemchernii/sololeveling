import { v } from 'convex/values'

import { requireUser } from './auth'
import { guard } from './e2e'
import { ringClose } from './closeReport'
import { internal } from './_generated/api'
import { action, internalMutation } from './_generated/server'

/* CLOSE mock steps (docs/specs/2026-10-22-n3-investment-alerts.md).
   Test backend only. After `e2eSignals.heldShare`: `bigDay` stores a
   close two hours ago 6% above the one before; `ringClose` then runs the
   21:30 job on the stored prices. */
export const bigDay = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    await ctx.runMutation(internal.e2eInvest.bigClose, {
      ownerId,
      now: Date.now(),
    })
    return null
  },
})

export const ring = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    await ringClose(ctx, ownerId, false)
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
