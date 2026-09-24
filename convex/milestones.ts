import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'

/* A goal's milestones (R3). Owned by the goal, never by a project: a project
   page shows its goal's timeline, so there is exactly one timeline per goal.
   They are a sequence the person orders by hand — nothing counts them into a
   percentage (PLAN.md §1). */

const MAX_ROWS = 100

async function ownedGoal(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  goalId: Id<'goals'>,
) {
  const goal = await ctx.db.get(goalId)
  if (goal === null || goal.ownerId !== ownerId) throw new Error('No such goal')
  return goal
}

async function ownedMilestone(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  milestoneId: Id<'milestones'>,
): Promise<Doc<'milestones'>> {
  const m = await ctx.db.get(milestoneId)
  if (m === null || m.ownerId !== ownerId) throw new Error('No such milestone')
  return m
}

async function siblings(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  goalId: Id<'goals'>,
) {
  return await ctx.db
    .query('milestones')
    .withIndex('by_owner_goal', (q) =>
      q.eq('ownerId', ownerId).eq('goalId', goalId),
    )
    .take(MAX_ROWS)
}

/**
 * A sortOrder that lands between two neighbours without renumbering the
 * rest: halfway between them, or one past either end. Siblings arrive in
 * index order, which is sortOrder order.
 */
function sortOrderAt(
  existing: Array<Doc<'milestones'>>,
  after: Id<'milestones'> | null | undefined,
): number {
  if (existing.length === 0) return 0
  if (after === undefined) return existing[existing.length - 1].sortOrder + 1
  if (after === null) return existing[0].sortOrder - 1
  const i = existing.findIndex((m) => m._id === after)
  if (i === -1) throw new Error('No such milestone')
  const next = existing.at(i + 1)
  return next === undefined
    ? existing[i].sortOrder + 1
    : (existing[i].sortOrder + next.sortOrder) / 2
}

export const create = mutation({
  args: {
    goalId: v.id('goals'),
    title: v.string(),
    dueDate: v.optional(v.string()),
    dueTime: v.optional(v.string()),
    /* Where on the line (24 Sep: a + between any two steps). A milestone
       id puts it right after that step; null puts it first; absent puts it
       last, which is what adding always did. */
    after: v.optional(v.union(v.id('milestones'), v.null())),
  },
  returns: v.id('milestones'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedGoal(ctx, ownerId, args.goalId)
    const title = args.title.trim()
    if (title.length === 0) throw new Error('A milestone needs a title')
    if (args.dueTime !== undefined && args.dueDate === undefined) {
      throw new Error('A time needs a day')
    }

    const existing = await siblings(ctx, ownerId, args.goalId)
    return await ctx.db.insert('milestones', {
      ownerId,
      goalId: args.goalId,
      title,
      dueDate: args.dueDate,
      dueTime: args.dueTime,
      sortOrder: sortOrderAt(existing, args.after),
    })
  },
})

/* By a URL-shaped id, like goals.get: a bad or foreign id is an empty list. */
export const listByGoal = query({
  args: { goalId: v.string() },
  returns: v.array(schema.doc('milestones')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const goalId = ctx.db.normalizeId('goals', args.goalId)
    if (goalId === null) return []
    return await siblings(ctx, ownerId, goalId)
  },
})

/**
 * Milestones due within a span of days, for the calendar (R3b, 20 Sep).
 *
 * The bounds are local calendar days as "YYYY-MM-DD", inclusive of `from` and
 * exclusive of `to`, because that is how a due day is stored — and because
 * the server does not know what day it is where you are, so the window has to
 * be named by the caller, the same way month and week bounds already are
 * (convex/aggregate.ts).
 *
 * A milestone with no day is not due anywhere and never appears: the index
 * skips rows whose `dueDate` is undefined.
 */
export const dueInRange = query({
  args: { from: v.string(), to: v.string() },
  returns: v.array(schema.doc('milestones')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    return await ctx.db
      .query('milestones')
      .withIndex('by_owner_due', (q) =>
        q
          .eq('ownerId', ownerId)
          .gte('dueDate', args.from)
          .lt('dueDate', args.to),
      )
      .take(MAX_ROWS)
  },
})

/* Reaching a milestone is not reaching the goal — closing a goal is its own
   act, on the goal itself. */
export const setReached = mutation({
  args: { milestoneId: v.id('milestones'), reached: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedMilestone(ctx, ownerId, args.milestoneId)
    await ctx.db.patch(args.milestoneId, {
      reachedAt: args.reached ? Date.now() : undefined,
    })
    return null
  },
})

