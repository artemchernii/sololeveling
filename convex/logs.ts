import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { requireLiveArea } from './areas'
import { mutation, query } from './_generated/server'
import schema, { areaSlug } from './schema'

/* Quick capture lands here (PLAN.md §3). A log is evidence: something that
   happened, which the user confirmed. Never written as a side-effect of
   completing a task — that writes its own 'task_done' row and stops (§3b.1). */

const MAX_ROWS = 200
const FUTURE_GRACE_MS = 5 * 60_000
/* Enough history to find five different lines in, when the last few days were
   the same gym session over and over. */
const RECENT_ROWS = 40
/* Twelve weeks of one area's whole log stream, generously — the same
   headroom aggregate.ts's CATEGORY_DAYS_ROWS gives categoryDays over the same
   window: an area's rows share one cap regardless of kind, so a weight costs
   the same slot as a workout. */
const AREA_ROWS = 1500

export const logKindValidator = v.union(
  v.literal('workout'),
  v.literal('weight'),
  v.literal('expense'),
  v.literal('transfer'),
  v.literal('income'),
  v.literal('session'),
  v.literal('conversation'),
  v.literal('event'),
  v.literal('people_met'),
  v.literal('task_done'),
  v.literal('piece'),
  /* Something taken rather than something done (R6b): protein, creatine,
     a vitamin. Deliberately NOT a workout — the dashboard's Body tile counts
     kind:'workout' (aggregate.ts TILE_KINDS), so a creatine filed as one
     would make the morning screen read "30 workouts this month". */
  v.literal('intake'),
  v.literal('note'),
  v.literal('idea'),
  v.literal('custom'),
)

export const create = mutation({
  args: {
    kind: logKindValidator,
    area: areaSlug,
    occurredAt: v.number(),
    value: v.optional(v.number()),
    unit: v.optional(v.string()),
    text: v.optional(v.string()),
    /* What kind of thing this was, within its kind: 'gym' / 'stretch' for a
       workout, 'supplements' for an intake, 'class' / 'practice' for a
       session. A plain string, not an enum — R6 was a row spent learning what
       a fixed set costs, and a new type here is a word typed into the capture
       chip rather than a deploy. */
    category: v.optional(v.string()),
    taskId: v.optional(v.id('tasks')),
    projectId: v.optional(v.id('projects')),
  },
  returns: v.id('logs'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    await requireLiveArea(ctx, ownerId, args.area)

    /* 'task_done' is the one kind this function will not write. It means
       "a task was ticked", and only tasks.complete may say that (§3b.1) —
       otherwise capture becomes a way to fake shipped work. */
    if (args.kind === 'task_done') {
      throw new Error('task_done is written by tasks.complete, not by capture')
    }

    /* A note is something written down, not something that happened, and it
       has one home: the notes table, where the Notes page and search can find
       it. A log of kind 'note' was a second, invisible copy of the same idea —
       the Notes page never showed one. Refused here so the Log modal cannot
       drift back into writing them. */
    if (args.kind === 'note') {
      throw new Error('A note is written to notes, not logged')
    }

    /* Capture can be back-dated now, so it can also be forward-dated by a
       slip. A log is evidence that something happened, and nothing has
       happened in the future — that is intent, which is a task. Five minutes
       of grace for a phone whose clock runs a little ahead. */
    if (args.occurredAt > Date.now() + FUTURE_GRACE_MS) {
      throw new Error('A log is something that happened — not in the future')
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
      /* Absent rather than `{ category: undefined }`: an empty meta object on
         every row is a stored fact that says nothing. */
      meta:
        args.category === undefined ? undefined : { category: args.category },
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
 * The latest logs, newest first, for the capture modal's "recent" list — so
 * yesterday's gym is one tap away. The modal turns them into lines and
 * de-duplicates; this only reads.
 *
 * No time argument on purpose. `listSince(Date.now() - …)` would be a new
 * argument on every render, and a new subscription with it.
 */
export const recent = query({
  args: {},
  returns: v.array(schema.doc('logs')),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .take(RECENT_ROWS)
    /* A ticked task is not something you log by hand (§3b.1), so it is not
       something to offer again. Filtered after the take rather than through
       the index: the index is still owner-scoped, and this only drops rows
       from a bounded page. */
    return rows.filter((row) => row.kind !== 'task_done')
  },
})

/**
 * The distinct categories already present in your own logs of one kind — the
 * suggestions under the capture modal's category chip.
 *
 * Words, not numbers, which is why it lives here and not in aggregate.ts: it
 * is a read of your own rows, the same shape as search.ts, and nothing on
 * screen divides by it or counts it.
 */
export const categories = query({
  args: { kind: logKindValidator },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .take(MAX_ROWS)

    const seen = new Set<string>()
    for (const row of rows) {
      if (row.kind !== args.kind) continue
      const category = row.meta?.category
      if (category !== undefined && category.length > 0) seen.add(category)
    }
    return [...seen].sort()
  },
})

/**
 * A project's own session logs for a period, newest first (20 Sep).
 *
 * "What if I logged more time than I should" — the answer is the same one
 * `remove` has always given: a log is not edited into a different truth, it is
 * deleted and logged again. This is the list that makes that a two-second job
 * rather than a hunt, so the correction path stays the append-only one.
 */
export const listForProject = query({
  args: {
    projectId: v.id('projects'),
    start: v.number(),
    end: v.number(),
  },
  returns: v.array(schema.doc('logs')),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_project_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('projectId', args.projectId)
          .gte('occurredAt', args.start)
          .lt('occurredAt', args.end),
      )
      .order('desc')
      .take(RECENT_ROWS)
    return rows.filter((row) => row.kind === 'session')
  },
})

