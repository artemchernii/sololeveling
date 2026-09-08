import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema, { areaValidator } from './schema'

/* PLAN.md §2 and §3c. Everything here opens with requireUser and reads through
   an owner-leading index.

   Dates arrive as ISO strings from the client rather than being computed here:
   the server has no idea what "today" is for a person in Lisbon, and a query
   that read the wall clock would not rerun when the day changed anyway. */

const TODAY_LIMIT = 3

/* Bounded because every list in this app is a human's own list. If either of
   these ever truncates, the product has a bigger problem than pagination. */
const MAX_ROWS = 200

async function ownedTask(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  taskId: Id<'tasks'>,
): Promise<Doc<'tasks'>> {
  const task = await ctx.db.get(taskId)
  /* Same error either way: "not yours" and "does not exist" must be
     indistinguishable, or the message becomes a way to probe for ids. */
  if (task === null || task.ownerId !== ownerId) {
    throw new Error('No such task')
  }
  return task
}

/** A task is creatable from a title and nothing else (PLAN.md §3b.3). */
export const create = mutation({
  args: {
    title: v.string(),
    area: v.optional(areaValidator),
    notes: v.optional(v.string()),
    projectId: v.optional(v.id('projects')),
    goalId: v.optional(v.id('goals')),
    dueDate: v.optional(v.string()),
    durationMin: v.optional(v.number()),
  },
  returns: v.id('tasks'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    const title = args.title.trim()
    if (title.length === 0) {
      throw new Error('A task needs a title')
    }

    return await ctx.db.insert('tasks', {
      ownerId,
      title,
      area: args.area,
      notes: args.notes,
      projectId: args.projectId,
      goalId: args.goalId,
      dueDate: args.dueDate,
      durationMin: args.durationMin,
      priority: 0,
      status: 'open',
    })
  },
})

/** The day's three. `today` is the caller's local ISO date. */
export const listToday = query({
  args: { today: v.string() },
  returns: v.array(schema.doc('tasks')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    return await ctx.db
      .query('tasks')
      .withIndex('by_owner_today', (q) =>
        q.eq('ownerId', ownerId).eq('todayFor', args.today),
      )
      .take(TODAY_LIMIT + 1)
  },
})

/**
 * Everything open and unpicked. The only place unpicked tasks live (§3c.3) —
 * no other screen may show a count of these.
 *
 * The index gives owner + status; `todayFor` cannot join it without a third
 * index that exists only for this read, so it is a filter over an already
 * owner-scoped, status-scoped scan.
 */
export const listBacklog = query({
  args: {},
  returns: v.array(schema.doc('tasks')),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    return await ctx.db
      .query('tasks')
      .withIndex('by_owner_status', (q) =>
        q.eq('ownerId', ownerId).eq('status', 'open'),
      )
      .filter((q) => q.eq(q.field('todayFor'), undefined))
      .take(MAX_ROWS)
  },
})

/**
 * §3c.1: three a day, hard, enforced here rather than suggested in the UI.
 * Choosing three is the planning ritual; there is no other one.
 */
export const pickForToday = mutation({
  args: { taskId: v.id('tasks'), today: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const task = await ownedTask(ctx, ownerId, args.taskId)

    if (task.todayFor === args.today) {
      return null
    }

    const picked = await ctx.db
      .query('tasks')
      .withIndex('by_owner_today', (q) =>
        q.eq('ownerId', ownerId).eq('todayFor', args.today),
      )
      .take(TODAY_LIMIT)

    if (picked.length >= TODAY_LIMIT) {
      /* Read by the UI, so it travels as data rather than a stack trace. */
      throw new ConvexError('TODAY_FULL')
    }

    await ctx.db.patch(args.taskId, { todayFor: args.today })
    return null
  },
})

/** Frees a slot without completing anything. Finish one or drop one. */
export const dropFromToday = mutation({
  args: { taskId: v.id('tasks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedTask(ctx, ownerId, args.taskId)
    await ctx.db.patch(args.taskId, { todayFor: undefined })
    return null
  },
})

/**
 * §3b.1. Completing a task says you meant to do a thing. It writes exactly one
 * log, of kind 'task_done', and NOTHING else. A workout is a separate row the
 * user confirms with one tap; this function must never write it.
 */
export const complete = mutation({
  args: { taskId: v.id('tasks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const task = await ownedTask(ctx, ownerId, args.taskId)

    if (task.status === 'done') {
      return null
    }

    const completedAt = Date.now()
    await ctx.db.patch(args.taskId, {
      status: 'done',
      completedAt,
      todayFor: undefined,
    })

    await ctx.db.insert('logs', {
      ownerId,
      kind: 'task_done',
      area: task.area ?? 'life',
      occurredAt: completedAt,
      text: task.title,
      taskId: task._id,
      projectId: task.projectId,
    })

    return null
  },
})

/** The badge is the editor: filing is a correction, not a rewrite. */
export const setArea = mutation({
  args: { taskId: v.id('tasks'), area: areaValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedTask(ctx, ownerId, args.taskId)
    await ctx.db.patch(args.taskId, { area: args.area })
    return null
  },
})

/**
 * A task written by mistake should not be permanent. Deleting is not the same
 * as completing: complete says "I did this" and writes evidence, remove says
 * "this was never a thing" and writes nothing.
 *
 * Any 'task_done' log a previous completion wrote is left alone — that log is
 * a record of a day, and deleting the task does not un-happen it.
 */
export const remove = mutation({
  args: { taskId: v.id('tasks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedTask(ctx, ownerId, args.taskId)
    await ctx.db.delete(args.taskId)
    return null
  },
})

/**
 * Attach a task to a chain, or cut it loose. A task is creatable from a title
 * alone (§3b.3), so this is how a loose one joins a chain later — which is the
 * common case, since quick capture writes titles and nothing else.
 */
export const setProject = mutation({
  args: {
    taskId: v.id('tasks'),
    projectId: v.union(v.id('projects'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedTask(ctx, ownerId, args.taskId)

    if (args.projectId === null) {
      await ctx.db.patch(args.taskId, {
        projectId: undefined,
        goalId: undefined,
      })
      return null
    }

    const project = await ctx.db.get(args.projectId)
    if (project === null || project.ownerId !== ownerId) {
      throw new Error('No such project')
    }

    /* goalId is denormalised from the chain so a task can be filtered by goal
       without walking through its project. The project is the authority; this
       follows it, and is rewritten whenever the task moves. */
    await ctx.db.patch(args.taskId, {
      projectId: args.projectId,
      goalId: project.goalId,
    })
    return null
  },
})

/** One chain's work, newest last. Open tasks first — the rest is history. */
export const listByProject = query({
  args: { projectId: v.id('projects') },
  returns: v.array(schema.doc('tasks')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const project = await ctx.db.get(args.projectId)
    if (project === null || project.ownerId !== ownerId) {
      throw new Error('No such project')
    }

    return await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .take(MAX_ROWS)
  },
})
