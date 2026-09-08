import { v } from 'convex/values'

import { requireUser } from './auth'
import { query } from './_generated/server'

/* PLAN.md §1: every number on screen comes from exactly one of four sources —
   a log count over a period, the latest stateSnapshots row for a key, an entity
   count over projects/tasks, or a stored external reading. All four live here
   and nowhere else; the fourth has no implementation yet, and arrives with
   Money. Components read these numbers; they never compute them.
 
   None of these can produce a score, an index or a percentage. `done` and
   `total` are handed over separately on purpose: a component may render
   "11 of 17", and a bar only where goals.targetValue gives a real denominator.
   Returning a ratio here would make the wrong thing easy. */

const MAX_ROWS = 500

/**
 * Rows in `tasks` matching a filter, per chain. The chains grid's
 * "11 of 17 tasks".
 *
 * Counted rather than stored: a denormalised counter would be a second source
 * of truth for the same fact, and the first thing to drift.
 */
export const entityCounts = query({
  args: {},
  returns: v.object({
    activeProjects: v.number(),
    focusProjects: v.number(),
    tasksByProject: v.record(
      v.string(),
      v.object({ done: v.number(), total: v.number(), open: v.number() }),
    ),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)

    const tasksByProject: Record<
      string,
      { done: number; total: number; open: number }
    > = {}

    for (const status of ['open', 'done', 'skipped'] as const) {
      const rows = await ctx.db
        .query('tasks')
        .withIndex('by_owner_status', (q) =>
          q.eq('ownerId', ownerId).eq('status', status),
        )
        .take(MAX_ROWS)

      for (const task of rows) {
        if (task.projectId === undefined) continue
        const key = task.projectId
        tasksByProject[key] ??= { done: 0, total: 0, open: 0 }
        tasksByProject[key].total += 1
        if (status === 'done') tasksByProject[key].done += 1
        if (status === 'open') tasksByProject[key].open += 1
      }
    }

    let activeProjects = 0
    let focusProjects = 0
    for (const status of ['focus', 'active'] as const) {
      const rows = await ctx.db
        .query('projects')
        .withIndex('by_owner_status', (q) =>
          q.eq('ownerId', ownerId).eq('status', status),
        )
        .take(MAX_ROWS)
      activeProjects += rows.length
      if (status === 'focus') focusProjects = rows.length
    }

    return { activeProjects, focusProjects, tasksByProject }
  },
})

/* ---------------------------------------------------------------------------
   Source 1 — log counts over a period.

   The six tiles of PLAN.md §3 item 4, in that order, as a fixed shape. NOT
   derived from the `area` enum: nine areas, six tiles, deliberately. Career,
   Knowledge and Life have no tile because nothing about them is countable
   per-month yet, and inventing a count for them is exactly the failure this
   whole file exists to prevent.

   Month boundaries arrive as arguments. The server does not know what month it
   is where you are, and a query does not rerun because a clock ticked.
   ------------------------------------------------------------------------ */

/** tile -> the log kind it counts. The one place this mapping lives. */
const TILE_KINDS = {
  projects: 'task_done',
  portuguese: 'session',
  body: 'workout',
  money: 'transfer',
  style: 'piece',
  social: 'event',
} as const

const tileCount = v.object({ now: v.number(), prev: v.number() })

export const monthCounts = query({
  args: {
    /** Epoch ms, local midnights: [prevStart, monthStart) and [monthStart, nextStart). */
    prevStart: v.number(),
    monthStart: v.number(),
    nextStart: v.number(),
  },
  returns: v.object({
    projects: tileCount,
    portuguese: tileCount,
    body: tileCount,
    money: tileCount,
    style: tileCount,
    social: tileCount,
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    /* One scan of the two months, bucketed here, rather than twelve queries.
       A personal month of logs is small; the bound is a guard, not a page. */
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .gte('occurredAt', args.prevStart)
          .lt('occurredAt', args.nextStart),
      )
      .take(MAX_ROWS)

    const counts = {
      projects: { now: 0, prev: 0 },
      portuguese: { now: 0, prev: 0 },
      body: { now: 0, prev: 0 },
      money: { now: 0, prev: 0 },
      style: { now: 0, prev: 0 },
      social: { now: 0, prev: 0 },
    }

    let total = 0
    for (const log of rows) {
      const bucket = log.occurredAt >= args.monthStart ? 'now' : 'prev'
      if (bucket === 'now') total += 1

      for (const [tile, kind] of Object.entries(TILE_KINDS)) {
        if (log.kind === kind) {
          counts[tile as keyof typeof counts][bucket] += 1
        }
      }
    }

    return { ...counts, total }
  },
})

