import { v } from 'convex/values'

import { requireUser } from './auth'
import { logKindValidator } from './logs'
import { areaSlug } from './schema'
import type { Tile } from './schema'
import { query } from './_generated/server'
import type { Doc } from './_generated/dataModel'

/* PLAN.md §1: every number on screen comes from exactly one of four sources —
   a log count over a period, the latest stateSnapshots row for a key, an entity
   count over projects/tasks, or a stored external reading. All four live here
   and nowhere else; the fourth's first reading is GitHub commits (R3c,
   convex/github.ts); prices arrive with Finances. Components read these numbers; they never compute them.
 
   None of these can produce a score, an index or a percentage. `done` and
   `total` are handed over separately on purpose: a component may render
   "11 of 17", and a bar only where goals.targetValue gives a real denominator.
   Returning a ratio here would make the wrong thing easy. */

const MAX_ROWS = 500
/* A year of commits on a busy repo. Read once for the heatmap. */
const YEAR_ROWS = 4000
/* Twelve weeks of one area's logs, generously: the longest strip categoryDays
   is asked to fill, at a ceiling well past what quick capture could fill it
   with. Its own bound because it shares an area's whole log stream with
   kinds `.take()` cannot filter out before this cap is checked — a `weight`
   row costs the same slot as a `workout` row. */
const CATEGORY_DAYS_ROWS = 1500
/* Twice a day for a year and a half, generously. `stateHistory`'s `key` is a
   `v.string()` — it is general over any state key someone starts recording,
   not only weight — so it does not get to assume one key's volume the way a
   query narrowed to `weight` alone might. Its own bound for the same reason
   categoryDays got CATEGORY_DAYS_ROWS rather than sharing MAX_ROWS. */
const STATE_HISTORY_ROWS = 1000

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

/* The number a tile's count may be read against, and — since 20 Sep — the
   words the person put beside it. `value` is the only half that may be
   divided by: it is the denominator of the bar (§1). `label` is free text
   ("aiming at €100 a month") and nothing computes with it, which is the
   point. Asked for a target of "€100"; a sum of logged amounts is not one of
   the four sources, so the tile still counts rows and the ambition is
   written in words next to it. See PLAN.md §4. */
