import { v } from 'convex/values'

import { requireUser } from './auth'
import { logKindValidator } from './logs'
import { countsInOut, isEuroAmount, isLent } from '../src/lib/money'
import { billsEachMonth, buildAhead, yearAhead } from '../src/lib/ahead'
import { payMonthDetail as openPayMonth, payMonths } from '../src/lib/payMonth'
import type { DetailRow } from '../src/lib/payMonth'
import type { AheadBill, AheadRow } from '../src/lib/ahead'
import { payeeKey, rowKey } from '../src/lib/payee'
import { balanceChecks, balanceSeries, coveredBy } from '../src/lib/cashHistory'
import type { Move, Reading } from '../src/lib/cashHistory'
import { addSeries, investedSeries } from '../src/lib/worthHistory'
import { ownMoves } from '../src/lib/accountLines'
import type { Close, Holding, Rate } from '../src/lib/worthHistory'
import { notSeenSince, reconcile } from '../src/lib/holdings'
import type { LedgerTrade, Observation } from '../src/lib/holdings'
import { areaSlug } from './schema'
import type { Tile } from './schema'
import { query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'

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
   and latest-row-wins would let one shadow the other. Still hard-coded to
   Portuguese: Task 7 named which language the dashboard cell means, but did
   it in StateStrip.tsx over `languageLevels()` (which takes the slugs to
   look up as an argument) rather than here, because `currentState()` takes
   none and a fixed shape driven by "whichever language was last recorded"
   is the same failure its own comment warns against — a cell whose meaning
   changes as a side effect of logging something elsewhere. So `cefr_level`
   below is stale wherever a level is recorded for any language other than
   Portuguese, and unread by any component since Task 7 — kept rather than
   removed because the fixed three-field shape below is not this task's to
   change. `weight` and `net_worth` have no such split — there is only one of
   each — so they stay bare. */
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

/* A month of money rows, generously: ten a day is more than capture is
   ever used for. Its own bound because a sum that silently dropped rows
   would read as a smaller month, not a missing one. */
const MONEY_ROWS = 1000

const moneyBucket = v.object({
  kind: v.union(v.literal('expense'), v.literal('income')),
  /** null — logged with no category: unsorted. */
  category: v.union(v.string(), v.null()),
  sum: v.number(),
  count: v.number(),
})

/**
 * Money out and in over a period, per category (Finances F1, 26 Sep).
 *
 * Source 1 as widened on 26 Sep — a sum of logged amounts, on the five
 * conditions in PLAN.md §1, each kept here or said where:
 *
 * - One currency: only rows in euros are added (`unit` 'eur', which every
 *   money verb writes). A row in anything else is counted in `skipped` and
 *   added to nothing — shown, never converted.
 * - A stated period: `start`/`end` are required; there is no all-time call.
 * - Only logged rows: sums of `value`, nothing estimated or projected.
 * - Every sum opens its rows: `logs.moneyRows` over the same period and
 *   the same rule lists exactly the rows behind each bucket.
 * - Not a licence to derive: out and in come back apart. No difference,
 *   no rate, no score.
 *
 * Added in whole cents, so €0.10 + €0.20 is €0.30 and not float noise.
 * `complete` is false if the read hit its cap — a truncated sum is not the
 * sum (§1, the R3c lesson).
 */
export const moneySums = query({
  args: {
    /** Epoch ms, local midnight — inclusive. */
    start: v.number(),
    /** Epoch ms, local midnight — exclusive. */
    end: v.number(),
  },
  returns: v.object({
    out: v.object({ sum: v.number(), count: v.number() }),
    in: v.object({ sum: v.number(), count: v.number() }),
    buckets: v.array(moneyBucket),
    skipped: v.number(),
    complete: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_area_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('area', 'money')
          .gte('occurredAt', args.start)
          .lt('occurredAt', args.end),
      )
      .take(MONEY_ROWS)

    const cents = new Map<
      string,
      {
        kind: 'expense' | 'income'
        category: string | null
        c: number
        n: number
      }
    >()
    const total = { expense: { c: 0, n: 0 }, income: { c: 0, n: 0 } }
    let skipped = 0
    for (const row of rows) {
      if (row.kind !== 'expense' && row.kind !== 'income') continue
      if (!isEuroAmount(row)) {
        skipped++
        continue
      }
      if (isLent(row)) continue
      const c = Math.round(row.value * 100)
      const category = row.meta?.category ?? null
      const key = `${row.kind}:${category ?? ''}`
      const bucket = cents.get(key) ?? { kind: row.kind, category, c: 0, n: 0 }
      bucket.c += c
      bucket.n++
      cents.set(key, bucket)
      total[row.kind].c += c
      total[row.kind].n++
    }

    return {
      out: { sum: total.expense.c / 100, count: total.expense.n },
      in: { sum: total.income.c / 100, count: total.income.n },
      /* Biggest first within each kind: where the month went reads down. */
      buckets: [...cents.values()]
        .sort((a, b) =>
          a.kind === b.kind ? b.c - a.c : a.kind === 'expense' ? -1 : 1,
        )
        .map((b) => ({
          kind: b.kind,
          category: b.category,
          sum: b.c / 100,
          count: b.n,
        })),
      skipped,
      complete: rows.length < MONEY_ROWS,
    }
  },
})

/**
 * What moved in each account over a period (27 Sep, the Treasury hero's
 * account rows): money in, money out and both sides of transfers, signed,
 * in euros — the sum rule over logs that carry an account. A row in
 * another currency is not added and not converted; `skipped` says how
 * many. Nothing here is a return: a broker's shares moving in price are
 * not in it.
 */
export const accountMonth = query({
  args: { start: v.number(), end: v.number() },
  returns: v.object({
    accounts: v.array(
      v.object({
        accountId: v.id('accounts'),
        net: v.number(),
        /* What makes the net (4 Oct: "explain what are those this month
           +374 … I dont get those nums"): money in, money out, and his
           own transfers, each a sum of the same rows. */
        in: v.number(),
        out: v.number(),
        moves: v.number(),
        /* A broker's month (4 Oct: "brokers are sad … bought sold stocks
           since 1st day of month"): what he bought and sold, in euros, from
           his trades — a first screen's opening holdings are not buys. A
           staking reward is neither. */
        bought: v.number(),
        sold: v.number(),
        trades: v.number(),
        rows: v.number(),
      }),
    ),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_area_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('area', 'money')
          .gte('occurredAt', args.start)
          .lt('occurredAt', args.end),
      )
      .take(MONEY_ROWS)
    const by = new Map<
      Id<'accounts'>,
      { cents: number; in: number; out: number; moves: number; rows: number }
    >()
    let skipped = 0
    for (const row of rows) {
      if (row.accountId === undefined) continue
      if (
        row.kind !== 'expense' &&
        row.kind !== 'income' &&
        row.kind !== 'move'
      )
        continue
      if (!isEuroAmount(row)) {
        skipped++
        continue
      }
      const signed = row.kind === 'expense' ? -row.value : row.value
      const a = by.get(row.accountId) ?? {
        cents: 0,
        in: 0,
        out: 0,
        moves: 0,
        rows: 0,
      }
      const c = Math.round(signed * 100)
      a.cents += c
      if (row.kind === 'move') a.moves += c
      else if (row.kind === 'income') a.in += c
      else a.out -= c
      a.rows++
      by.set(row.accountId, a)
    }
    const traded = new Map<
      Id<'accounts'>,
      { bought: number; sold: number; n: number }
    >()
    const trades = await ctx.db
      .query('trades')
      .withIndex('by_owner_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .gte('occurredAt', args.start)
          .lt('occurredAt', args.end),
      )
      .take(MONEY_ROWS)
    for (const t of trades) {
      /* A first screen's opening holdings are not buys; a statement's
         trades are (they carry importId too). */
      if (t.opening || t.reward) continue
      const x = traded.get(t.accountId) ?? { bought: 0, sold: 0, n: 0 }
      const c = Math.round(t.shares * t.priceEur * 100)
      if (t.side === 'buy') x.bought += c
      else x.sold += c
      x.n++
      traded.set(t.accountId, x)
    }
    const ids = new Set([...by.keys(), ...traded.keys()])
    const none = { cents: 0, in: 0, out: 0, moves: 0, rows: 0 }
    return {
      accounts: [...ids].map((accountId) => {
        const a = by.get(accountId) ?? none
        const x = traded.get(accountId) ?? { bought: 0, sold: 0, n: 0 }
        return {
          accountId,
          net: a.cents / 100,
          in: a.in / 100,
          out: a.out / 100,
          moves: a.moves / 100,
          bought: x.bought / 100,
          sold: x.sold / 100,
          trades: x.n,
          rows: a.rows,
        }
      }),
      skipped,
    }
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
      /* One row per category, whatever kind wrote it (25 Sep): a stretch
         session and the stretches ticked from its routine are one habit, and
         two STRETCH rows would read as two. Uncategorised rows stay apart
         per kind. The row wears the session's kind when it has one, the
         exercise's only when nothing else was logged under that word. */
      const key = category ?? `::${row.kind}`
      let bucket = buckets.get(key)
      if (bucket === undefined) {
        bucket = { kind: row.kind, category, days: args.dayStarts.map(() => 0) }
        buckets.set(key, bucket)
      } else if (bucket.kind === 'exercise' && row.kind !== 'exercise') {
        bucket.kind = row.kind
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
 * Each routine item's days (25 Sep): how many times DID was pressed on it per
 * day over the window, how many times in all, and when last. The DID button's
 * "×2 today", the row's week of dots, a topic's "3× · Sep 20".
 *
 * Source 1 — exercise logs counted per day, keyed by the drill they were
 * ticked from. Only rows carrying a drillId count: an exercise is evidence
 * about the drill it names, and a row without one names none. Same read
 * shape, cap and `complete` flag as categoryDays.
 */
export const drillDays = query({
  args: {
    area: areaSlug,
    /** Local midnights, oldest first. */
    dayStarts: v.array(v.number()),
    /** Epoch ms, exclusive. */
    end: v.number(),
  },
  returns: v.object({
    rows: v.array(
      v.object({
        drillId: v.id('drills'),
        days: v.array(v.number()),
        total: v.number(),
        lastAt: v.number(),
      }),
    ),
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

    type Bucket = {
      drillId: Id<'drills'>
      days: Array<number>
      total: number
      lastAt: number
    }
    const buckets = new Map<string, Bucket>()
    for (const row of rows) {
      const drillId = row.meta?.drillId
      if (row.kind !== 'exercise' || drillId === undefined) continue
      let bucket = buckets.get(drillId)
      if (bucket === undefined) {
        bucket = {
          drillId,
          days: args.dayStarts.map(() => 0),
          total: 0,
          lastAt: row.occurredAt,
        }
        buckets.set(drillId, bucket)
      }
      bucket.total += 1
      bucket.lastAt = Math.max(bucket.lastAt, row.occurredAt)
      for (let i = args.dayStarts.length - 1; i >= 0; i -= 1) {
        if (row.occurredAt >= args.dayStarts[i]) {
          bucket.days[i] += 1
          break
        }
      }
    }

    return {
      rows: [...buckets.values()],
      complete: rows.length < CATEGORY_DAYS_ROWS,
    }
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

/* ---------------------------------------------------------------------------
   Finances F2 and F4 (26 Sep).
   ------------------------------------------------------------------------ */

/* Accounts and holdings are few; these bound the reads generously. */
const ACCOUNT_ROWS = 50
/* His Revolut export alone is 3,595 trades since 2020 (27 Sep). */
const TRADE_ROWS = 6000
/* A screen of 15 positions a month for years. */
const HOLDING_ROWS = 3000

/**
 * Each live account's FREE CASH, and the total (Finances F2) — money not
 * in shares; what its positions are worth is `worth`'s other half.
 *
 * Each balance is source 2, the latest `balance:<id>` state. The total is
 * a sum of those latest states, allowed on 26 Sep on the sum rule's
 * conditions (PLAN.md §1): euros only, and never shown without
 * `oldestAt`, the reading furthest back in it, so a total made partly of a
 * month-old number cannot look fresh. An account with no reading yet is
 * counted in `unread` and added to nothing.
 *
 * Since 27 Sep ("adding money"), a pocket is its latest reading PLUS the
 * money that moved in it after that reading — its logs (spending, money
 * in, both sides of a transfer) and, in a broker's euro pocket, what its
 * buys cost and its sells brought (`trades`, never an `opening` one). That
 * is source 2 plus a source-1 sum over rows that open: `moved` and
 * `movedRows` say how much and how many, so the number is never a bare
 * one. The reading always wins over what came before it — a statement
 * that disagrees resets the pocket.
 */
const pocket = v.object({
  currency: v.string(),
  /** As read plus what moved since, in its own currency. */
  value: v.union(v.number(), v.null()),
  recordedAt: v.union(v.number(), v.null()),
  /** The reading alone, and what moved in the pocket after it. */
  read: v.union(v.number(), v.null()),
  moved: v.number(),
  movedRows: v.number(),
  /** In euros at the latest stored ECB rate; null without a reading or a
      rate — never guessed. */
  eur: v.union(v.number(), v.null()),
  rateAsOf: v.union(v.number(), v.null()),
  /** Where the reading came from, and when he gave it — which may be long
      after the day it is true for (an August statement read today). */
  source: v.union(
    v.literal('typed'),
    v.literal('statement'),
    v.literal('screenshot'),
    v.literal('sync'),
    v.null(),
  ),
  writtenAt: v.union(v.number(), v.null()),
})

export const balances = query({
  args: {},
  returns: v.object({
    accounts: v.array(
      v.object({
        accountId: v.id('accounts'),
        name: v.string(),
        kinds: v.array(
          v.union(v.literal('bank'), v.literal('broker'), v.literal('cash')),
        ),
        domain: v.union(v.string(), v.null()),
        pockets: v.array(pocket),
        /** Its free cash in euros — the pockets that could be valued. */
        cashEur: v.number(),
      }),
    ),
    total: v.number(),
    oldestAt: v.union(v.number(), v.null()),
    /** Pockets with no reading, or no rate to show them in euros. */
    unread: v.number(),
  }),
  handler: async (ctx) => await readBalances(ctx, await requireUser(ctx)),
})

/* Pence: London quotes in GBp, a hundredth of the pound the rate is for. */
function quoteToRate(currency: string): { base: string; divide: number } {
  return currency === 'GBp' || currency === 'GBX'
    ? { base: 'GBP', divide: 100 }
    : { base: currency, divide: 1 }
}

/**
 * What he holds, per account and ticker (Finances F4; R6c, 27 Sep).
 *
 * Worked out from every file that spoke of it (src/lib/holdings.ts,
 * reconcile): the trade rows are the ledger, a holdings screen a dated
 * observation. `shares` is the latest screen plus the trades after it, or
 * the trades alone; `paid` is what those rows cost (buys less what sells
 * took back), or what the screen printed — null when no file says, and
 * then no profit is shown against it. `status` says whether the trades
 * and the screen agree.
 *
 * `valueEur` is shares × the latest stored price × the latest stored rate
 * into euros: composition of source-4 readings (PLAN.md §1), and null when
 * either reading is missing — never guessed. Every value carries the
 * `priceAsOf` and `rateAsOf` it was made from.
 */
export const positions = query({
  args: {},
  returns: v.object({
    rows: v.array(
      v.object({
        accountId: v.id('accounts'),
        instrumentId: v.id('instruments'),
        symbol: v.string(),
        name: v.string(),
        type: v.string(),
        currency: v.string(),
        shares: v.number(),
        paid: v.union(v.number(), v.null()),
        status: v.union(
          v.literal('trades'),
          v.literal('match'),
          v.literal('screen'),
          v.literal('gap'),
          v.literal('over'),
        ),
        seenAt: v.union(v.number(), v.null()),
        gap: v.number(),
        /** A later screen of the account left it out. */
        notSeen: v.boolean(),
        price: v.union(v.number(), v.null()),
        priceAsOf: v.union(v.number(), v.null()),
        rate: v.union(v.number(), v.null()),
        rateAsOf: v.union(v.number(), v.null()),
        valueEur: v.union(v.number(), v.null()),
        /** Coins given for holding it (staking), in its own units. */
        staked: v.number(),
      }),
    ),
    /** The sum of the valued positions, in euros, and the oldest price in
        it — the balances rule again: never a total without its as-of.
        A position with no price yet is counted in `unvalued`, not added. */
    totalEur: v.number(),
    oldestPriceAsOf: v.union(v.number(), v.null()),
    unvalued: v.number(),
    complete: v.boolean(),
  }),
  handler: async (ctx) => await readPositions(ctx, await requireUser(ctx)),
})

async function readBalances(ctx: QueryCtx, ownerId: string) {
  const accounts = (
    await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(ACCOUNT_ROWS)
  ).filter((a) => a.retiredAt === undefined)

  const rates = new Map<string, { rate: number; asOf: number } | null>()
  async function rateFor(currency: string) {
    if (currency === 'EUR') return { rate: 1, asOf: null as number | null }
    if (!rates.has(currency)) {
      const row = await ctx.db
        .query('fxRates')
        .withIndex('by_owner_currency_time', (q) =>
          q.eq('ownerId', ownerId).eq('currency', currency),
        )
        .order('desc')
        .first()
      rates.set(
        currency,
        row === null ? null : { rate: row.rate, asOf: row.asOf },
      )
    }
    const r = rates.get(currency) ?? null
    return r === null ? null : { rate: r.rate, asOf: r.asOf as number | null }
  }

  let cents = 0
  let oldestAt: number | null = null
  let unread = 0
  const out = []
  for (const account of accounts) {
    const pockets = []
    let accountCents = 0
    for (const currency of account.currencies) {
      const row = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', `balance:${account._id}:${currency}`),
        )
        .order('desc')
        .first()
      const read = row?.value ?? null
      const since =
        row === null
          ? { cents: 0, rows: 0 }
          : await movedSince(ctx, ownerId, account, currency, row.recordedAt)
      const value =
        read === null ? null : (Math.round(read * 100) + since.cents) / 100
      const rate = await rateFor(currency)
      const eur =
        value === null || rate === null
          ? null
          : Math.round(value * rate.rate * 100) / 100
      if (eur === null || row === null) {
        unread++
      } else {
        accountCents += Math.round(eur * 100)
        oldestAt =
          oldestAt === null
            ? row.recordedAt
            : Math.min(oldestAt, row.recordedAt)
      }
      pockets.push({
        currency,
        value,
        recordedAt: row?.recordedAt ?? null,
        read,
        moved: since.cents / 100,
        movedRows: since.rows,
        eur,
        rateAsOf: rate?.asOf ?? null,
        source: row?.source ?? null,
        writtenAt: row?._creationTime ?? null,
      })
    }
    cents += accountCents
    out.push({
      accountId: account._id,
      name: account.name,
      kinds: account.kinds,
      domain: account.domain ?? null,
      pockets,
      cashEur: accountCents / 100,
    })
  }
  return { accounts: out, total: cents / 100, oldestAt, unread }
}

/**
 * Free cash at the end of each day he asks for (27 Sep — the Overview
 * chart and the account cards' lines): per account, each pocket's nearest
 * reading plus or minus what moved in between (src/lib/cashHistory), in
 * euros at the latest stored rate. Sources 1 and 2 only — his readings and
 * his rows; a day before anything he told the app is null. Investments are
 * not in it: their worth on a past day needs that day's close, which is
 * not stored yet.
 */
const daySeries = v.array(v.union(v.number(), v.null()))
const accountSeries = v.array(
  v.object({ accountId: v.id('accounts'), values: daySeries }),
)

export const cashHistory = query({
  args: { dayEnds: v.array(v.number()) },
  returns: v.object({ total: daySeries, accounts: accountSeries }),
  handler: async (ctx, args) => {
    const { total, accounts } = await readCashHistory(
      ctx,
      await requireUser(ctx),
      args.dayEnds.slice(0, 400),
    )
    return { total, accounts }
  },
})

async function readCashHistory(
  ctx: QueryCtx,
  ownerId: string,
  dayEnds: ReadonlyArray<number>,
) {
  const accounts = (
    await ctx.db
      .query('accounts')
      .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
      .take(ACCOUNT_ROWS)
  ).filter((a) => a.retiredAt === undefined)
  const out = []
  const total: Array<number | null> = dayEnds.map(() => null)
  const live = new Set(accounts.map((a) => a._id))
  /* Rows of money moving between his own accounts, for the chart's lane
     (src/lib/accountLines, ownMoves). */
  const moveRows: Array<{
    at: number
    accountId: Id<'accounts'>
    value: number
    otherAccountId: Id<'accounts'> | null
  }> = []
  for (const account of accounts) {
    const logs = await ctx.db
      .query('logs')
      .withIndex('by_owner_account_time', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', account._id),
      )
      .take(HISTORY_ROWS)
    for (const l of logs) {
      const other = l.meta?.otherAccountId
      if (l.kind !== 'move' || l.value === undefined || other === undefined)
        continue
      if (!live.has(other)) continue
      moveRows.push({
        at: l.occurredAt,
        accountId: account._id,
        value: l.value,
        otherAccountId: other,
      })
    }
    const trades = account.kinds.includes('broker')
      ? await ctx.db
          .query('trades')
          .withIndex('by_owner_account', (q) =>
            q.eq('ownerId', ownerId).eq('accountId', account._id),
          )
          .take(TRADE_ROWS)
      : []
    const values: Array<number | null> = dayEnds.map(() => null)
    for (const currency of account.currencies) {
      const readings = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', `balance:${account._id}:${currency}`),
        )
        .take(500)
      if (readings.length === 0) continue
      const rate =
        currency === 'EUR'
          ? 1
          : ((
              await ctx.db
                .query('fxRates')
                .withIndex('by_owner_currency_time', (q) =>
                  q.eq('ownerId', ownerId).eq('currency', currency),
                )
                .order('desc')
                .first()
            )?.rate ?? null)
      if (rate === null) continue
      const moves = pocketMoves(logs, trades, currency)
      const series = balanceSeries(
        dayEnds,
        readings.map((r) => ({ at: r.recordedAt, value: r.value ?? 0 })),
        moves,
        account.kinds.includes('cash') && !account.kinds.includes('bank'),
      )
      for (const [i, x] of series.entries()) {
        if (x === null) continue
        values[i] = Math.round(((values[i] ?? 0) + x * rate) * 100) / 100
      }
    }
    for (const [i, x] of values.entries())
      if (x !== null) total[i] = Math.round(((total[i] ?? 0) + x) * 100) / 100
    out.push({ accountId: account._id, values })
  }
  const first = dayEnds[0] ?? 0
  const moves = ownMoves(moveRows).filter(
    (m) => m.at > first - 86_400_000 && m.at <= (dayEnds.at(-1) ?? 0),
  )
  return { total, accounts: out, moves }
}

/**
 * The worth chart as on :3950 (Finances B, 1 Oct): free cash, invested and
 * their total at the end of each day. Cash is cashHistory's; invested is
 * src/lib/worthHistory's — shares the files say he held that day × that
 * day's stored close × that day's stored ECB rate. Sources 1, 2 and 4;
 * `unpriced` counts, per day, what was held with no close to value it.
 */
export const worthHistory = query({
  args: { dayEnds: v.array(v.number()) },
  returns: v.object({
    total: daySeries,
    cash: daySeries,
    invested: daySeries,
    cashAccounts: accountSeries,
    investedAccounts: accountSeries,
    unpriced: v.array(v.number()),
    /** His moves between his own accounts in the range, once each. */
    moves: v.array(
      v.object({
        at: v.number(),
        from: v.id('accounts'),
        to: v.id('accounts'),
        amount: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const dayEnds = args.dayEnds.slice(0, 400)
    const cash = await readCashHistory(ctx, ownerId, dayEnds)
    /* Where a close is looked up: every day of the last month, a week
       apart before it. A point between two looks takes the earlier close,
       so a year's line is weekly in its old part — about 80 reads a
       position instead of 365. */
    const priced = dayEnds.filter(
      (_, i) =>
        i === 0 ||
        i >= dayEnds.length - 31 ||
        (dayEnds.length - 1 - i) % 7 === 0,
    )

    const live = new Set(
      (
        await ctx.db
          .query('accounts')
          .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
          .take(ACCOUNT_ROWS)
      )
        .filter((a) => a.retiredAt === undefined)
        .map((a) => a._id),
    )
    const trades = (
      await ctx.db
        .query('trades')
        .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
        .take(TRADE_ROWS)
    ).filter((t) => live.has(t.accountId))
    const looks = (
      await ctx.db
        .query('holdings')
        .withIndex('by_owner_account', (q) => q.eq('ownerId', ownerId))
        .take(HOLDING_ROWS)
    ).filter((h) => live.has(h.accountId))

    const slots = new Map<
      string,
      {
        accountId: Id<'accounts'>
        instrumentId: Id<'instruments'>
        trades: Array<LedgerTrade>
        looks: Array<Observation>
      }
    >()
    const slot = (
      accountId: Id<'accounts'>,
      instrumentId: Id<'instruments'>,
    ) => {
      const key = `${accountId}:${instrumentId}`
      let p = slots.get(key)
      if (p === undefined) {
        p = { accountId, instrumentId, trades: [], looks: [] }
        slots.set(key, p)
      }
      return p
    }
    for (const t of trades) slot(t.accountId, t.instrumentId).trades.push(t)
    for (const h of looks)
      slot(h.accountId, h.instrumentId).looks.push({
        shares: h.shares,
        paidEur: h.paidEur,
        asOf: h.asOf,
      })

    /* Every close and rate is looked up at once, not one after another
       (9 Oct): the same ~80 one-row reads a position, but in sequence they
       took 6 s — and Convex holds every update on screen until each open
       query has caught up, so a save froze the whole app for those 6 s. */
    const latestAt = async <T>(
      ends: ReadonlyArray<number>,
      read: (end: number) => Promise<T | null>,
      asOf: (row: T) => number,
    ) => {
      const found = new Map<number, T>()
      for (const [k, r] of (await Promise.all(ends.map(read))).entries())
        if (r !== null && asOf(r) >= ends[k] - STALE_CLOSE_MS - 7 * 86_400_000)
          found.set(asOf(r), r)
      return [...found.values()].sort((a, b) => asOf(a) - asOf(b))
    }
    const instruments = new Map(
      (
        await Promise.all(
          [...new Set([...slots.values()].map((p) => p.instrumentId))].map(
            (id) => ctx.db.get(id),
          ),
        )
      )
        .filter(
          (x): x is Doc<'instruments'> => x !== null && x.ownerId === ownerId,
        )
        .map((x) => [x._id, x]),
    )
    /* One close per point drawn (4 Oct: the year of daily closes for every
       position, read on every re-run, was 99% of the month's database
       reads). The latest at or before each day's end, through the index —
       one row each — and none older than two weeks. */
    const closesOf = new Map(
      await Promise.all(
        [...instruments.keys()].map(
          async (id) =>
            [
              id,
              (
                await latestAt(
                  priced,
                  (end) =>
                    ctx.db
                      .query('prices')
                      .withIndex('by_owner_instrument_time', (q) =>
                        q
                          .eq('ownerId', ownerId)
                          .eq('instrumentId', id)
                          .lte('asOf', end),
                      )
                      .order('desc')
                      .first(),
                  (r) => r.asOf,
                )
              ).map((r): Close => ({ asOf: r.asOf, price: r.price })),
            ] as const,
        ),
      ),
    )
    const bases = [
      ...new Set(
        [...instruments.values()]
          .map((x) => quoteToRate(x.currency).base)
          .filter((b) => b !== 'EUR'),
      ),
    ]
    const ratesOf = new Map(
      await Promise.all(
        bases.map(
          async (base) =>
            [
              base,
              (
                await latestAt(
                  priced,
                  (end) =>
                    ctx.db
                      .query('fxRates')
                      .withIndex('by_owner_currency_time', (q) =>
                        q
                          .eq('ownerId', ownerId)
                          .eq('currency', base)
                          .lte('asOf', end),
                      )
                      .order('desc')
                      .first(),
                  (r) => r.asOf,
                )
              ).map((r): Rate => ({ asOf: r.asOf, rate: r.rate })),
            ] as const,
        ),
      ),
    )
    const holdings: Array<Holding<Id<'accounts'>>> = []
    for (const p of slots.values()) {
      const instrument = instruments.get(p.instrumentId)
      if (instrument === undefined) continue
      const { base, divide } = quoteToRate(instrument.currency)
      holdings.push({
        accountId: p.accountId,
        trades: p.trades,
        looks: p.looks,
        closes: closesOf.get(p.instrumentId) ?? [],
        divide,
        rates: base === 'EUR' ? null : (ratesOf.get(base) ?? []),
      })
    }

    const invested = investedSeries(dayEnds, holdings)
    return {
      total: addSeries(cash.total, invested.total),
      cash: cash.total,
      invested: invested.total,
      cashAccounts: cash.accounts,
      investedAccounts: invested.accounts,
      unpriced: invested.unpriced,
      moves: cash.moves,
    }
  },
})

const HISTORY_ROWS = 5000
/** A close or rate this old is no longer the day's: the point is unpriced. */
const STALE_CLOSE_MS = 14 * 86_400_000

/* One pocket's rows as signed cents: spending out, money in, a move's own
   side; in a broker's euro pocket, buys out and sells in. */
function pocketMoves(
  logs: ReadonlyArray<Doc<'logs'>>,
  trades: ReadonlyArray<Doc<'trades'>>,
  currency: string,
): Array<Move> {
  const unit = currency.toLowerCase()
  const moves: Array<Move> = []
  for (const l of logs) {
    if (l.area !== 'money' || l.unit !== unit || l.value === undefined) continue
    const signed =
      l.kind === 'expense'
        ? -l.value
        : l.kind === 'income' || l.kind === 'move'
          ? l.value
          : 0
    if (signed !== 0)
      moves.push({
        at: l.occurredAt,
        cents: Math.round(signed * 100),
        fromFile: l.meta?.intakeId !== undefined,
      })
  }
  if (currency === 'EUR')
    for (const t of trades) {
      /* No cash side: opening holdings, and coins whose money the bank
         statement already shows leaving (noCash). */
      if (t.opening === true || t.noCash === true) continue
      const cost = Math.round(t.shares * t.priceEur * 100)
      moves.push({
        at: t.occurredAt,
        cents: t.side === 'buy' ? -cost : cost,
        fromFile: false,
      })
    }
  return moves
}

/* How close a file's printed balance and a stored reading must be, in
   time, to be the same reading (a statement's "balance of Aug 31" is
   stored when he confirms, often a day or more later). */
const FILE_READING_MS = 3 * 86_400_000
const SHEET_ROWS = 2000
const SHEET_FILES = 200

const sheetRow = v.object({
  id: v.string(),
  at: v.number(),
  kind: v.union(
    v.literal('spend'),
    v.literal('income'),
    v.literal('move'),
    v.literal('buy'),
    v.literal('sell'),
  ),
  /** Signed, in `currency`, as this account sees it. */
  amount: v.number(),
  currency: v.string(),
  text: v.string(),
  category: v.union(v.string(), v.null()),
  /** A move's other account, when known. */
  other: v.union(v.string(), v.null()),
  /** Typed by him (no file): the only rows the sheet can delete. */
  logId: v.union(v.id('logs'), v.null()),
  /** A move written here because another account's file named this one
      as its other side — that account's name. He can say it did not come
      from here (3 Oct: BPI got a −€1,000 that left from elsewhere). */
  sideOf: v.union(v.string(), v.null()),
  sideLogId: v.union(v.id('logs'), v.null()),
  fileId: v.union(v.id('intakes'), v.null()),
  /** A typed row on a day a balance already covers: that balance's time —
      the row changed no balance after it. */
  inside: v.union(v.number(), v.null()),
})

/**
 * One account, opened (A.4, 2 Oct — mocked and agreed): every row in it,
 * newest first, moves and trades included; every balance read, with the
 * file it came from; every file read into it; and for each pair of
 * balances, whether the rows between explain the change (src/lib/
 * cashHistory, balanceChecks). Sources 1 and 2; nothing estimated.
 */
export const accountSheet = query({
  args: { accountId: v.id('accounts') },
  returns: v.union(
    v.null(),
    v.object({
      readings: v.array(
        v.object({
          at: v.number(),
          /** The day it is a balance of — the file's printed date when a
              file set it (a statement's "balance of 31 Aug" is stored when
              he confirms, at 00:59 on 1 Sep), else when it was stored. */
          asOf: v.number(),
          value: v.number(),
          currency: v.string(),
          source: v.union(v.string(), v.null()),
          fileId: v.union(v.id('intakes'), v.null()),
        }),
      ),
      files: v.array(
        v.object({
          id: v.id('intakes'),
          title: v.string(),
          names: v.array(v.string()),
          images: v.boolean(),
          from: v.union(v.number(), v.null()),
          to: v.union(v.number(), v.null()),
          added: v.number(),
          readAt: v.number(),
        }),
      ),
      rows: v.array(sheetRow),
      checks: v.array(
        v.object({
          currency: v.string(),
          from: v.number(),
          to: v.number(),
          fromValue: v.number(),
          rows: v.number(),
          sum: v.number(),
          expected: v.number(),
          read: v.number(),
          missing: v.number(),
          /** Already in this balance, booked by the bank after it. */
          bookedLater: v.union(
            v.object({ amount: v.number(), at: v.number() }),
            v.null(),
          ),
          /** Pending at the bank with this balance, not itemised yet. */
          pendingPart: v.union(v.number(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const account = await ctx.db.get(args.accountId)
    if (account === null || account.ownerId !== ownerId) return null
    const logs = await ctx.db
      .query('logs')
      .withIndex('by_owner_account_time', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', account._id),
      )
      .order('desc')
      .take(SHEET_ROWS)
    const trades = account.kinds.includes('broker')
      ? await ctx.db
          .query('trades')
          .withIndex('by_owner_account', (q) =>
            q.eq('ownerId', ownerId).eq('accountId', account._id),
          )
          .take(TRADE_ROWS)
      : []

    /* The files: any that named this account, or that wrote a row here. */
    const added = new Map<Id<'intakes'>, number>()
    for (const l of logs)
      if (l.meta?.intakeId)
        added.set(l.meta.intakeId, (added.get(l.meta.intakeId) ?? 0) + 1)
    for (const t of trades)
      if (t.importId) added.set(t.importId, (added.get(t.importId) ?? 0) + 1)
    const intakes = (
      await ctx.db
        .query('intakes')
        .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
        .order('desc')
        .take(SHEET_FILES)
    ).filter(
      (i) =>
        i.status === 'done' &&
        (i.accountId === account._id || added.has(i._id)),
    )
    const files = intakes.map((i) => {
      const times = [
        ...(i.transactions ?? []).map((t) => t.occurredAt),
        ...(i.trades ?? []).map((t) => t.occurredAt),
      ]
      return {
        id: i._id,
        title: i.title ?? 'A file',
        names: (i.files ?? []).map((f) => f.name),
        images: (i.files ?? []).every((f) =>
          f.contentType.startsWith('image/'),
        ),
        from: times.length ? Math.min(...times) : null,
        to: times.length ? Math.max(...times) : null,
        added: added.get(i._id) ?? 0,
        readAt: i.readAt ?? i._creationTime,
      }
    })

    const others = new Map<Id<'accounts'>, string>()
    const otherName = async (id: Id<'accounts'> | undefined) => {
      if (id === undefined) return null
      if (!others.has(id)) {
        const o = await ctx.db.get(id)
        others.set(id, o !== null && o.ownerId === ownerId ? o.name : '')
      }
      return others.get(id) || null
    }

    const readings = []
    const checks = []
    const coverOf = new Map<string, Array<Reading>>()
    for (const currency of account.currencies) {
      const rows = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('key', `balance:${account._id}:${currency}`),
        )
        .take(500)
      const read: Array<Reading> = []
      for (const r of rows) {
        const file = intakes.find(
          (i) =>
            i.balance !== undefined &&
            i.balance.currency === currency &&
            Math.round(i.balance.value * 100) ===
              Math.round((r.value ?? 0) * 100) &&
            Math.abs(i.balance.asOf - r.recordedAt) <= FILE_READING_MS,
        )
        /* What the same screen showed as pending: the balance has it off. */
        const pending = (file?.transactions ?? [])
          .filter((t) => t.pending && t.currency === currency)
          .reduce((n, t) => n + Math.round(t.amount * 100), 0)
        read.push({
          at: r.recordedAt,
          value: r.value ?? 0,
          ...(pending !== 0 ? { pending: pending / 100 } : {}),
        })
        readings.push({
          at: r.recordedAt,
          asOf: file?.balance?.asOf ?? r.recordedAt,
          value: r.value ?? 0,
          currency,
          source: r.source ?? null,
          fileId: file?._id ?? null,
        })
      }
      coverOf.set(currency.toLowerCase(), read)
      for (const c of balanceChecks(read, pocketMoves(logs, trades, currency)))
        checks.push({ currency, ...c })
    }

    /* Whose file wrote a move into this account: another account's, when
       this row is only the other side of what that file read. */
    const fileAccount = new Map<Id<'intakes'>, Id<'accounts'> | null>()
    const sideOf = async (l: Doc<'logs'>) => {
      const none = { sideOf: null, sideLogId: null }
      if (l.kind !== 'move' || l.meta?.intakeId === undefined) return none
      const id = l.meta.intakeId
      if (!fileAccount.has(id))
        fileAccount.set(id, (await ctx.db.get(id))?.accountId ?? null)
      const from = fileAccount.get(id) ?? null
      if (from === null || from === account._id) return none
      return { sideOf: await otherName(from), sideLogId: l._id }
    }
    const out = []
    for (const l of logs) {
      if (l.area !== 'money' || l.value === undefined) continue
      const kind =
        l.kind === 'expense'
          ? ('spend' as const)
          : l.kind === 'income'
            ? ('income' as const)
            : l.kind === 'move'
              ? ('move' as const)
              : null
      if (kind === null) continue
      const typed = l.meta?.intakeId === undefined
      const cover = typed
        ? coveredBy(l.occurredAt, coverOf.get(l.unit ?? '') ?? [])
        : null
      out.push({
        id: l._id,
        at: l.occurredAt,
        kind,
        amount: kind === 'spend' ? -l.value : l.value,
        currency: (l.unit ?? 'eur').toUpperCase(),
        text: l.meta?.merchant ?? l.text ?? '',
        category: l.meta?.category ?? null,
        other: await otherName(l.meta?.otherAccountId),
        logId: typed ? l._id : null,
        ...(await sideOf(l)),
        fileId: l.meta?.intakeId ?? null,
        inside: cover?.at ?? null,
      })
    }
    const symbols = new Map<Id<'instruments'>, string>()
    for (const t of trades) {
      if (!symbols.has(t.instrumentId)) {
        const i = await ctx.db.get(t.instrumentId)
        symbols.set(
          t.instrumentId,
          i !== null && i.ownerId === ownerId ? i.symbol : 'A share',
        )
      }
      const cost = Math.round(t.shares * t.priceEur * 100) / 100
      out.push({
        id: t._id,
        at: t.occurredAt,
        kind: t.side,
        amount: t.side === 'buy' ? -cost : cost,
        currency: 'EUR',
        text: `${symbols.get(t.instrumentId)} · ${Math.round(t.shares * 1e6) / 1e6} sh`,
        category: null,
        other: null,
        logId: null,
        sideOf: null,
        sideLogId: null,
        fileId: t.importId ?? null,
        inside: null,
      })
    }
    out.sort((a, b) => b.at - a.at)
    return { readings, files, rows: out, checks }
  },
})

/* A statement's rows are stamped at noon of their day, and a statement's
   closing balance can be confirmed at 2 am on its own closing day; a row
   read off a file counts after a reading only from the next day on. */
const FILE_ROW_GRACE_MS = 12 * 3_600_000
const MOVED_ROWS = 2000

/**
 * What moved in one pocket after its reading: signed, in cents of the
 * pocket's currency. Spending out, money in, a transfer's own side; in the
 * euro pocket of an account with trades, buys out and sells in.
 */
export async function movedSince(
  ctx: QueryCtx,
  ownerId: string,
  account: Doc<'accounts'>,
  currency: string,
  readAt: number,
  /** Up to and including this moment; now when absent. */
  until?: number,
): Promise<{ cents: number; rows: number }> {
  const unit = currency.toLowerCase()
  const logs = await ctx.db
    .query('logs')
    .withIndex('by_owner_account_time', (q) => {
      const from = q
        .eq('ownerId', ownerId)
        .eq('accountId', account._id)
        .gt('occurredAt', readAt)
      return until === undefined ? from : from.lte('occurredAt', until)
    })
    .take(MOVED_ROWS)
  let cents = 0
  let rows = 0
  for (const l of logs) {
    if (l.area !== 'money' || l.unit !== unit || l.value === undefined) continue
    if (
      l.meta?.intakeId !== undefined &&
      l.occurredAt <= readAt + FILE_ROW_GRACE_MS
    )
      continue
    const signed =
      l.kind === 'expense'
        ? -l.value
        : l.kind === 'income' || l.kind === 'move'
          ? l.value
          : 0
    if (signed === 0) continue
    cents += Math.round(signed * 100)
    rows++
  }
  if (currency === 'EUR' && account.kinds.includes('broker')) {
    const trades = await ctx.db
      .query('trades')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', ownerId).eq('accountId', account._id),
      )
      .take(TRADE_ROWS)
    for (const t of trades) {
      if (t.opening === true || t.noCash === true || t.occurredAt <= readAt)
        continue
      const cost = Math.round(t.shares * t.priceEur * 100)
      cents += t.side === 'buy' ? -cost : cost
      rows++
    }
  }
  return { cents, rows }
}

async function readPositions(ctx: QueryCtx, ownerId: string) {
  /* A deleted account with history is retired, not erased — and what it
     held leaves every total with it (27 Sep: his deleted test accounts
     still counted in the hero). */
  const live = new Set(
    (
      await ctx.db
        .query('accounts')
        .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
        .take(ACCOUNT_ROWS)
    )
      .filter((a) => a.retiredAt === undefined)
      .map((a) => a._id),
  )
  const trades = (
    await ctx.db
      .query('trades')
      .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
      .take(TRADE_ROWS)
  ).filter((t) => live.has(t.accountId))

  const looks = (
    await ctx.db
      .query('holdings')
      .withIndex('by_owner_account', (q) => q.eq('ownerId', ownerId))
      .take(HOLDING_ROWS)
  ).filter((h) => live.has(h.accountId))

  const held = new Map<
    string,
    {
      accountId: Id<'accounts'>
      instrumentId: Id<'instruments'>
      trades: Array<LedgerTrade>
      staked: number
      looks: Array<Observation>
    }
  >()
  const slot = (accountId: Id<'accounts'>, instrumentId: Id<'instruments'>) => {
    const key = `${accountId}:${instrumentId}`
    let p = held.get(key)
    if (p === undefined) {
      p = { accountId, instrumentId, trades: [], looks: [], staked: 0 }
      held.set(key, p)
    }
    return p
  }
  for (const t of trades) {
    const p = slot(t.accountId, t.instrumentId)
    p.trades.push(t)
    if (t.reward) p.staked += t.shares
  }
  /* Stored oldest first, so on a tie the later look wins. */
  const lastLook = new Map<Id<'accounts'>, number>()
  for (const h of looks) {
    slot(h.accountId, h.instrumentId).looks.push({
      shares: h.shares,
      paidEur: h.paidEur,
      asOf: h.asOf,
    })
    lastLook.set(h.accountId, Math.max(lastLook.get(h.accountId) ?? 0, h.asOf))
  }

  const rates = new Map<string, { rate: number; asOf: number } | null>()
  async function rateFor(base: string) {
    if (base === 'EUR') return { rate: 1, asOf: null }
    if (!rates.has(base)) {
      const row = await ctx.db
        .query('fxRates')
        .withIndex('by_owner_currency_time', (q) =>
          q.eq('ownerId', ownerId).eq('currency', base),
        )
        .order('desc')
        .first()
      rates.set(base, row === null ? null : { rate: row.rate, asOf: row.asOf })
    }
    const r = rates.get(base) ?? null
    return r === null ? null : { rate: r.rate, asOf: r.asOf as number | null }
  }

  const rows = []
  for (const p of held.values()) {
    /* A position sold out is not shown. */
    const r = reconcile(p.trades, p.looks)
    const shares = r.shares
    if (shares <= 0) continue
    const instrument = await ctx.db.get(p.instrumentId)
    if (instrument === null || instrument.ownerId !== ownerId) continue
    const price = await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q.eq('ownerId', ownerId).eq('instrumentId', p.instrumentId),
      )
      .order('desc')
      .first()
    const { base, divide } = quoteToRate(instrument.currency)
    const rate = await rateFor(base)
    const valueEur =
      price === null || rate === null
        ? null
        : Math.round(((shares * price.price) / divide) * rate.rate * 100) / 100
    rows.push({
      accountId: p.accountId,
      instrumentId: p.instrumentId,
      symbol: instrument.symbol,
      name: instrument.name,
      type: instrument.type,
      currency: instrument.currency,
      shares,
      paid: r.paid,
      status: r.status,
      seenAt: r.seenAt,
      gap: r.gap,
      notSeen: notSeenSince(r.seenAt, lastLook.get(p.accountId) ?? null),
      price: price?.price ?? null,
      priceAsOf: price?.asOf ?? null,
      rate: rate?.rate ?? null,
      rateAsOf: rate?.asOf ?? null,
      valueEur,
      staked: Math.round(p.staked * 1e6) / 1e6,
    })
  }
  rows.sort((a, b) => (b.valueEur ?? b.paid ?? 0) - (a.valueEur ?? a.paid ?? 0))
  let cents = 0
  let oldestPriceAsOf: number | null = null
  let unvalued = 0
  for (const r of rows) {
    if (r.valueEur === null || r.priceAsOf === null) {
      unvalued++
      continue
    }
    cents += Math.round(r.valueEur * 100)
    oldestPriceAsOf =
      oldestPriceAsOf === null
        ? r.priceAsOf
        : Math.min(oldestPriceAsOf, r.priceAsOf)
  }
  return {
    rows,
    totalEur: cents / 100,
    oldestPriceAsOf,
    unvalued,
    complete: trades.length < TRADE_ROWS && looks.length < HOLDING_ROWS,
  }
}

/**
 * What is his, split the way he thinks of it (26 Sep: "we need to
 * distinguish free cash and investments. And in revolut i have some cash
 * and broker account with investments").
 *
 * An account's balance is its FREE CASH — the money not in shares, typed
 * off the app. Its INVESTED is the value of the positions held in it
 * (readPositions). So one account can hold both, and nothing is counted
 * twice: a broker's typed balance is the cash it holds, never its total.
 *
 * Both totals, and the two added, are sums on PLAN.md §1's conditions:
 * euros, each shown with the oldest reading in it — the cash's oldest
 * typed balance, the investments' oldest close.
 */
export const worth = query({
  args: {},
  returns: v.object({
    cash: v.object({
      total: v.number(),
      oldestAt: v.union(v.number(), v.null()),
      unread: v.number(),
    }),
    invested: v.object({
      total: v.number(),
      oldestAt: v.union(v.number(), v.null()),
      unvalued: v.number(),
    }),
    total: v.number(),
    byAccount: v.array(
      v.object({
        accountId: v.id('accounts'),
        cash: v.union(v.number(), v.null()),
        invested: v.union(v.number(), v.null()),
        positions: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const b = await readBalances(ctx, ownerId)
    const p = await readPositions(ctx, ownerId)
    const byAccount = b.accounts.map((a) => {
      const held = p.rows.filter((r) => r.accountId === a.accountId)
      const cents = held.reduce(
        (n, r) => n + (r.valueEur === null ? 0 : Math.round(r.valueEur * 100)),
        0,
      )
      return {
        accountId: a.accountId,
        cash: a.pockets.some((pk) => pk.eur !== null) ? a.cashEur : null,
        invested: held.length === 0 ? null : cents / 100,
        positions: held.length,
      }
    })
    return {
      cash: { total: b.total, oldestAt: b.oldestAt, unread: b.unread },
      invested: {
        total: p.totalEur,
        oldestAt: p.oldestPriceAsOf,
        unvalued: p.unvalued,
      },
      total: (Math.round(b.total * 100) + Math.round(p.totalEur * 100)) / 100,
      byAccount,
    }
  },
})

/* ── Flow (3 Oct; docs/specs/2026-10-03-flow.md) ─────────────────────── */

const billOut = v.object({
  t: v.number(),
  billId: v.id('recurring'),
  name: v.string(),
  kind: v.union(v.literal('expense'), v.literal('income')),
  amount: v.number(),
  accountId: v.optional(v.id('accounts')),
})
const point = v.object({
  t: v.number(),
  bills: v.number(),
  upper: v.number(),
  lower: v.number(),
})

async function liveBills(ctx: QueryCtx, ownerId: string) {
  return (
    await ctx.db
      .query('recurring')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .take(100)
  ).filter((b) => b.refusedAt === undefined)
}

function aheadBill(b: Doc<'recurring'>): AheadBill {
  return {
    id: b._id,
    name: b.name,
    kind: b.kind,
    amount: b.amount,
    accountId: b.accountId,
    category: b.category,
    cadence: b.cadence,
    day: b.day,
    month: b.month,
    key: b.matchKey ?? payeeKey(b.name),
    foundAt: b.foundAt,
    varies: b.varies,
    everyMonths: b.everyMonths,
    everyWeeks: b.everyWeeks,
    anchor: b.anchor,
    lo: b.lo,
    hi: b.hi,
    /* A cancelled one still explains the payments it had (4 Oct). */
    endedAt: b.endedAt,
  }
}

function aheadRows(rows: ReadonlyArray<Doc<'logs'>>): Array<AheadRow> {
  const out: Array<AheadRow> = []
  for (const r of rows) {
    if ((r.kind !== 'expense' && r.kind !== 'income') || !countsInOut(r)) {
      continue
    }
    out.push({
      id: r._id,
      kind: r.kind,
      amount: r.value,
      t: r.occurredAt,
      key: rowKey(r),
      recurringId: r.meta?.recurringId,
    })
  }
  return out
}

async function moneyIn(
  ctx: QueryCtx,
  ownerId: string,
  start: number,
  end: number,
) {
  return await ctx.db
    .query('logs')
    .withIndex('by_owner_area_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .eq('area', 'money')
        .gte('occurredAt', start)
        .lt('occurredAt', end),
    )
    .take(MONEY_ROWS)
}

/** A bank's first row within three days of a month's start is a whole
    month: statements begin on the first weekday with a payment. */
const PARTIAL_GRACE = 3 * 86_400_000

/**
 * AHEAD: free cash from today (state), his bills and salary on their days
 * (the plan he has or the app found), and the rest of his spending as a
 * range of the last three full months' real sums — src/lib/ahead does the
 * arithmetic. Month bounds and today arrive from the client, local.
 */
export const ahead = query({
  args: {
    today: v.number(),
    days: v.number(),
    monthStart: v.number(),
    /** The last three full months, oldest first. */
    past: v.array(v.object({ start: v.number(), end: v.number() })),
  },
  returns: v.object({
    free: v.array(
      v.object({
        accountId: v.id('accounts'),
        name: v.string(),
        domain: v.union(v.string(), v.null()),
        eur: v.number(),
      }),
    ),
    freeTotal: v.number(),
    unread: v.number(),
    bills: v.array(
      v.object({
        id: v.id('recurring'),
        name: v.string(),
        kind: v.union(v.literal('expense'), v.literal('income')),
        amount: v.number(),
        cadence: v.union(v.literal('monthly'), v.literal('yearly')),
        category: v.optional(v.string()),
        accountId: v.optional(v.id('accounts')),
        isNew: v.boolean(),
        /** The payee key, for his payee name and logo. */
        key: v.string(),
        varies: v.boolean(),
        lo: v.optional(v.number()),
        hi: v.optional(v.number()),
        everyMonths: v.optional(v.number()),
        everyWeeks: v.optional(v.number()),
        asksMonths: v.boolean(),
      }),
    ),
    done: v.array(
      v.object({
        t: v.number(),
        billId: v.id('recurring'),
        name: v.string(),
        kind: v.union(v.literal('expense'), v.literal('income')),
        amount: v.number(),
        accountId: v.optional(v.id('accounts')),
        rowId: v.union(v.id('logs'), v.null()),
      }),
    ),
    events: v.array(
      v.object({
        ...billOut.fields,
        yearly: v.boolean(),
        short: v.boolean(),
        held: v.union(v.number(), v.null()),
      }),
    ),
    rest: v.array(
      v.object({
        start: v.number(),
        sum: v.number(),
        /** Banks read only from partway through the month. */
        partial: v.array(v.object({ name: v.string(), from: v.number() })),
      }),
    ),
    range: v.union(v.object({ lo: v.number(), hi: v.number() }), v.null()),
    series: v.array(point),
    low: point,
    salaryAt: v.union(v.number(), v.null()),
    /** His bills as a month: every monthly one by group, the mortgage
        and the subscriptions alike, and the once-a-year ones apart. */
    eachMonth: v.object({
      total: v.number(),
      groups: v.array(
        v.object({
          category: v.union(v.string(), v.null()),
          sum: v.number(),
          names: v.array(v.string()),
        }),
      ),
      yearly: v.object({ total: v.number(), count: v.number() }),
    }),
    year: v.object({
      total: v.number(),
      months: v.array(v.object({ month: v.number(), sum: v.number() })),
      yearly: v.array(
        v.object({ t: v.number(), name: v.string(), amount: v.number() }),
      ),
    }),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const days = Math.min(Math.max(1, Math.round(args.days)), 120)
    /* Cancelled ones still pay their past rows; only what is due goes. */
    const all = await liveBills(ctx, ownerId)
    const items = all.filter((b) => b.endedAt === undefined)
    const bills = all.map(aheadBill)
    const read = await readBalances(ctx, ownerId)
    /* Free cash: banks and cash. A broker's cash is waiting to be
       invested, not for bills (journey, question 6). */
    const free = read.accounts.filter(
      (a) => a.kinds.includes('bank') || a.kinds.includes('cash'),
    )
    const monthRows = aheadRows(
      await moneyIn(ctx, ownerId, args.monthStart, args.today + 86_400_000),
    )
    /* Where each bank's rows begin: a month before that is unread for
       it, and one it begins partway through is partial. */
    const firsts: Array<{ name: string; from: number }> = []
    for (const a of free) {
      const first = await ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q.eq('ownerId', ownerId).eq('accountId', a.accountId),
        )
        .first()
      if (first) firsts.push({ name: a.name, from: first.occurredAt })
    }
    const partialOf = (p: { start: number; end: number }) =>
      firsts.filter((f) => f.from > p.start + PARTIAL_GRACE && f.from < p.end)
    const past = []
    for (const p of args.past.slice(-3)) {
      past.push({
        start: p.start,
        rows: aheadRows(await moneyIn(ctx, ownerId, p.start, p.end)),
        partial: partialOf(p).map((f) => f.name),
      })
    }
    const built = buildAhead({
      today: args.today,
      days,
      bills,
      monthRows,
      monthStart: args.monthStart,
      past,
      free: free.map((a) => ({ accountId: a.accountId, eur: a.cashEur })),
    })
    const week = 7 * 86_400_000
    const cast = <T extends { billId: string; accountId?: string }>(x: T) => ({
      ...x,
      billId: x.billId as Id<'recurring'>,
      accountId: x.accountId as Id<'accounts'> | undefined,
    })
    return {
      free: free.map((a) => ({
        accountId: a.accountId,
        name: a.name,
        domain: a.domain,
        eur: a.cashEur,
      })),
      freeTotal: built.freeTotal,
      unread: read.unread,
      bills: items.map((b) => ({
        id: b._id,
        name: b.name,
        kind: b.kind,
        amount: b.amount,
        cadence: b.cadence,
        category: b.category,
        accountId: b.accountId,
        isNew: b.foundAt !== undefined && args.today - b.foundAt < week,
        key: b.matchKey ?? payeeKey(b.name),
        varies: b.varies === true,
        lo: b.lo,
        hi: b.hi,
        everyMonths: b.everyMonths,
        everyWeeks: b.everyWeeks,
        asksMonths: b.asksMonths === true,
      })),
      done: built.done.map((d) => ({
        ...cast(d),
        rowId: d.rowId as Id<'logs'> | null,
      })),
      events: built.events.map(cast),
      rest: built.rest.map((r) => {
        const p = args.past.find((x) => x.start === r.start)
        return { ...r, partial: p ? partialOf(p) : [] }
      }),
      range: built.range,
      series: built.series,
      low: built.low,
      salaryAt: built.salaryAt,
      eachMonth: billsEachMonth(items.map(aheadBill)),
      year: yearAhead(bills, args.today),
    }
  },
})

/**
 * SPENDING and the month line: per month, money in and out and out by
 * group (the category), sums of logged euro rows — moves are their own
 * kind and never in them. Up to seven months, bounds from the client.
 */
export const flowMonths = query({
  args: { months: v.array(v.object({ start: v.number(), end: v.number() })) },
  returns: v.array(
    v.object({
      start: v.number(),
      in: v.number(),
      out: v.number(),
      rows: v.number(),
      groups: v.array(
        v.object({
          category: v.union(v.string(), v.null()),
          sum: v.number(),
          count: v.number(),
        }),
      ),
      complete: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const out = []
    for (const m of args.months.slice(-7)) {
      const rows = await moneyIn(ctx, ownerId, m.start, m.end)
      let inC = 0
      let outC = 0
      let n = 0
      const groups = new Map<
        string,
        { category: string | null; c: number; n: number }
      >()
      for (const r of rows) {
        if ((r.kind !== 'expense' && r.kind !== 'income') || !countsInOut(r)) {
          continue
        }
        n++
        const c = Math.round(r.value * 100)
        if (r.kind === 'income') {
          inC += c
          continue
        }
        outC += c
        const category = r.meta?.category ?? null
        const g = groups.get(category ?? '') ?? { category, c: 0, n: 0 }
        g.c += c
        g.n++
        groups.set(category ?? '', g)
      }
      out.push({
        start: m.start,
        in: inC / 100,
        out: outC / 100,
        rows: n,
        groups: [...groups.values()]
          .sort((a, b) => b.c - a.c)
          .map((g) => ({ category: g.category, sum: g.c / 100, count: g.n })),
        complete: rows.length < MONEY_ROWS,
      })
    }
    return out
  },
})

const payMonthShape = v.object({
  start: v.number(),
  end: v.number(),
  salary: v.number(),
  other: v.number(),
  bills: v.number(),
  dayToDay: v.number(),
})

/**
 * The pay month (4 Oct, his pick): salary to salary, split into salary,
 * other money in, bills and day-to-day, with the five before it — sums
 * of his rows (source 1) cut at the days his salary landed. Null until a
 * salary is known. src/lib/payMonth does the arithmetic.
 */
export const payMonth = query({
  args: { today: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      salaryName: v.string(),
      current: v.object({
        ...payMonthShape.fields,
        day: v.number(),
        length: v.number(),
        balance: v.number(),
        billsLeft: v.number(),
        salaryLate: v.boolean(),
        pace: v.union(
          v.null(),
          v.object({ now: v.number(), last: v.number() }),
        ),
        paid: v.array(
          v.object({ name: v.string(), amount: v.number(), t: v.number() }),
        ),
      }),
      past: v.array(payMonthShape),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const bills = (await liveBills(ctx, ownerId)).map(aheadBill)
    const rows = await ctx.db
      .query('logs')
      .withIndex('by_owner_area_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('area', 'money')
          .gte('occurredAt', args.today - 200 * 86_400_000)
          .lt('occurredAt', args.today + 86_400_000),
      )
      .take(MONEY_ROWS * 4)
    return payMonths({ rows: aheadRows(rows), bills, today: args.today })
  },
})

const detailRow = v.object({
  id: v.id('logs'),
  t: v.number(),
  name: v.string(),
  amount: v.number(),
  raw: v.optional(v.string()),
  category: v.optional(v.string()),
  accountId: v.optional(v.id('accounts')),
  /** His name for this one row (a PayPal payment). */
  payee: v.optional(v.string()),
})

/**
 * SPENDING (4 Oct): one pay month opened — every bill payment with its
 * bill, the bills still due, day-to-day by group with every row and last
 * pay month's figure, money in. The same rows payMonth sums, listed.
 */
export const payMonthDetail = query({
  args: {
    start: v.number(),
    end: v.number(),
    prev: v.union(v.null(), v.object({ start: v.number(), end: v.number() })),
    today: v.number(),
  },
  returns: v.object({
    bills: v.array(
      v.object({
        billId: v.id('recurring'),
        billName: v.string(),
        /** One payment for several months (the condominium). */
        everyMonths: v.optional(v.number()),
        row: detailRow,
      }),
    ),
    todo: v.array(
      v.object({
        billId: v.id('recurring'),
        name: v.string(),
        amount: v.number(),
        t: v.number(),
        accountId: v.optional(v.id('accounts')),
      }),
    ),
    groups: v.array(
      v.object({
        category: v.union(v.string(), v.null()),
        sum: v.number(),
        last: v.union(v.number(), v.null()),
        rows: v.array(detailRow),
      }),
    ),
    moneyIn: v.array(v.object({ salary: v.boolean(), row: detailRow })),
    /** Lent and paid back in this pay month: in no sum above. */
    lent: v.array(
      v.object({
        kind: v.union(v.literal('expense'), v.literal('income')),
        row: detailRow,
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const bills = (await liveBills(ctx, ownerId)).map(aheadBill)
    const logs = await ctx.db
      .query('logs')
      .withIndex('by_owner_area_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('area', 'money')
          .gte('occurredAt', args.prev?.start ?? args.start)
          .lt('occurredAt', args.end),
      )
      .take(MONEY_ROWS * 2)
    const rows = []
    const lent = []
    for (const l of logs) {
      if ((l.kind !== 'expense' && l.kind !== 'income') || !isEuroAmount(l)) {
        continue
      }
      if (isLent(l)) {
        if (l.occurredAt >= args.start) {
          lent.push({
            kind: l.kind,
            row: {
              id: l._id,
              t: l.occurredAt,
              name: l.meta?.merchant ?? l.text ?? '',
              amount: l.value,
              raw: l.meta?.raw,
              category: l.meta?.category,
              accountId: l.accountId,
              payee: l.meta?.payee,
            },
          })
        }
        continue
      }
      rows.push({
        id: l._id,
        kind: l.kind,
        amount: l.value,
        t: l.occurredAt,
        key: rowKey(l),
        recurringId: l.meta?.recurringId,
        name: l.meta?.merchant ?? l.text ?? '',
        raw: l.meta?.raw,
        category: l.meta?.category,
        accountId: l.accountId,
        payee: l.meta?.payee,
      })
    }
    const d = openPayMonth({ ...args, rows, bills })
    const out = (r: DetailRow) => ({
      id: r.id as Id<'logs'>,
      t: r.t,
      name: r.name,
      amount: r.amount,
      raw: r.raw,
      category: r.category,
      accountId: r.accountId as Id<'accounts'> | undefined,
      payee: r.payee,
    })
    return {
      bills: d.bills.map((b) => ({
        billId: b.bill.id as Id<'recurring'>,
        billName: b.bill.name,
        everyMonths: b.bill.everyMonths,
        row: out(b.row),
      })),
      todo: d.todo.map((x) => ({
        billId: x.bill.id as Id<'recurring'>,
        name: x.bill.name,
        amount: x.bill.amount,
        t: x.t,
        accountId: x.bill.accountId as Id<'accounts'> | undefined,
      })),
      groups: d.groups.map((g) => ({ ...g, rows: g.rows.map(out) })),
      moneyIn: d.moneyIn.map((m) => ({ salary: m.salary, row: out(m.row) })),
      lent: lent.sort((a, b) => a.row.t - b.row.t),
    }
  },
})