/**
 * The same six tiles, over as many weeks as you hand it — the 12-week movement
 * table on the weekly review (§3).
 *
 * Counts only. "Rising" and "slipping" are not returned, and neither is a
 * delta: a difference between two of these is a comparison a component makes
 * from two source values, the way the dashboard renders "2 of 4". Returning a
 * trend from here would make it an unsanctioned source, and the sign of a
 * subtraction is not a measurement of anything. (§1 has four sources; a trend
 * is not one of them, and the fourth is an external reading, not a verdict.)
 *
 * Week boundaries arrive as arguments for the same reason month boundaries do:
 * the server does not know where you are, and weeks start on Monday only
 * because a person says so.
 */
export const weekCounts = query({
  args: {
    /** Local midnights, ascending, one per week. */
    starts: v.array(v.number()),
    /** The end of the last week — exclusive. */
    end: v.number(),
  },
  returns: v.array(
    v.object({
      start: v.number(),
      projects: v.number(),
      portuguese: v.number(),
      body: v.number(),
      money: v.number(),
      style: v.number(),
      social: v.number(),
      total: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    if (args.starts.length === 0) return []

    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .gte('occurredAt', args.starts[0])
          .lt('occurredAt', args.end),
      )
      .take(MAX_ROWS)

    const weeks = args.starts.map((start) => ({
      start,
      projects: 0,
      portuguese: 0,
      body: 0,
      money: 0,
      style: 0,
      social: 0,
      total: 0,
    }))

    for (const log of rows) {
      /* The last boundary at or below this log. Walked from the end because a
         review looks at recent weeks far more often than old ones. */
      let index = -1
      for (let i = weeks.length - 1; i >= 0; i--) {
        if (log.occurredAt >= weeks[i].start) {
          index = i
          break
        }
      }
      if (index === -1) continue

      weeks[index].total += 1
      for (const [tile, kind] of Object.entries(TILE_KINDS)) {
        if (log.kind === kind) {
          weeks[index][tile as keyof (typeof TILE_KINDS & object)] += 1
        }
      }
    }

    return weeks
  },
})

/* ---------------------------------------------------------------------------
   Source 2 — the latest stateSnapshots row for a key.

   The keys the §3 strip reads, fixed here for the same reason the tiles are:
   a strip driven by "whatever keys exist" would change shape as a side-effect
   of logging a weight.

   A target is a state value like any other. "2 of 4 sessions" is a log count
   over `sessions_target`; §3's Career row already reads this way
   (state `skills_logged` / `skills_target`). That is source 2 twice, not a new
   source — and it is the only thing a count may be divided by, besides a goal's
   own targetValue.
   ------------------------------------------------------------------------ */

export const STATE_KEYS = [
  'cefr_level',
  'sessions_target',
  'weight',
  'net_worth',
  'skills_logged',
  'skills_target',
] as const

const stateValue = v.union(
  v.object({
    value: v.optional(v.number()),
    textValue: v.optional(v.string()),
    unit: v.optional(v.string()),
    recordedAt: v.number(),
  }),
  v.null(),
)

export const currentState = query({
  args: {},
  /* A fixed shape, for the same reason monthCounts has one: a strip driven by
     "whatever keys exist" would change shape as a side-effect of logging a
     weight. Explicitly null when never recorded — a record type would tell
     TypeScript every key is always present, which is how a missing value
     becomes an invisible bug. */
  returns: v.object({
    cefr_level: stateValue,
    sessions_target: stateValue,
    weight: stateValue,
    net_worth: stateValue,
    skills_logged: stateValue,
    skills_target: stateValue,
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)

    async function latest(key: (typeof STATE_KEYS)[number]) {
      /* Latest row wins. Descending on [ownerId, key, recordedAt] means one
         document read per key, not a scan of every weigh-in ever logged. */
      const row = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q.eq('ownerId', ownerId).eq('key', key),
        )
        .order('desc')
        .first()

      return row === null
        ? null
        : {
            value: row.value,
            textValue: row.textValue,
            unit: row.unit,
            recordedAt: row.recordedAt,
          }
    }

    return {
      cefr_level: await latest('cefr_level'),
      sessions_target: await latest('sessions_target'),
      weight: await latest('weight'),
      net_worth: await latest('net_worth'),
      skills_logged: await latest('skills_logged'),
      skills_target: await latest('skills_target'),
    }
  },
})