const tileTarget = v.union(
  v.object({ value: v.number(), label: v.optional(v.string()) }),
  v.null(),
)

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

    const targets: Record<Tile, { value: number; label?: string } | null> = {
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
        targets[goal.tile] = {
          value: goal.targetValue,
          ...(goal.targetLabel === undefined
            ? {}
            : { label: goal.targetLabel }),
        }
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

/* The stateSnapshots key each field actually looks up. Since R6b-b a CEFR
   level's key carries its language's slug (`cefr_level:<slug>`) — a second
   language would otherwise share the bare `cefr_level` key with the first,
   and latest-row-wins would let one shadow the other. Hard-coded to
   Portuguese here because it is the only language recorded today; Task 7
   replaces this with whichever language was most recently recorded, and the
   field returned below stays named `cefr_level` regardless. `weight` and
   `net_worth` have no such split — there is only one of each — so they stay
   bare. */
const STATE_LOOKUP_KEYS: Record<(typeof STATE_KEYS)[number], string> = {
  cefr_level: 'cefr_level:portuguese',
  weight: 'weight',
  net_worth: 'net_worth',
}

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
          q.eq('ownerId', ownerId).eq('key', STATE_LOOKUP_KEYS[key]),
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
 * The latest recorded level for each language asked for — source 2, one
 * `stateSnapshots` row per slug, read through by_owner_key_time.
 *
 * The slugs arrive as an argument rather than being discovered here, for the
 * same reason `currentState` has a fixed shape: a query whose result changes
 * shape as a side effect of creating an area is one whose consumers cannot be
 * typed. The caller knows which areas it is showing tabs for.
 *
 * A language with nothing recorded comes back as an explicit null rather than
 * being missing. An absent entry would let a component render a gap that
 * looks like a level of zero, and a level is words, not a number.
 */
export const languageLevels = query({
  args: { slugs: v.array(v.string()) },
  returns: v.array(
    v.object({
      slug: v.string(),
      textValue: v.union(v.string(), v.null()),
      recordedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    const out: Array<{
      slug: string
      textValue: string | null
      recordedAt: number | null
    }> = []

    for (const slug of args.slugs) {
      /* Descending on [ownerId, key, recordedAt]: one document read per
         language, not a scan of every level ever recorded. */
      const row = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q.eq('ownerId', ownerId).eq('key', `cefr_level:${slug}`),
        )
        .order('desc')
        .first()

      out.push({
        slug,
        textValue: row?.textValue ?? null,
        recordedAt: row?.recordedAt ?? null,
      })
    }

    return out
  },
})

/**
 * The stored snapshots for one key, oldest first — the weight line.
 *
 * Source 2 read as a series rather than as a latest row, which §1 now allows
 * on written terms: this returns the rows and nothing between them. No
 * smoothing, no interpolation across a gap, no trend line, no projection. A
 * curve drawn through two weigh-ins three weeks apart claims a path that was
 * never measured, which is the same lie as a price shown without its time.
 *
 * Descending through by_owner_key_time so the cap keeps the newest rows in
 * the window, then reversed before returning — the contract is oldest first,
 * a chart drawn left to right, and callers do not see which end a
 * truncation would have cost.
 *
 * `complete` says whether the read reached `start` before hitting
 * STATE_HISTORY_ROWS. Reading newest-first means a truncated read keeps the
 * newest rows and drops the oldest — the direction a line can afford to be
 * wrong in, since it draws one dot short at the far end rather than
 * stopping short of today.
 */
export const stateHistory = query({
  args: {
    key: v.string(),
    /** Epoch ms, inclusive. */
    start: v.number(),
    /** Epoch ms, exclusive. */
    end: v.number(),
  },
  returns: v.object({
    rows: v.array(
      v.object({
        value: v.optional(v.number()),
        textValue: v.optional(v.string()),
        unit: v.optional(v.string()),
        recordedAt: v.number(),
      }),
    ),
    /** False when the read hit STATE_HISTORY_ROWS before reaching `start` —
        the oldest readings may be missing, not simply never recorded. */
    complete: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('stateSnapshots')
      .withIndex('by_owner_key_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('key', args.key)
          .gte('recordedAt', args.start)
          .lt('recordedAt', args.end),
      )
      .order('desc')
      .take(STATE_HISTORY_ROWS)

    return {
      /* Reversed back to oldest-first: `.order('desc')` above picks which
         rows survive a cap, not the order handed to callers. */
      rows: rows
        .map((row) => ({
          value: row.value,
          textValue: row.textValue,
          unit: row.unit,
          recordedAt: row.recordedAt,
        }))
        .reverse(),
      /* Fewer rows than the cap means nothing was dropped on the floor —
         the same signal categoryDays and projectActivity give for their own
         reads. */
      complete: rows.length < STATE_HISTORY_ROWS,
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
    area: v.optional(areaSlug),
    /** Narrows a kind written by more than one verb within one area — a class
        and an hour alone are both sessions filed under the same language, and
        a count that mixed them would say "23 this month" about neither. */
    category: v.optional(v.string()),
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
        (args.category === undefined || row.meta?.category === args.category) &&
        (args.projectId === undefined || row.projectId === args.projectId),
    ).length
  },
})

/**
 * How often, per kind of thing: one count per local day for every category
 * present in an area's logs, plus how many of the last `recentDays` had
 * something on them.
 *
 * Source 1 — log counts over a period, the same as the tiles, narrowed by the
 * category the row stores. Counts of stored rows and nothing else: not a rate,
 * not a streak, not a score. A streak was offered and declined (R6b spec §3.5)
 * — it zeroes on a missed day, which punishes a fact rather than reporting it.
 *
 * `activeRecent` is days-with-something, not rows: going twice on Tuesday is
 * one day you went. It is computed here rather than in the component because
 * a component that counts an array it was handed is computing a number, and
 * every number on screen comes from this file.
 *
 * Day boundaries arrive as arguments, as they do everywhere else here: the
 * server does not know what day it is where you are.
 *
 * `complete` says whether the read reached the start of the window before
 * hitting its row cap. It is one flag for the whole query, not per category:
 * truncation is a property of the read, not of any one bucket. Silently
 * dropping rows here would read as empty days rather than missing ones — the
 * same failure PLAN.md §1 records from R3c's GitHub check, which once read
 * one page of 100 commits and reported "100 this week · 0 last week" where
 * the truth was 117 and 65. A truncated reading is not the reading.
 *
 * Read `desc` before the cap so a truncated read keeps the newest days and
 * drops the oldest — bucketing by day below does not care which order rows
 * arrive in, so this costs nothing and makes the strip's own truncation
 * notice (Consistency.tsx: "older days not all stored") true rather than
 * backwards.
 */
export const categoryDays = query({
  args: {
    area: areaSlug,
    kinds: v.array(logKindValidator),
    /** Local midnights, oldest first. */
    dayStarts: v.array(v.number()),
    /** Epoch ms, exclusive — the midnight after the last day asked for. */
    end: v.number(),
    /** How many trailing days `activeRecent` covers. */
    recentDays: v.number(),
  },
  returns: v.object({
    rows: v.array(
      v.object({
        kind: logKindValidator,
        /* null: this row was logged before a category was stored for its
           kind. */
        category: v.union(v.string(), v.null()),
        days: v.array(v.number()),
        activeRecent: v.number(),
        total: v.number(),
      }),
    ),
    /** False when the read hit CATEGORY_DAYS_ROWS before reaching `dayStarts[0]`
        — the oldest days may be missing rows, not empty of them. */
    complete: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    if (args.dayStarts.length === 0) return { rows: [], complete: true }

    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_area_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('area', args.area)
          .gte('occurredAt', args.dayStarts[0])
          .lt('occurredAt', args.end),
      )
      .order('desc')
      .take(CATEGORY_DAYS_ROWS)

    const wanted = new Set<string>(args.kinds)
    type Bucket = {
      kind: Doc<'logs'>['kind']
      category: string | null
      days: Array<number>
    }
    const buckets = new Map<string, Bucket>()

    for (const row of rows) {
      if (!wanted.has(row.kind)) continue
      const category = row.meta?.category ?? null
      const key = `${row.kind}::${category ?? ''}`
      let bucket = buckets.get(key)
      if (bucket === undefined) {
        bucket = { kind: row.kind, category, days: args.dayStarts.map(() => 0) }
        buckets.set(key, bucket)
      }
      /* Last bucket whose midnight is at or before the row — the same walk
         projectTime and projectCommits do, over a list that is already
         short. */
      for (let i = args.dayStarts.length - 1; i >= 0; i -= 1) {
        if (row.occurredAt >= args.dayStarts[i]) {
          bucket.days[i] += 1
          break
        }
      }
    }

    const from = Math.max(0, args.dayStarts.length - args.recentDays)
    const result = [...buckets.values()]
      .map((bucket) => ({
        kind: bucket.kind,
        category: bucket.category,
        days: bucket.days,
        activeRecent: bucket.days
          .slice(from)
          .reduce((n, count) => n + (count > 0 ? 1 : 0), 0),
        total: bucket.days.reduce((n, count) => n + count, 0),
      }))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1
        /* Uncategorised last: it is the bucket you are emptying, not one of
           the things you do. */
        if (a.category === null) return 1
        if (b.category === null) return -1
        return a.category < b.category ? -1 : 1
      })

    /* Fewer rows than the cap means nothing was dropped on the floor — the
       same signal projectActivity gives for its own read. */
    return { rows: result, complete: rows.length < CATEGORY_DAYS_ROWS }
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
    /* Local midnights, for the tile's strip. Same shape as projectCommits,
       for the same reason: a day boundary belongs to the caller. */
    dayStarts: v.optional(v.array(v.number())),
  },
  returns: v.object({
    minutes: v.number(),
    sessions: v.number(),
    /** Minutes per day in dayStarts, same order; empty when none were asked
        for. A day with nothing logged is a 0, not a gap. */
    days: v.array(v.number()),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const projectId = ctx.db.normalizeId('projects', args.projectId)
    const starts = args.dayStarts ?? []
    if (projectId === null) {
      return { minutes: 0, sessions: 0, days: starts.map(() => 0) }
    }

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
    const days = starts.map(() => 0)
    for (const row of rows) {
      if (row.kind !== 'session') continue
      sessions += 1
      minutes += row.value ?? 0
      /* Last bucket whose midnight is at or before the row: the same walk
         projectCommits does, over a list that is already short. */
      for (let i = starts.length - 1; i >= 0; i -= 1) {
        if (row.occurredAt >= starts[i]) {
          days[i] += row.value ?? 0
          break
        }
      }
    }
    return { minutes, sessions, days }
  },
})

/* ---------------------------------------------------------------------------
   Source 4 — external readings. GitHub commits, stored by convex/github.ts.
   ------------------------------------------------------------------------ */

/**
 * Commits on a project's repo this week and last week, with the repo they
 * are attributed to and when they were last checked — "12 this week · 8
 * last week · as of 14:02". Counts of stored rows and nothing else: no rate,
 * no streak. Rows from a repo the project no longer points at are not
 * counted. Week bounds arrive as arguments, as they do everywhere.
 */
export const projectCommits = query({
  args: {
    projectId: v.string(),
    lastWeekStart: v.number(),
    weekStart: v.number(),
    nextWeekStart: v.number(),
    /* Local midnights, oldest first, for the strip on the focus card (20 Sep).
       Passed in rather than computed: a day boundary depends on where the
       person is, and fixed 24h steps drift an hour across a DST change. */
    dayStarts: v.optional(v.array(v.number())),
  },
  returns: v.object({
    repo: v.union(v.string(), v.null()),
    checkedAt: v.union(v.number(), v.null()),
    thisWeek: v.number(),
    lastWeek: v.number(),
    /* One count per day in dayStarts, same order; empty when none were asked
       for. Counts of stored rows and nothing else — not a rate, not a streak,
       not a score. */
    days: v.array(v.number()),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const none = {
      repo: null,
      checkedAt: null,
      thisWeek: 0,
      lastWeek: 0,
      days: (args.dayStarts ?? []).map(() => 0),
    }
    const projectId = ctx.db.normalizeId('projects', args.projectId)
    const project = projectId === null ? null : await ctx.db.get(projectId)
    if (
      project === null ||
      project.ownerId !== ownerId ||
      !project.githubRepo
    ) {
      return none
    }

    const rows = await ctx.db
      .query('commits')
      .withIndex('by_owner_project_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('projectId', project._id)
          .gte('authoredAt', args.lastWeekStart)
          .lt('authoredAt', args.nextWeekStart),
      )
      .take(MAX_ROWS)

    const dayStarts = args.dayStarts ?? []
    const days = dayStarts.map(() => 0)

    let thisWeek = 0
    let lastWeek = 0
    for (const row of rows) {
      if (row.repo !== project.githubRepo) continue
      /* A merge is bookkeeping, not work (20 Sep). GitHub's own activity
         stats leave them out, and counting them made a week's number partly
         a measure of how often he opened a pull request. */
      if (row.isMerge === true) continue
      if (row.authoredAt >= args.weekStart) thisWeek += 1
      else lastWeek += 1

      /* The last boundary at or before this commit. Walked from the end, so a
         commit before the first boundary falls into no bucket rather than the
         first one. */
      for (let i = dayStarts.length - 1; i >= 0; i -= 1) {
        if (row.authoredAt >= dayStarts[i]) {
          days[i] += 1
          break
        }
      }
    }
    return {
      repo: project.githubRepo,
      checkedAt: project.githubCheckedAt ?? null,
      thisWeek,
      lastWeek,
      days,
    }
  },
})

/**
 * A year of a project's commits, one count per day — the heatmap (20 Sep).
 *
 * The same stored rows the counts come from, so the grid and the numbers
 * beside it can never disagree; merges are left out of both. Day boundaries
 * arrive as arguments, as week bounds do, because a day depends on where the
 * person is. `complete` says whether the backfill actually reached the start
 * of the window: a grid that quietly stops early would read as a year of not
 * working, which is the truncation lesson §1 now carries.
 */
export const projectActivity = query({
  args: {
    projectId: v.string(),
    dayStarts: v.array(v.number()),
    end: v.number(),
  },
  returns: v.object({
    repo: v.union(v.string(), v.null()),
    checkedAt: v.union(v.number(), v.null()),
    days: v.array(v.number()),
    total: v.number(),
    complete: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const empty = {
      repo: null,
      checkedAt: null,
      days: args.dayStarts.map(() => 0),
      total: 0,
      complete: false,
    }
    const projectId = ctx.db.normalizeId('projects', args.projectId)
    const project = projectId === null ? null : await ctx.db.get(projectId)
    if (
      project === null ||
      project.ownerId !== ownerId ||
      !project.githubRepo
    ) {
      return empty
    }

    const first = args.dayStarts[0] ?? args.end
    const rows = await ctx.db
      .query('commits')
      .withIndex('by_owner_project_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('projectId', project._id)
          .gte('authoredAt', first)
          .lt('authoredAt', args.end),
      )
      .take(YEAR_ROWS)

    const days = args.dayStarts.map(() => 0)
    let total = 0
    for (const row of rows) {
      if (row.repo !== project.githubRepo) continue
      if (row.isMerge === true) continue
      total += 1
      for (let i = args.dayStarts.length - 1; i >= 0; i -= 1) {
        if (row.authoredAt >= args.dayStarts[i]) {
          days[i] += 1
          break
        }
      }
    }

    return {
      repo: project.githubRepo,
      checkedAt: project.githubCheckedAt ?? null,
      days,
      total,
      /* Fewer rows than the cap means nothing was dropped on the floor. */
      complete: rows.length < YEAR_ROWS,
    }
  },
})
