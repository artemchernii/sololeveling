import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { requireLiveArea } from './areas'
import { removeFor } from './attachments'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema, { areaSlug } from './schema'

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
    area: v.optional(areaSlug),
    notes: v.optional(v.string()),
    projectId: v.optional(v.id('projects')),
    goalId: v.optional(v.id('goals')),
    dueDate: v.optional(v.string()),
    durationMin: v.optional(v.number()),
  },
  returns: v.id('tasks'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    if (args.area !== undefined) {
      await requireLiveArea(ctx, ownerId, args.area)
    }

    const title = args.title.trim()
    if (title.length === 0) {
      throw new Error('A task needs a title')
    }

    /* An id is only a claim until the row behind it is loaded and found to
       be yours. A project no longer carries a goal, so the two are checked
       separately and a task may hold either, both or neither (21 Sep). */
    const goalId = args.goalId
    let area = args.area
    if (args.projectId !== undefined) {
      const project = await ctx.db.get(args.projectId)
      if (project === null || project.ownerId !== ownerId) {
        throw new Error('No such project')
      }
    }
    if (args.goalId !== undefined) {
      const goal = await ctx.db.get(args.goalId)
      if (goal === null || goal.ownerId !== ownerId) {
        throw new Error('No such goal')
      }
    }

    /* The area comes down the chain rather than being asked for (20 Sep).
       Artem, at a task made on a project and badged `unfiled`: "we won't set
       it, it should be by default either project or SoloLeveling" — and then,
       looking at one he had filed by hand: "lets add Projects in the list now
       and by default tasks create from projects have type projects."

       So there are two rules, in this order:

       1. A task on a project is `projects`. That is the tenth area, added the
          same day and for this — see the note on `areaSlug`.
       2. A task on a goal takes the goal's area, which is the rule the app
          already keeps one level up: a project has no area of its own, it
          inherits the kind of the goal it answers to (projects.ts).

       A passed area beats both: ⌘K parses one out of what you typed, and a
       word you chose is not a default. */
    if (area === undefined) {
      if (args.projectId !== undefined) {
        area = 'projects'
      } else if (goalId !== undefined) {
        const goal = await ctx.db.get(goalId)
        if (goal !== null && goal.ownerId === ownerId) area = goal.area
      }
    }

    return await ctx.db.insert('tasks', {
      ownerId,
      title,
      area,
      notes: args.notes,
      projectId: args.projectId,
      goalId,
      dueDate: args.dueDate,
      durationMin: args.durationMin,
      priority: 0,
      status: 'open',
    })
  },
})

/** The day's three, in the order they were picked. `today` is the caller's
    local ISO date. Rows picked before `pickedAt` existed fall back to their
    creation time, which is what the order was until then. */
export const listToday = query({
  args: { today: v.string() },
  returns: v.array(schema.doc('tasks')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('tasks')
      .withIndex('by_owner_today', (q) =>
        q.eq('ownerId', ownerId).eq('todayFor', args.today),
      )
      .take(TODAY_LIMIT + 1)
    return rows.sort(
      (a, b) =>
        (a.pickedAt ?? a._creationTime) - (b.pickedAt ?? b._creationTime),
    )
  },
})

/**
 * Everything open and not on today. The only place unpicked tasks live
 * (§3c.3) — no other screen may show a count of these.
 *
 * "Not on today" rather than "never picked": `todayFor` is a date, and a
 * task left unfinished when its day ended still carries yesterday's. Until
 * 17 Sep this read only rows with no date at all, so an unticked one fell
 * off Today at midnight and landed nowhere. Now it is back here the next
 * morning, and the row can say which day it was chosen for.
 *
 * The index gives owner + status; `todayFor` cannot join it without a third
 * index that exists only for this read, so it is a filter over an already
 * owner-scoped, status-scoped scan.
 */
export const listBacklog = query({
  args: { today: v.string() },
  returns: v.array(schema.doc('tasks')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    return await ctx.db
      .query('tasks')
      .withIndex('by_owner_status', (q) =>
        q.eq('ownerId', ownerId).eq('status', 'open'),
      )
      .filter((q) => q.neq(q.field('todayFor'), args.today))
      .take(MAX_ROWS)
  },
})

/**
 * The Done tab on the backlog page: what was ticked, newest first. A read of
 * the rows themselves, not a count — nothing here totals anything.
 *
 * `since` is the start of the period, worked out on the client like every
 * other day or week boundary. With words to search for, Convex's search
 * index finds the titles and orders them by match; the period and bindings
 * narrow that. Without, the done-date index does the ordering and the
 * period is its range. Sorting by title or creation is the client's, over
 * what comes back.
 */
