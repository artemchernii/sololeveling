import { ConvexError, v } from 'convex/values'

import { internalQuery, query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import { requireUser } from './auth'
import { spentIn } from './marketReads'
import { BUILTIN_AREAS } from '../src/lib/area-slug'
import { capFor } from './profiles'
import { DAY, MAX_DAYS, MAX_ROWS } from '../src/lib/rowsAsk'
import type { AskRows } from '../src/lib/rowsAsk'

/* R7 Ask AI: the rows a question reads — his logs in the period, the
   commits of his projects (merges left out, as every count does), his
   goals' words, and the area names. Read once per question (the drawer
   calls it with `convex.query`, never a subscription; the action through
   `forOwner`), owner-scoped through indexes, bounded by the period. */

const askLog = v.object({
  id: v.string(),
  at: v.number(),
  kind: v.string(),
  area: v.string(),
  text: v.optional(v.string()),
  value: v.optional(v.number()),
  unit: v.optional(v.string()),
  category: v.optional(v.string()),
  project: v.optional(v.string()),
})
export const askRowsShape = v.object({
  logs: v.array(askLog),
  commits: v.array(
    v.object({
      id: v.string(),
      at: v.number(),
      project: v.string(),
      message: v.string(),
    }),
  ),
  goals: v.array(
    v.object({
      title: v.string(),
      area: v.optional(v.string()),
      target: v.optional(v.number()),
      unit: v.optional(v.string()),
      status: v.string(),
    }),
  ),
  more: v.boolean(),
})
const answer = v.object({
  rows: askRowsShape,
  areas: v.array(v.object({ slug: v.string(), label: v.string() })),
})

async function readRows(
  ctx: QueryCtx,
  ownerId: string,
  from: number,
  to: number,
) {
  if (!(from < to) || to - from > (MAX_DAYS + 1) * DAY)
    throw new ConvexError('BAD_PERIOD')
  const projects = await ctx.db
    .query('projects')
    .withIndex('by_owner_status', (q) => q.eq('ownerId', ownerId))
    .collect()
  const title = new Map(projects.map((p) => [p._id as string, p.title]))

  const logs = await ctx.db
    .query('logs')
    .withIndex('by_owner_time', (q) =>
      q.eq('ownerId', ownerId).gte('occurredAt', from).lt('occurredAt', to),
    )
    .take(MAX_ROWS + 1)
  const commits: AskRows['commits'] = []
  for (const p of projects) {
    const rows = await ctx.db
      .query('commits')
      .withIndex('by_owner_project_time', (q) =>
        q
          .eq('ownerId', ownerId)
          .eq('projectId', p._id)
          .gte('authoredAt', from)
          .lt('authoredAt', to),
      )
      .take(MAX_ROWS)
    for (const c of rows)
      if (c.isMerge !== true)
        commits.push({
          id: c._id,
          at: c.authoredAt,
          project: p.title,
          message: c.message,
        })
  }
  const goals = await ctx.db
    .query('goals')
    .withIndex('by_owner_status', (q) =>
      q.eq('ownerId', ownerId).eq('status', 'active'),
    )
    .take(50)
  const areas = await ctx.db
    .query('areas')
    .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
    .collect()
  const labels = new Map<string, string>(
    BUILTIN_AREAS.map((a) => [a.slug, a.label]),
  )
  for (const a of areas) labels.set(a.slug, a.label)

  const rows: AskRows = {
    logs: logs.slice(0, MAX_ROWS).map((l) => ({
      id: l._id,
      at: l.occurredAt,
      kind: l.kind,
      area: l.area,
      text: l.meta?.payee ?? l.meta?.merchant ?? l.text,
      value: l.value,
      unit: l.unit,
      category: l.meta?.category,
      project: l.projectId ? title.get(l.projectId) : undefined,
    })),
    commits: commits.sort((a, b) => a.at - b.at).slice(0, MAX_ROWS),
    goals: goals.map((g) => ({
      title: g.title,
      area: g.area,
      target: g.targetValue,
      unit: g.unit,
      status: g.status,
    })),
    more: logs.length > MAX_ROWS || commits.length > MAX_ROWS,
  }
  return {
    rows,
    areas: [...labels].map(([slug, label]) => ({ slug, label })),
  }
}

export const forPeriod = query({
  args: { from: v.number(), to: v.number() },
  returns: answer,
  handler: async (ctx, args) =>
    readRows(ctx, await requireUser(ctx), args.from, args.to),
})

export const forOwner = internalQuery({
  args: { ownerId: v.string(), from: v.number(), to: v.number() },
  returns: answer,
  handler: async (ctx, args) => readRows(ctx, args.ownerId, args.from, args.to),
})

/** The month's API spend against the cap — the drawer's header when
    deployed. The same pot as Insights. */
export const spend = query({
  args: { month: v.string() },
  returns: v.object({ spent: v.number(), cap: v.number() }),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    return {
      spent: await spentIn(ctx, ownerId, args.month),
      cap: await capFor(ctx, ownerId),
    }
  },
})
