import { v } from 'convex/values'

import { requireUser } from './auth'
import { requireLiveArea } from './areas'
import { ownedGoal } from './goals'
import { ownedProject } from './projects'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema, { areaSlug } from './schema'

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

/* A reminder is minutes before the start. Negative would be "after it began",
   which is not a reminder; a day is the most anything here needs. */
function assertSaneReminder(remindMin: number | undefined) {
  if (remindMin === undefined) return
  if (!Number.isInteger(remindMin) || remindMin < 0 || remindMin > 24 * 60) {
    throw new Error('A reminder is 0 to 1440 minutes before the start')
  }
}

/** A binding is only to a project or goal of your own (R5). */
async function assertOwnBindings(
  ctx: MutationCtx,
  ownerId: string,
  bindings: {
    projectId?: Id<'projects'> | null
    goalId?: Id<'goals'> | null
  },
) {
  if (bindings.projectId) await ownedProject(ctx, ownerId, bindings.projectId)
  if (bindings.goalId) await ownedGoal(ctx, ownerId, bindings.goalId)
}

export const create = mutation({
  args: {
    title: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    area: v.optional(areaSlug),
    projectId: v.optional(v.id('projects')),
    goalId: v.optional(v.id('goals')),
    rrule: v.optional(v.string()),
    notes: v.optional(v.string()),
    remindMin: v.optional(v.number()),
  },
  returns: v.id('events'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    if (args.area !== undefined) {
      await requireLiveArea(ctx, ownerId, args.area)
    }
    await assertOwnBindings(ctx, ownerId, args)

    const title = args.title.trim()
    if (title.length === 0) {
      throw new Error('An event needs a title')
    }
    assertSaneTimes(args.startsAt, args.endsAt)
    assertSaneReminder(args.remindMin)

    return await ctx.db.insert('events', {
      ownerId,
      title,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      area: args.area,
      projectId: args.projectId,
      goalId: args.goalId,
      rrule: args.rrule,
      notes: args.notes,
      remindMin: args.remindMin,
    })
  },
})

/**
 * Edits the whole series, which is the only granularity this phase has
 * (PLAN §3b.6). Moving one occurrence of a recurring event is deliberately not
 * possible yet: an occurrence has an id but no row to write to.
 *
 * An absent field is left alone; `null` clears it. Before R5 there was no way
 * to say "none" — picking Once or no area in the dialog sent `undefined`, and
 * the old rrule and area quietly stayed.
 */
export const update = mutation({
  args: {
    eventId: v.id('events'),
    title: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    area: v.optional(v.union(areaSlug, v.null())),
    projectId: v.optional(v.union(v.id('projects'), v.null())),
    goalId: v.optional(v.union(v.id('goals'), v.null())),
    rrule: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.string()),
    remindMin: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    if (args.area) {
      await requireLiveArea(ctx, ownerId, args.area)
    }
    const existing = await ownedEvent(ctx, ownerId, args.eventId)
    await assertOwnBindings(ctx, ownerId, args)

    const title = args.title?.trim() ?? existing.title
    if (title.length === 0) {
      throw new Error('An event needs a title')
    }
    assertSaneTimes(
      args.startsAt ?? existing.startsAt,
      args.endsAt ?? existing.endsAt,
    )
    assertSaneReminder(args.remindMin ?? undefined)

    /* undefined → keep, null → clear, value → set. */
    function pick<T>(next: T | null | undefined, kept: T | undefined) {
      return next === undefined ? kept : (next ?? undefined)
    }

    await ctx.db.patch(args.eventId, {
      title,
      startsAt: args.startsAt ?? existing.startsAt,
      endsAt: args.endsAt ?? existing.endsAt,
      area: pick(args.area, existing.area),
      projectId: pick(args.projectId, existing.projectId),
      goalId: pick(args.goalId, existing.goalId),
      rrule: pick(args.rrule, existing.rrule),
      notes: args.notes ?? existing.notes,
      remindMin: pick(args.remindMin, existing.remindMin),
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