export const listDone = query({
  args: {
    since: v.optional(v.number()),
    search: v.optional(v.string()),
    area: v.optional(areaSlug),
    projectId: v.optional(v.id('projects')),
    goalId: v.optional(v.id('goals')),
  },
  returns: v.array(schema.doc('tasks')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    /* No requireLiveArea here: `area` narrows a read, it does not write one.
       Filtering by a slug that names nothing correctly returns nothing, and
       guarding a filter would only turn an empty list into an error. */
    const words = args.search?.trim() ?? ''

    const base =
      words.length > 0
        ? ctx.db
            .query('tasks')
            .withSearchIndex('search_title', (q) =>
              q.search('title', words).eq('ownerId', ownerId),
            )
            .filter((q) => q.eq(q.field('status'), 'done'))
        : ctx.db
            .query('tasks')
            .withIndex('by_owner_status_completed', (q) =>
              q
                .eq('ownerId', ownerId)
                .eq('status', 'done')
                .gte('completedAt', args.since ?? 0),
            )
            .order('desc')

    return await base
      .filter((q) =>
        q.and(
          args.since === undefined || words.length === 0
            ? true
            : q.gte(q.field('completedAt'), args.since),
          args.area === undefined ? true : q.eq(q.field('area'), args.area),
          args.projectId === undefined
            ? true
            : q.eq(q.field('projectId'), args.projectId),
          args.goalId === undefined
            ? true
            : q.eq(q.field('goalId'), args.goalId),
        ),
      )
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

    await ctx.db.patch(args.taskId, {
      todayFor: args.today,
      pickedAt: Date.now(),
    })
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
    await ctx.db.patch(args.taskId, {
      todayFor: undefined,
      pickedAt: undefined,
    })
    return null
  },
})

/**
 * §3b.1. Completing a task says you meant to do a thing. It writes exactly one
 * log, of kind 'task_done', and NOTHING else. A workout is a separate row the
 * user confirms with one tap; this function must never write it.
 *
 * It keeps `todayFor` (16 Sep). Until then finishing one cleared the slot, so
 * the card forgot what you had done and "three a day" was really three at a
 * time. A finished task stays in its slot, ticked, until the day ends; only
 * dropFromToday frees one.
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
    await ctx.db.patch(args.taskId, { status: 'done', completedAt })

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

/**
 * A tick taken back. The task is open again and the `task_done` log that
 * completing it wrote is deleted — a misclick is not evidence, and a tile
 * that counted it would be counting a slip. Only the log the completion
 * wrote goes; any workout or session logged from the follow-up was a
 * separate, deliberate tap and stays.
 */
