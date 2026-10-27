import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import { rowKey } from '../../src/lib/payee'
import {
  countIn,
  dayMarks,
  isShake,
  isWorkout,
  kindCounts,
  projectWeek,
  spentWeek,
} from '../../src/lib/review'
import type { QueryCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'
import { MAX_ROWS, MONEY_ROWS } from './limits'

/* Review's week (R7): its args, result and the read behind weekReview,
   shared with the week read in weekReads.ts. */

export const REVIEW_PROJECTS = ['focus', 'active', 'paused'] as const

/** What `weekReview` takes: the week as the page's local midnights. */
export const weekReviewArgs = v.object({
  /** Fourteen local midnights: last week's Monday to this week's Sunday. */
  dayStarts: v.array(v.number()),
  /** The midnight after this week's Sunday — exclusive. */
  end: v.number(),
  /** The Monday three weeks before this one: four whole weeks to `end`. */
  fourWeeksStart: v.number(),
  /** Language area slugs, from areas.list. */
  languages: v.array(v.string()),
})

export const weekReviewResult = v.object({
  money: v.object({
    spent: v.number(),
    lastSpent: v.number(),
    bills: v.number(),
    byDay: v.array(v.number()),
    count: v.number(),
    biggest: v.array(
      v.object({
        _id: v.id('logs'),
        name: v.string(),
        /** The site of its logo, when the payee was named with one. */
        domain: v.union(v.string(), v.null()),
        category: v.union(v.string(), v.null()),
        amount: v.number(),
        occurredAt: v.number(),
      }),
    ),
  }),
  /** This week's days, Monday first: what each carried besides commits
      and money out — the week bar's badges. */
  days: v.array(
    v.object({
      in: v.number(),
      workouts: v.array(v.string()),
      shakes: v.number(),
      languages: v.array(v.string()),
    }),
  ),
  projects: v.array(
    v.object({
      _id: v.id('projects'),
      title: v.string(),
      focus: v.boolean(),
      area: v.optional(v.string()),
      logoUrl: v.union(v.string(), v.null()),
      target: v.union(v.number(), v.null()),
      thisWeek: v.number(),
      lastWeek: v.number(),
      days: v.array(v.number()),
    }),
  ),
  body: v.object({
    workouts: v.number(),
    workouts4: v.number(),
    shakes: v.number(),
    shakes4: v.number(),
    /** Workouts per kind over the four weeks, most first. */
    kinds: v.array(v.object({ category: v.string(), count: v.number() })),
    weight: v.union(v.object({ value: v.number(), at: v.number() }), v.null()),
  }),
  languages: v.array(
    v.object({ slug: v.string(), week: v.number(), four: v.number() }),
  ),
  /** False when a read hit its cap — a number may be missing rows. */
  complete: v.boolean(),
})

/* The query's counting, apart from it, so weekReads.run stores exactly the
   numbers the page shows when it asks the AI to read the week. */
export async function weekReviewFor(
  ctx: QueryCtx,
  ownerId: string,
  args: Infer<typeof weekReviewArgs>,
): Promise<Infer<typeof weekReviewResult>> {
  if (args.dayStarts.length !== 14) throw new Error('FOURTEEN_DAYS')
  const lastStarts = args.dayStarts.slice(0, 7)
  const starts = args.dayStarts.slice(7)
  const lastWeekStart = lastStarts[0]
  const start = starts[0]
  let complete = true

  /* Four weeks of logs in one read: money for this week and last, the
     hand logs for this week and the four. */
  const logs = await ctx.db
    .query('logs')
    .withIndex('by_owner_time', (q) =>
      q
        .eq('ownerId', ownerId)
        .gte('occurredAt', args.fourWeeksStart)
        .lt('occurredAt', args.end),
    )
    .take(MONEY_ROWS)
  if (logs.length === MONEY_ROWS) complete = false

  const money = logs.filter((l) => l.area === 'money')
  const week = spentWeek(money, starts, args.end)
  const last = spentWeek(money, lastStarts, start)
  /* The biggest rows under the names he gave their payees (payees.set),
     as every Finances list shows them. */
  const biggest = []
  for (const b of week.biggest) {
    const row = money.find((m) => m._id === b._id)
    const named =
      row === undefined
        ? null
        : await ctx.db
            .query('payees')
            .withIndex('by_owner_key', (q) =>
              q.eq('ownerId', ownerId).eq('key', rowKey(row)),
            )
            .first()
    biggest.push({
      ...b,
      _id: b._id as Id<'logs'>,
      name: named?.name ?? b.name,
      domain: named?.domain ?? null,
    })
  }
  const weight = await ctx.db
    .query('stateSnapshots')
    .withIndex('by_owner_key_time', (q) =>
      q.eq('ownerId', ownerId).eq('key', 'weight').lt('recordedAt', args.end),
    )
    .order('desc')
    .first()

  const projects = []
  for (const status of REVIEW_PROJECTS) {
    const rows = await ctx.db
      .query('projects')
      .withIndex('by_owner_status', (q) =>
        q.eq('ownerId', ownerId).eq('status', status),
      )
      .take(MAX_ROWS)
    for (const project of rows) {
      const commits = await ctx.db
        .query('commits')
        .withIndex('by_owner_project_time', (q) =>
          q
            .eq('ownerId', ownerId)
            .eq('projectId', project._id)
            .gte('authoredAt', lastWeekStart)
            .lt('authoredAt', args.end),
        )
        .take(MAX_ROWS)
      if (commits.length === MAX_ROWS) complete = false
      const counted = projectWeek(
        commits,
        project.githubRepo,
        lastWeekStart,
        starts,
        args.end,
      )
      projects.push({
        _id: project._id,
        title: project.title,
        focus: project.status === 'focus',
        area: project.area,
        logoUrl:
          project.logoId === undefined
            ? null
            : await ctx.storage.getUrl(project.logoId),
        target: project.commitTargetWeekly ?? null,
        ...counted,
      })
    }
  }

  return {
    money: {
      spent: week.spent,
      lastSpent: last.spent,
      bills: week.bills,
      byDay: week.byDay,
      count: week.count,
      biggest,
    },
    days: dayMarks(logs, starts, args.end, args.languages),
    projects,
    body: {
      workouts: countIn(logs, start, args.end, isWorkout),
      workouts4: countIn(logs, args.fourWeeksStart, args.end, isWorkout),
      shakes: countIn(logs, start, args.end, isShake),
      shakes4: countIn(logs, args.fourWeeksStart, args.end, isShake),
      kinds: kindCounts(logs, args.fourWeeksStart, args.end),
      weight:
        weight?.value === undefined
          ? null
          : { value: weight.value, at: weight.recordedAt },
    },
    languages: args.languages.map((slug) => {
      const isSession = (l: Doc<'logs'>) =>
        l.area === slug && l.kind === 'session'
      return {
        slug,
        week: countIn(logs, start, args.end, isSession),
        four: countIn(logs, args.fourWeeksStart, args.end, isSession),
      }
    }),
    complete,
  }
}