/**
 * Everything filed under one area since a time, newest first — RecentBody's
 * feed on Body, and Languages' after it (R6b-b reuses this the way it reuses
 * DayStrip and categoryDays).
 *
 * Scoped through `by_owner_area_time` rather than read broad and filtered in
 * the component: `listSince` reads the newest rows across every area, so a
 * body-only list built by filtering its result afterward would truncate
 * quietly whenever other areas crowded body rows out of the shared cap — the
 * same class of bug `categoryDays` and `stateHistory` were fixed for.
 * `complete` says the same thing their own row bounds say.
 */
export const listForArea = query({
  args: {
    area: areaSlug,
    /** Epoch ms, inclusive. */
    since: v.number(),
  },
  returns: v.object({
    rows: v.array(schema.doc('logs')),
    complete: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_area_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('area', args.area)
          .gte('occurredAt', args.since),
      )
      .order('desc')
      .take(AREA_ROWS)
    return {
      rows,
      /* Newest first with a cap: hitting it drops the OLDEST rows in the
         window, not the newest — the same "older … not all stored" a reader
         sees from Consistency and WeightLine when their own reads truncate. */
      complete: rows.length < AREA_ROWS,
    }
  },
})

/**
 * The badge is the editor. `area` is filing, not evidence — a mis-filed note
 * gets corrected here, while kind, occurredAt, value and text stay immutable.
 * A wrong workout is deleted and re-logged, never edited into a different truth.
 */
export const setArea = mutation({
  args: { logId: v.id('logs'), area: areaSlug },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    await requireLiveArea(ctx, ownerId, args.area)
    const log = await ctx.db.get(args.logId)
    if (log === null || log.ownerId !== ownerId) {
      throw new Error('No such log')
    }
    await ctx.db.patch(args.logId, { area: args.area })
    return null
  },
})

/**
 * Correct a logged number in place (20 Sep, his call).
 *
 * Until today a log's value was immutable and the only correction was `remove`
 * plus logging it again — "a log is never edited into a different truth". He
 * asked twice for a mistyped duration to be fixable where it is shown, and
 * overruled the rule; PLAN.md §2 records that. The reasoning that survives is
 * narrower and still holds: a correction must not be able to make two stored
 * facts disagree.
 *
 * So `weight` is refused here. A weight log writes a `stateSnapshots` row that
 * `remove` deletes alongside it, and editing the log alone would leave the
 * displayed weight contradicting its own evidence. Those still go through
 * remove-and-log-again.
 */
export const setValue = mutation({
  args: { logId: v.id('logs'), value: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const log = await ctx.db.get(args.logId)
    if (log === null || log.ownerId !== ownerId) {
      throw new Error('No such log')
    }
    if (log.kind === 'weight') {
      throw new ConvexError(
        'A weight is deleted and logged again, so its snapshot goes with it.',
      )
    }
    if (!Number.isFinite(args.value) || args.value <= 0) {
      throw new ConvexError('That is not a number of minutes.')
    }
    await ctx.db.patch(args.logId, { value: args.value })
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