export const reopen = mutation({
  args: { taskId: v.id('tasks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const task = await ownedTask(ctx, ownerId, args.taskId)
    if (task.status !== 'done') return null

    await ctx.db.patch(args.taskId, { status: 'open', completedAt: undefined })

    /* Owner-scoped through the index, then narrowed: logs have no index by
       task, and a completion is recent by construction. */
    const evidence = await ctx.db
      .query('logs')
      .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .filter((q) =>
        q.and(
          q.eq(q.field('taskId'), args.taskId),
          q.eq(q.field('kind'), 'task_done'),
        ),
      )
      .first()
    if (evidence !== null) await ctx.db.delete(evidence._id)
    return null
  },
})

/** The badge is the editor: filing is a correction, not a rewrite. */
export const setArea = mutation({
  args: { taskId: v.id('tasks'), area: areaSlug },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    await requireLiveArea(ctx, ownerId, args.area)
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
/** A title is a thing you get wrong the first time (20 Sep). Every other
 * field on a task could be corrected and the title could not, so a typo meant
 * deleting the task and writing it again — losing its notes, its files and
 * its place in today's three. */
export const setTitle = mutation({
  args: { taskId: v.id('tasks'), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedTask(ctx, ownerId, args.taskId)
    const title = args.title.trim()
    if (title.length === 0) {
      throw new Error('A task needs a title')
    }
    await ctx.db.patch(args.taskId, { title })
    return null
  },
})

/**
 * What a task actually involves, beyond its title (20 Sep).
 *
 * The field has existed since R1 and nothing ever wrote to it — a task was a
 * title and a checkbox, which he called out three times. Prompts and links
 * live here as text; files are rows in `attachments`.
 */
export const setNotes = mutation({
  args: { taskId: v.id('tasks'), notes: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedTask(ctx, ownerId, args.taskId)
    const trimmed = args.notes.trim()
    await ctx.db.patch(args.taskId, {
      notes: trimmed.length === 0 ? undefined : trimmed,
    })
    return null
  },
})

export const remove = mutation({
  args: { taskId: v.id('tasks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedTask(ctx, ownerId, args.taskId)
    /* Its files go with it, or they become bytes nothing can reach. */
    await removeFor(ctx, ownerId, { taskId: args.taskId })
    await ctx.db.delete(args.taskId)
    return null
  },
})

/**
 * Attach a task to a project, or cut it loose. A task is creatable from a title
 * alone (§3b.3), so this is how a loose one joins a project later — which is the
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
    const task = await ownedTask(ctx, ownerId, args.taskId)

    if (args.projectId === null) {
      await ctx.db.patch(args.taskId, { projectId: undefined })
      return null
    }

    const project = await ctx.db.get(args.projectId)
    if (project === null || project.ownerId !== ownerId) {
      throw new Error('No such project')
    }

    /* A project carries no goal any more (21 Sep), so filing a task under one
       says nothing about which goal it serves — the task's own `goalId` is
       left exactly as it was. */
    await ctx.db.patch(args.taskId, {
      projectId: args.projectId,
      /* Filing a task under a project is the same act as creating it there,
         so it files the same way (20 Sep). He added a task from the backlog,
         gave it SoloLeveling, and watched it stay `unfiled` — `create` had
         learned this rule an hour earlier and `setProject` had not.

         Only when nothing is set: an area he chose is his answer, and moving
         a task between projects must not quietly overwrite it. */
      area: task.area ?? 'projects',
    })
    return null
  },
})

/**
 * Bind a task to a goal directly, or cut it loose. For work that serves a
 * goal with no project under it — "buy protein" under "gain 5 kg of muscle"
 * (R3, 16 Sep: a goal need not have a project).
 *
 * A task under a project already carries that project's goal (setProject), so
 * choosing a goal here clears the project: the goal is now the authority.
 */
export const setGoal = mutation({
  args: {
    taskId: v.id('tasks'),
    goalId: v.union(v.id('goals'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedTask(ctx, ownerId, args.taskId)

    if (args.goalId !== null) {
      const goal = await ctx.db.get(args.goalId)
      if (goal === null || goal.ownerId !== ownerId) {
        throw new Error('No such goal')
      }
    }

    await ctx.db.patch(args.taskId, {
      goalId: args.goalId ?? undefined,
      projectId: undefined,
    })
    return null
  },
})

/** One project's work, newest last. Open tasks first — the rest is history. */
/* Read by the project page's URL, like projects.get: a bad or stale id is an
   empty list, not a throw — the page already says "No such project" from get.
   Someone else's project is empty too, which reveals nothing about it. */
export const listByProject = query({
  args: { projectId: v.string() },
  returns: v.array(schema.doc('tasks')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const projectId = ctx.db.normalizeId('projects', args.projectId)
    const project = projectId === null ? null : await ctx.db.get(projectId)
    if (project === null || project.ownerId !== ownerId) {
      return []
    }

    return await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', project._id))
      .take(MAX_ROWS)
  },
})

/**
 * Give a quest a time, or take it away. This is what puts a task on the TODAY
 * timeline (§3b.3) — an undated task stays in the checklist, which is the
 * normal case, not an error.
 */
/**
 * A due date, as an ISO date string (20 Sep).
 *
 * `dueDate` and its `by_owner_due` index have been in the schema since R1 and
 * no mutation ever wrote one, so the field could be read and indexed but never
 * set — the task row had nothing to draw. Distinct from `scheduledAt`, which
 * is a time the work sits in the week; a due date is when it is owed.
 */
export const setDueDate = mutation({
  args: {
    taskId: v.id('tasks'),
    dueDate: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedTask(ctx, ownerId, args.taskId)

    await ctx.db.patch(args.taskId, {
      dueDate:
        args.dueDate === null || args.dueDate === '' ? undefined : args.dueDate,
    })
    return null
  },
})

export const setSchedule = mutation({
  args: {
    taskId: v.id('tasks'),
    scheduledAt: v.union(v.number(), v.null()),
    durationMin: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedTask(ctx, ownerId, args.taskId)

    await ctx.db.patch(args.taskId, {
      scheduledAt: args.scheduledAt ?? undefined,
      durationMin: args.scheduledAt === null ? undefined : args.durationMin,
    })
    return null
  },
})

/**
 * Tasks with a time inside `[from, to)` — what the week view draws beside
 * events (PLAN §4 phase 5).
 *
 * Undated tasks are absent by construction rather than by filter: an absent
 * `scheduledAt` sorts before every number, so the range never reaches them.
 * That is the point — an undated task is a quest, and quests live on the
 * backlog page and nowhere else (§3c.3).
 */
export const listScheduledInRange = query({
  args: { from: v.number(), to: v.number() },
  returns: v.array(schema.doc('tasks')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    return await ctx.db
      .query('tasks')
      .withIndex('by_owner_scheduled', (q) =>
        q
          .eq('ownerId', ownerId)
          .gte('scheduledAt', args.from)
          .lt('scheduledAt', args.to),
      )
      .take(MAX_ROWS)
  },
})
