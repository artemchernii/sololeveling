import { v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema, { areaValidator } from './schema'

/* PLAN.md §2 and §3b.3. An event is something that occupies time whether or not
   you do anything about it; a task is something you intend to do. They are two
   tables and they meet only in the UI.
 
   This module returns rows, never occurrences. A recurring event is one row —
   expansion into instances happens on the client (`src/lib/recurrence.ts`), so
   the same series costs one row here whether the window is a week or a year. */

const MAX_ROWS = 200

async function ownedEvent(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  eventId: Id<'events'>,
): Promise<Doc<'events'>> {
  const event = await ctx.db.get(eventId)
  if (event === null || event.ownerId !== ownerId) {
    throw new Error('No such event')
  }
  return event
}

function assertSaneTimes(startsAt: number, endsAt: number) {
  /* Equal is allowed — a zero-length marker is a real thing to put on a day.
     Backwards is not: it would render as negative time booked, and the TODAY
     card sums durations to tell you how much of the day is spoken for. */
  if (endsAt < startsAt) {
    throw new Error('An event cannot end before it starts')
  }
}

export const create = mutation({
  args: {
    title: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    area: v.optional(areaValidator),
    projectId: v.optional(v.id('projects')),
    rrule: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.id('events'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    const title = args.title.trim()
    if (title.length === 0) {
      throw new Error('An event needs a title')
    }
    assertSaneTimes(args.startsAt, args.endsAt)

    return await ctx.db.insert('events', {
      ownerId,
      title,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      area: args.area,
      projectId: args.projectId,
      rrule: args.rrule,
      notes: args.notes,
    })
  },
})

/**
 * Edits the whole series, which is the only granularity this phase has
 * (PLAN §3b.6). Moving one occurrence of a recurring event is deliberately not
 * possible yet: an occurrence has an id but no row to write to.
 */
export const update = mutation({
  args: {
    eventId: v.id('events'),
    title: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    area: v.optional(areaValidator),
    projectId: v.optional(v.id('projects')),
    rrule: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const existing = await ownedEvent(ctx, ownerId, args.eventId)

    const title = args.title?.trim() ?? existing.title
    if (title.length === 0) {
      throw new Error('An event needs a title')
    }
    assertSaneTimes(
      args.startsAt ?? existing.startsAt,
      args.endsAt ?? existing.endsAt,
    )

    await ctx.db.patch(args.eventId, {
      title,
      startsAt: args.startsAt ?? existing.startsAt,
      endsAt: args.endsAt ?? existing.endsAt,
      area: args.area ?? existing.area,
      projectId: args.projectId ?? existing.projectId,
      rrule: args.rrule ?? existing.rrule,
      notes: args.notes ?? existing.notes,
    })
    return null
  },
})

/** Deletes the series. There is no per-occurrence delete yet — see §3b.6. */
export const remove = mutation({
  args: { eventId: v.id('events') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedEvent(ctx, ownerId, args.eventId)
    await ctx.db.delete(args.eventId)
    return null
  },
})

/**
 * Every event that could put something inside `[from, to)`.
 *
 * Two reads, because a window cannot find a series by its start: a weekly event
 * that began in March has occurrences in June while its row sits far behind the
 * window. So one read takes the rows that start inside the window, and another
 * takes the recurring rows regardless of when they began. The caller expands
 * them and decides what actually lands in the window.
 *
 * Returning rows rather than occurrences is what keeps this cheap: the client
 * already has `expandEvents`, and a year-long view costs the same rows as a day.
 */
export const listInRange = query({
  args: { from: v.number(), to: v.number() },
  returns: v.array(schema.doc('events')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    const starting = await ctx.db
      .query('events')
      .withIndex('by_owner_start', (q) =>
        q
          .eq('ownerId', ownerId)
          .gte('startsAt', args.from)
          .lt('startsAt', args.to),
      )
      .take(MAX_ROWS)

    /* An absent optional field sorts before every string, so `gte('rrule', '')`
       is "has an rrule at all" expressed as an index range rather than a filter
       — which matters, because a filter would still read every past event. */
    const series = await ctx.db
      .query('events')
      .withIndex('by_owner_rrule', (q) =>
        q.eq('ownerId', ownerId).gte('rrule', ''),
      )
      .take(MAX_ROWS)

    /* A series that begins inside the window is caught by both reads. */
    const seen = new Set(starting.map((e) => e._id))
    return [...starting, ...series.filter((e) => !seen.has(e._id))]
  },
})
