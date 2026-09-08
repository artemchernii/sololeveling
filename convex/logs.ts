import { v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import schema, { areaValidator } from './schema'

/* Quick capture lands here (PLAN.md §3). A log is evidence: something that
   happened, which the user confirmed. Never written as a side-effect of
   completing a task — that writes its own 'task_done' row and stops (§3b.1). */

const MAX_ROWS = 200

const logKindValidator = v.union(
  v.literal('workout'),
  v.literal('weight'),
  v.literal('expense'),
  v.literal('transfer'),
  v.literal('session'),
  v.literal('conversation'),
  v.literal('event'),
  v.literal('people_met'),
  v.literal('task_done'),
  v.literal('piece'),
  v.literal('note'),
  v.literal('idea'),
  v.literal('custom'),
)

export const create = mutation({
  args: {
    kind: logKindValidator,
    area: areaValidator,
    occurredAt: v.number(),
    value: v.optional(v.number()),
    unit: v.optional(v.string()),
    text: v.optional(v.string()),
    taskId: v.optional(v.id('tasks')),
    projectId: v.optional(v.id('projects')),
  },
  returns: v.id('logs'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    /* 'task_done' is the one kind this function will not write. It means
       "a task was ticked", and only tasks.complete may say that (§3b.1) —
       otherwise capture becomes a way to fake shipped work. */
    if (args.kind === 'task_done') {
      throw new Error('task_done is written by tasks.complete, not by capture')
    }

    const logId = await ctx.db.insert('logs', {
      ownerId,
      kind: args.kind,
      area: args.area,
      occurredAt: args.occurredAt,
      value: args.value,
      unit: args.unit,
      text: args.text,
      taskId: args.taskId,
      projectId: args.projectId,
    })

    /* §2's stated side-effect: a weight is both an event and a new current
       state. Convex has no triggers, so the mutation does it. */
    if (args.kind === 'weight' && args.value !== undefined) {
      await ctx.db.insert('stateSnapshots', {
        ownerId,
        area: 'body',
        key: 'weight',
        value: args.value,
        unit: args.unit ?? 'kg',
        recordedAt: args.occurredAt,
      })
    }

    return logId
  },
})

/** What you logged in a window — the feedback that capture worked. */
export const listSince = query({
  args: { since: v.number() },
  returns: v.array(schema.doc('logs')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    return await ctx.db
      .query('logs')
      .withIndex('by_owner_time', (q) =>
        q.eq('ownerId', ownerId).gte('occurredAt', args.since),
      )
      .order('desc')
      .take(MAX_ROWS)
  },
})

/**
 * The badge is the editor. `area` is filing, not evidence — a mis-filed note
 * gets corrected here, while kind, occurredAt, value and text stay immutable.
 * A wrong workout is deleted and re-logged, never edited into a different truth.
 */
export const setArea = mutation({
  args: { logId: v.id('logs'), area: areaValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const log = await ctx.db.get(args.logId)
    if (log === null || log.ownerId !== ownerId) {
      throw new Error('No such log')
    }
    await ctx.db.patch(args.logId, { area: args.area })
    return null
  },
})

/**
 * The correction path for a log that should not exist — a mis-typed weight, a
 * workout logged twice. Append-only means a log is never edited into a
 * different truth; it does not mean a mistake is permanent.
 *
 * A weight's stateSnapshot is deliberately left behind: 'latest row wins', so
 * removing the log without removing the snapshot would leave the displayed
 * weight disagreeing with the evidence. Both go.
 */
export const remove = mutation({
  args: { logId: v.id('logs') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const log = await ctx.db.get(args.logId)
    if (log === null || log.ownerId !== ownerId) {
      throw new Error('No such log')
    }

    if (log.kind === 'weight') {
      const snapshots = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', 'weight')
            .eq('recordedAt', log.occurredAt),
        )
        .take(10)
      for (const snapshot of snapshots) {
        await ctx.db.delete(snapshot._id)
      }
    }

    await ctx.db.delete(args.logId)
    return null
  },
})