export const update = mutation({
  args: {
    milestoneId: v.id('milestones'),
    title: v.optional(v.string()),
    dueDate: v.optional(v.union(v.string(), v.null())),
    dueTime: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const m = await ownedMilestone(ctx, ownerId, args.milestoneId)
    const title = args.title === undefined ? m.title : args.title.trim()
    if (title.length === 0) throw new Error('A milestone needs a title')

    const dueDate =
      args.dueDate === undefined ? m.dueDate : (args.dueDate ?? undefined)

    /* Asking for an hour on a milestone that has no day is a mistake worth
       saying out loud. Clearing the day is not — it silently takes the hour
       with it, because "by Friday at 14:00" minus Friday is not a due date.
       Clearing only the hour leaves the day: "by Friday" still holds. */
    if (args.dueTime != null && dueDate === undefined) {
      throw new Error('A time needs a day')
    }
    const dueTime =
      dueDate === undefined
        ? undefined
        : args.dueTime === undefined
          ? m.dueTime
          : (args.dueTime ?? undefined)

    await ctx.db.patch(args.milestoneId, { title, dueDate, dueTime })
    return null
  },
})

/** One step earlier or later. At either end it is a no-op, not an error. */
export const move = mutation({
  args: {
    milestoneId: v.id('milestones'),
    direction: v.union(v.literal('earlier'), v.literal('later')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const m = await ownedMilestone(ctx, ownerId, args.milestoneId)
    const list = await siblings(ctx, ownerId, m.goalId)
    const i = list.findIndex((x) => x._id === m._id)
    const j = args.direction === 'earlier' ? i - 1 : i + 1
    if (j < 0 || j >= list.length) return null
    await ctx.db.patch(list[i]._id, { sortOrder: list[j].sortOrder })
    await ctx.db.patch(list[j]._id, { sortOrder: list[i].sortOrder })
    return null
  },
})

/* A waiting task, moved onto the line (24 Sep). Artem: "maybe even add it
   as a milestone … drag and insert between milestones" — and moved, not
   linked: the task becomes the step.

   The task is archived rather than deleted. It may carry notes and files a
   step cannot hold; archived, nothing is lost, and backToTask (the Undo)
   has something to bring back. Its due date becomes the step's; without
   one the caller's guess for the gap is used. A scheduled time is not
   carried — a step's hour is a deadline, a task's is a booking.

   A task on today's three is refused: moving it would free a slot, and
   only dropFromToday may do that (CLAUDE.md). */
export const fromTask = mutation({
  args: {
    taskId: v.id('tasks'),
    /* As in create: a step id, or null for first. */
    after: v.union(v.id('milestones'), v.null()),
    /* The gap's date, used only when the task has none. */
    dueDate: v.optional(v.string()),
    /* The caller's local day, to know whether the task is on today. */
    today: v.string(),
  },
  returns: v.id('milestones'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const task = await ctx.db.get(args.taskId)
    if (task === null || task.ownerId !== ownerId) {
      throw new Error('No such task')
    }
    if (task.goalId === undefined) {
      throw new ConvexError('That task is not filed under a goal.')
    }
    if (task.status !== 'open' || task.archivedAt !== undefined) {
      throw new ConvexError('Only a waiting task can become a step.')
    }
    if (task.todayFor === args.today) {
      throw new ConvexError(
        "That one is on today's three. Drop it from today first.",
      )
    }
    await ownedGoal(ctx, ownerId, task.goalId)

    const existing = await siblings(ctx, ownerId, task.goalId)
    const milestoneId = await ctx.db.insert('milestones', {
      ownerId,
      goalId: task.goalId,
      title: task.title,
      dueDate: task.dueDate ?? args.dueDate,
      sortOrder: sortOrderAt(existing, args.after),
    })
    await ctx.db.patch(args.taskId, { archivedAt: Date.now() })
    return milestoneId
  },
})

/* The Undo of fromTask: the step goes and the task is back where it was.
   Both must be his, and the step must sit under the task's own goal — it
   will not delete an unrelated step. */
export const backToTask = mutation({
  args: { milestoneId: v.id('milestones'), taskId: v.id('tasks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const m = await ownedMilestone(ctx, ownerId, args.milestoneId)
    const task = await ctx.db.get(args.taskId)
    if (task === null || task.ownerId !== ownerId) {
      throw new Error('No such task')
    }
    if (task.goalId !== m.goalId) throw new Error('No such milestone')
    await ctx.db.delete(args.milestoneId)
    await ctx.db.patch(args.taskId, { archivedAt: undefined })
    return null
  },
})

export const remove = mutation({
  args: { milestoneId: v.id('milestones') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedMilestone(ctx, ownerId, args.milestoneId)
    await ctx.db.delete(args.milestoneId)
    return null
  },
})
