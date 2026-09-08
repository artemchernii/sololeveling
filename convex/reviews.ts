import { v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import schema from './schema'

/* PLAN.md §3, the weekly review: "the week, as it actually went". The numbers
   on that page come from aggregate.ts like every other number; what lives here
   is only what you wrote — five answers and the one sentence that says what
   changes next week.
 
   `periodStart` is an ISO date string, not an instant. A week is a thing on a
   calendar, and "the week of 2026-09-07" means the same thing in every
   timezone, where an epoch millisecond does not. */

const answersValidator = v.object({
  didHappen: v.optional(v.string()),
  movedForward: v.optional(v.string()),
  avoided: v.optional(v.string()),
  overthought: v.optional(v.string()),
  shouldChange: v.optional(v.string()),
})

export const forWeek = query({
  args: { periodStart: v.string() },
  returns: v.union(schema.doc('reviews'), v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('reviews')
      .withIndex('by_owner_period_start', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('period', 'weekly')
          .eq('periodStart', args.periodStart),
      )
      .take(1)
    /* `rows.length`, not `rows[0] ?? null`: without noUncheckedIndexedAccess
       TypeScript believes an index into an array is always defined, so the
       fallback is dead and this query would claim it can never return null. */
    return rows.length === 0 ? null : rows[0]
  },
})

/**
 * Writes what you typed, creating the week's row the first time.
 *
 * Saves freely, including into a closed week: a review is a record of what you
 * thought, and correcting it later is honest. Closing is a separate act.
 */
export const save = mutation({
  args: {
    periodStart: v.string(),
    answers: answersValidator,
    decision: v.optional(v.string()),
  },
  returns: v.id('reviews'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    const existing = await ctx.db
      .query('reviews')
      .withIndex('by_owner_period_start', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('period', 'weekly')
          .eq('periodStart', args.periodStart),
      )
      .take(1)

    const decision = args.decision?.trim()

    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        answers: args.answers,
        decision: decision === '' ? undefined : decision,
      })
      return existing[0]._id
    }

    return await ctx.db.insert('reviews', {
      ownerId,
      period: 'weekly',
      periodStart: args.periodStart,
      answers: args.answers,
      decision: decision === '' ? undefined : decision,
    })
  },
})

/**
 * Closes the week, which requires the one sentence.
 *
 * The decision is the only part of a review that changes anything — the five
 * answers are how you arrive at it. A week closed without one is a form filled
 * in, so this refuses rather than recording a review that decided nothing.
 */
export const close = mutation({
  args: { periodStart: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    const rows = await ctx.db
      .query('reviews')
      .withIndex('by_owner_period_start', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('period', 'weekly')
          .eq('periodStart', args.periodStart),
      )
      .take(1)

    if (rows.length === 0) {
      throw new Error('There is nothing written for that week yet')
    }
    const review = rows[0]
    if ((review.decision ?? '').trim().length === 0) {
      throw new Error('Say what changes next week before closing it')
    }

    await ctx.db.patch(review._id, { closedAt: Date.now() })
    return null
  },
})

/** Reopens a closed week. Closing is a ritual, not a lock. */
export const reopen = mutation({
  args: { periodStart: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('reviews')
      .withIndex('by_owner_period_start', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('period', 'weekly')
          .eq('periodStart', args.periodStart),
      )
      .take(1)

    if (rows.length === 0) return null
    await ctx.db.patch(rows[0]._id, { closedAt: undefined })
    return null
  },
})
