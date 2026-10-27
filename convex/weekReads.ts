import { ConvexError, v } from 'convex/values'

import { internal } from './_generated/api'
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { weekReviewArgs, weekReviewFor } from './aggregate'
import { requireUser } from './auth'
import { chargeGuest, guestAtCap } from './profiles'
import schema, { weekReadLine } from './schema'
import { weekFacts } from '../src/lib/weekRead'

/* The AI read of a week on Review (R7, 15 Oct; spec
   docs/specs/2026-10-15-review-ai-read.md). Paid only on a press: `run`
   stores the week's numbers exactly as aggregate.weekReview counts them
   and schedules the one call (convex/ai/week.ts). A read is kept per week
   and tone, so reopening Review shows it without paying again. */

const WEEK = /^\d{4}-\d{2}-\d{2}$/

/** The week's reads, plain and grilled, newest first (two at most). */
export const forWeek = query({
  args: { week: v.string() },
  returns: v.array(schema.doc('weekReads')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('weekReads')
      .withIndex('by_owner_week', (q) =>
        q.eq('ownerId', ownerId).eq('week', args.week),
      )
      .take(2)
    return rows.sort(
      (a, b) => (b.readAt ?? b._creationTime) - (a.readAt ?? a._creationTime),
    )
  },
})

export const run = mutation({
  args: {
    week: v.string(),
    grill: v.boolean(),
    /** Today's place in the week (0 Monday), null for a week that is over. */
    day: v.union(v.number(), v.null()),
    review: weekReviewArgs,
  },
  returns: v.id('weekReads'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    if (!WEEK.test(args.week)) throw new Error('BAD_WEEK')
    if (await guestAtCap(ctx, ownerId)) throw new ConvexError('CAP_REACHED')
    const existing = await ctx.db
      .query('weekReads')
      .withIndex('by_owner_week', (q) =>
        q.eq('ownerId', ownerId).eq('week', args.week).eq('grill', args.grill),
      )
      .unique()
    /* A second press while it reads pays nothing more. */
    if (existing?.status === 'reading') return existing._id

    const review = await weekReviewFor(ctx, ownerId, args.review)
    const names: Record<string, string> = {}
    for (const slug of args.review.languages) {
      const area = await ctx.db
        .query('areas')
        .withIndex('by_owner_slug', (q) =>
          q.eq('ownerId', ownerId).eq('slug', slug),
        )
        .first()
      if (area !== null) names[slug] = area.label
    }
    const fields = {
      status: 'reading' as const,
      facts: weekFacts(review, names, args.day !== null),
      day: args.day,
      verdict: undefined,
      lines: undefined,
      error: undefined,
      readAt: undefined,
      inputTokens: undefined,
      outputTokens: undefined,
    }
    const readId =
      existing === null
        ? await ctx.db.insert('weekReads', {
            ownerId,
            week: args.week,
            grill: args.grill,
            ...fields,
          })
        : existing._id
    if (existing !== null) await ctx.db.patch(readId, fields)
    await ctx.scheduler.runAfter(0, internal.ai.week.readWeek, { readId })
    return readId
  },
})

export const forRead = internalQuery({
  args: { readId: v.id('weekReads') },
  returns: v.union(schema.doc('weekReads'), v.null()),
  handler: async (ctx, args) => {
    const read = await ctx.db.get(args.readId)
    return read?.status === 'reading' ? read : null
  },
})

export const finish = internalMutation({
  args: {
    readId: v.id('weekReads'),
    verdict: v.string(),
    lines: v.array(weekReadLine),
    inputTokens: v.number(),
    outputTokens: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { readId, ...read }) => {
    const row = await ctx.db.get(readId)
    if (row !== null) await chargeGuest(ctx, row.ownerId, read)
    await ctx.db.patch(readId, {
      ...read,
      status: 'done',
      readAt: Date.now(),
    })
    return null
  },
})

export const fail = internalMutation({
  args: { readId: v.id('weekReads'), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.readId, { status: 'failed', error: args.error })
    return null
  },
})
