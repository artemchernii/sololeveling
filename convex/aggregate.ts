import { v } from 'convex/values'

import { requireUser } from './auth'
import { logKindValidator } from './logs'
import { areaValidator } from './schema'
import type { Tile } from './schema'
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
 * Rows in `tasks` matching a filter, per project. The projects grid's
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

/** tile -> the log it counts. The one place this mapping lives.

    Portuguese counts sessions *filed under Portuguese*, not every session.
    It was kind alone while `pt` was the only thing that wrote a session; once
    `work` and a project could write one too, a morning at the office would
    have counted as Portuguese practice. Every other tile's kind is written by
    one area only, so kind still says enough for them. */
const TILE_KINDS: Record<
  'projects' | 'portuguese' | 'body' | 'money' | 'style' | 'social',
  { kind: string; area?: string }
> = {
  projects: { kind: 'task_done' },
  portuguese: { kind: 'session', area: 'portuguese' },
  body: { kind: 'workout' },
  money: { kind: 'transfer' },
  style: { kind: 'piece' },
  social: { kind: 'event' },
}

function countsFor(
  tile: keyof typeof TILE_KINDS,
  log: { kind: string; area: string },
): boolean {
  const rule = TILE_KINDS[tile]
  return (
    log.kind === rule.kind &&
    (rule.area === undefined || log.area === rule.area)
  )
}

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

      for (const tile of Object.keys(TILE_KINDS) as Array<
        keyof typeof TILE_KINDS
      >) {
        if (countsFor(tile, log)) {
          counts[tile][bucket] += 1
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
      for (const tile of Object.keys(TILE_KINDS) as Array<
        keyof typeof TILE_KINDS
      >) {
        if (countsFor(tile, log)) {
          weeks[index][tile] += 1
        }
      }
    }

    return weeks
  },
})

/* ---------------------------------------------------------------------------
   Targets — a goal's targetValue, the one denominator §1 allows a count.

   Per tile, in the same fixed shape monthCounts has, null where none is set.
   Handed over beside the counts and never divided by them here: "5 of 9" is
   two values a component composes, and a ratio returned from this file would
   make the wrong thing easy.
   ------------------------------------------------------------------------ */

const tileTarget = v.union(v.number(), v.null())

export const tileTargets = query({
  args: {},
  returns: v.object({
    projects: tileTarget,
    portuguese: tileTarget,
    body: tileTarget,
    money: tileTarget,
    style: tileTarget,
    social: tileTarget,
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)

    const targets: Record<Tile, number | null> = {
      projects: null,
      portuguese: null,
      body: null,
      money: null,
      style: null,
      social: null,
    }

    /* Newest first: if two active goals ever claim a tile, the later wins,
       the same one goals.setTileTarget would change. */
    const goals = await ctx.db
      .query('goals')
      .withIndex('by_owner_status', (q) =>
        q.eq('ownerId', ownerId).eq('status', 'active'),
      )
      .order('desc')
      .take(MAX_ROWS)

    for (const goal of goals) {
      if (
        goal.tile !== undefined &&
        goal.targetValue !== undefined &&
        targets[goal.tile] === null
      ) {
        targets[goal.tile] = goal.targetValue
      }
    }

    return targets
  },
})

/* ---------------------------------------------------------------------------
   Source 2 — the latest stateSnapshots row for a key.

   The keys the §3 strip reads, fixed here for the same reason the tiles are:
   a strip driven by "whatever keys exist" would change shape as a side-effect
   of logging a weight.

   Targets are not here. Until R2 "2 of 4 sessions" read a `sessions_target`
   state row; a target is a goal's targetValue now (tileTargets, just above),
   set on its tile, so there is one place a target lives. Old rows stay in
   the table and are simply not read.
   ------------------------------------------------------------------------ */

export const STATE_KEYS = ['cefr_level', 'weight', 'net_worth'] as const

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
    weight: stateValue,
    net_worth: stateValue,
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
      weight: await latest('weight'),
      net_worth: await latest('net_worth'),
    }
  },
})

/**
 * Logs of one kind in a period: the "4 this month" beside a line you have just
 * logged, so Enter shows that it counted and not only that it saved.
 *
 * Source 1, a log count, the same as the tiles — for any kind capture can
 * write, not only the six the dashboard has room for. A count and nothing
 * else: not a streak, not a rank, not "4th". An ordinal would claim an order,
 * and a back-dated log is not the latest one just because it was typed last.
 *
 * Boundaries arrive as arguments, as they do for months and weeks.
 */
export const kindCount = query({
  args: {
    kind: logKindValidator,
    /** Narrows a kind written by more than one verb — a session filed under
        Portuguese is not a work session, and a count that mixed them would
        say "5 this month" about neither. */
    area: v.optional(areaValidator),
    /** Narrows to time on one project. */
    projectId: v.optional(v.id('projects')),
    /** Epoch ms, local midnight — inclusive. */
    start: v.number(),
    /** Epoch ms, local midnight — exclusive. */
    end: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .gte('occurredAt', args.start)
          .lt('occurredAt', args.end),
      )
      .take(MAX_ROWS)
    return rows.filter(
      (row) =>
        row.kind === args.kind &&
        (args.area === undefined || row.area === args.area) &&
        (args.projectId === undefined || row.projectId === args.projectId),
    ).length
  },
})

/**
 * Time on one project in a period: the minutes on its session logs, added
 * up, and how many sessions there were — "7h 30m this month · 9 sessions".
 *
 * Source 1. A sum rather than a count, and still only the log rows
 * themselves: each minute is one you logged with the project's verb
 * (`oreum 45`), in its own unit. Sessions only — a ticked task on the project
 * is intent, not time (§3b.1).
 *
 * The id comes from the page's URL, so it is a string: a bad or foreign id
 * reads as nothing, and the page already says "No such project".
 */
export const projectTime = query({
  args: {
    projectId: v.string(),
    /** Epoch ms, local midnight — inclusive. */
    start: v.number(),
    /** Epoch ms, local midnight — exclusive. */
    end: v.number(),
  },
  returns: v.object({ minutes: v.number(), sessions: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const projectId = ctx.db.normalizeId('projects', args.projectId)
    if (projectId === null) return { minutes: 0, sessions: 0 }

    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_project_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('projectId', projectId)
          .gte('occurredAt', args.start)
          .lt('occurredAt', args.end),
      )
      .take(MAX_ROWS)

    let minutes = 0
    let sessions = 0
    for (const row of rows) {
      if (row.kind !== 'session') continue
      sessions += 1
      minutes += row.value ?? 0
    }
    return { minutes, sessions }
  },
})
