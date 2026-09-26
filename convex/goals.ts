import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { requireLiveArea } from './areas'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema, { areaSlug, tileValidator } from './schema'
import type { Tile } from './schema'

/* PLAN.md §2. A goal is the thing a project answers to. It carries a target only
   when one is real: `targetLabel` is the human form ("B2", "€80,000"), and
   `targetValue` + `unit` exist only when the goal is genuinely measurable.
   Nothing may divide by anything else — that is the whole rule behind
   "progress bars only when an explicit target exists" (§1). */

const MAX_ROWS = 200

const goalStatusValidator = v.union(
  v.literal('active'),
  v.literal('done'),
  v.literal('dropped'),
)

export async function ownedGoal(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  goalId: Id<'goals'>,
): Promise<Doc<'goals'>> {
  const goal = await ctx.db.get(goalId)
  if (goal === null || goal.ownerId !== ownerId) {
    throw new Error('No such goal')
  }
  return goal
}

export const create = mutation({
  args: {
    title: v.string(),
    area: areaSlug,
    description: v.optional(v.string()),
    targetLabel: v.optional(v.string()),
    targetValue: v.optional(v.number()),
    unit: v.optional(v.string()),
    deadline: v.optional(v.string()),
  },
  returns: v.id('goals'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    await requireLiveArea(ctx, ownerId, args.area)

    const title = args.title.trim()
    if (title.length === 0) {
      throw new Error('A goal needs a title')
    }

    /* A number without a unit cannot be rendered honestly, and a unit without a
       number is not a target. Either both or neither. */
    if ((args.targetValue === undefined) !== (args.unit === undefined)) {
      throw new Error('A measurable target needs both a value and a unit')
    }

    return await ctx.db.insert('goals', {
      ownerId,
      title,
      area: args.area,
      description: args.description,
      status: 'active',
      targetLabel: args.targetLabel,
      targetValue: args.targetValue,
      unit: args.unit,
      deadline: args.deadline,
    })
  },
})

export const listActive = query({
  args: {},
  returns: v.array(schema.doc('goals')),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    return await ctx.db
      .query('goals')
      .withIndex('by_owner_status', (q) =>
        q.eq('ownerId', ownerId).eq('status', 'active'),
      )
      .take(MAX_ROWS)
  },
})

/* Read by a URL-shaped id (a project page's goal, a goal anchor): a bad or
   foreign id is null, which the page renders as nothing. */
export const get = query({
  args: { goalId: v.string() },
  returns: v.union(schema.doc('goals'), v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const goalId = ctx.db.normalizeId('goals', args.goalId)
    if (goalId === null) return null
    const goal = await ctx.db.get(goalId)
    return goal === null || goal.ownerId !== ownerId ? null : goal
  },
})

/**
 * Rename, refile, re-date. `null` clears a deadline or a target label;
 * leaving a field out keeps it. The measurable target (targetValue + unit)
 * is not edited here — it is set on a tile or at creation.
 */
export const update = mutation({
  args: {
    goalId: v.id('goals'),
    title: v.optional(v.string()),
    area: v.optional(areaSlug),
    deadline: v.optional(v.union(v.string(), v.null())),
    targetLabel: v.optional(v.union(v.string(), v.null())),
    description: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    if (args.area !== undefined) {
      await requireLiveArea(ctx, ownerId, args.area)
    }
    const goal = await ownedGoal(ctx, ownerId, args.goalId)
    const title = args.title === undefined ? goal.title : args.title.trim()
    if (title.length === 0) throw new Error('A goal needs a title')
    await ctx.db.patch(args.goalId, {
      title,
      area: args.area ?? goal.area,
      deadline:
        args.deadline === undefined
          ? goal.deadline
          : (args.deadline ?? undefined),
      targetLabel:
        args.targetLabel === undefined
          ? goal.targetLabel
          : args.targetLabel?.trim() || undefined,
      description:
        args.description === undefined
          ? goal.description
          : args.description?.trim() || undefined,
    })
    return null
  },
})

/** Reached, or abandoned. Both are answers; neither deletes the record. */
export const setStatus = mutation({
  args: { goalId: v.id('goals'), status: goalStatusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedGoal(ctx, ownerId, args.goalId)
    await ctx.db.patch(args.goalId, {
      status: args.status,
      closedAt: args.status === 'active' ? undefined : Date.now(),
    })
    return null
  },
})

/* The shelf at the bottom of Goals (24 Sep). Artem reached a goal and it
   "simply disappeared" — nothing listed a goal once it stopped being
   active. Reached and dropped, newest first; a goal closed before
   `closedAt` existed sorts last.

   Monthly targets are left out: clearing one is taking a number off a
   tile, not ending something, and it is set again from the tile. */
export const listClosed = query({
  args: {},
  returns: v.object({
    reached: v.array(schema.doc('goals')),
    dropped: v.array(schema.doc('goals')),
  }),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    async function closed(status: 'done' | 'dropped') {
      const rows = await ctx.db
        .query('goals')
        .withIndex('by_owner_status', (q) =>
          q.eq('ownerId', ownerId).eq('status', status),
        )
        .order('desc')
        .take(MAX_ROWS)
      return rows
        .filter((g) => g.tile === undefined && g.weekly === undefined)
        .sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0))
    }
    return { reached: await closed('done'), dropped: await closed('dropped') }
  },
})

/**
 * Refuses while projects still hang off it. Cascading would delete work the
 * goal merely explained, and a silent no-op would leave you wondering why the
 * goal is still there — so it says which projects are in the way.
 */
export const remove = mutation({
  args: { goalId: v.id('goals') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedGoal(ctx, ownerId, args.goalId)

    /* Projects used to block this, because one could not exist without a
       goal above it. That bind was cut on 21 Sep — no project points here
       any more, so there is nothing to be in the way. */

    /* Milestones are steps of this goal and mean nothing without it. */
    const milestones = await ctx.db
      .query('milestones')
      .withIndex('by_owner_goal', (q) =>
        q.eq('ownerId', ownerId).eq('goalId', args.goalId),
      )
      .take(MAX_ROWS)
    for (const m of milestones) await ctx.db.delete(m._id)

    await ctx.db.delete(args.goalId)
    return null
  },
})

/* What a monthly target is called when it is written from a tile. A goal
   needs an area: Projects counts ticked tasks from every area, and business
   is where that work is mostly filed. The unit is the tile's noun, so the
   Goals page reads "target 9 workouts a month". */
const TILE_GOALS: Record<
  Tile,
  { title: string; area: Doc<'goals'>['area']; unit: string }
> = {
  projects: {
    title: 'Tasks done each month',
    area: 'business',
    unit: 'tasks',
  },
  portuguese: {
    title: 'Portuguese sessions each month',
    area: 'portuguese',
    unit: 'sessions',
  },
  body: { title: 'Workouts each month', area: 'body', unit: 'workouts' },
  money: {
    title: 'Transfers to the floor each month',
    area: 'money',
    unit: 'transfers',
  },
  style: {
    title: 'Pieces bought or altered each month',
    area: 'style',
    unit: 'pieces',
  },
  social: {
    title: 'Events attended each month',
    area: 'social',
    unit: 'events',
  },
}

/* Newest first, so if two ever claim a tile — a dropped one set back to
   active on the Goals page — the one written last is the one changed. */
async function activeTileGoals(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  tile: Tile,
): Promise<Array<Doc<'goals'>>> {
  const rows = await ctx.db
    .query('goals')
    .withIndex('by_owner_tile', (q) =>
      q.eq('ownerId', ownerId).eq('tile', tile),
    )
    .order('desc')
    .take(MAX_ROWS)
  return rows.filter((goal) => goal.status === 'active')
}

/**
 * A monthly target, set from its tile (PLAN.md §3 item 4). It is a goal
 * because a goal's targetValue is the one thing §1 lets a count be read
 * against. Setting it again changes the number on the same goal rather than
 * stacking a second one.
 */
export const setTileTarget = mutation({
  args: {
    tile: tileValidator,
    targetValue: v.number(),
    /* Words beside the number (20 Sep) — "aiming at €100 a month". The
       number is still what the bar divides by; this is only what it is for,
       and nothing computes with it. null clears it. */
    targetLabel: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.id('goals'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    if (!Number.isInteger(args.targetValue) || args.targetValue <= 0) {
      /* ConvexError: this sentence is for a person, and a plain Error
         reaches the client wrapped in a stack trace. */
      throw new ConvexError('A monthly target is a whole number above zero.')
    }

    /* `.length`, not `[current]`: without noUncheckedIndexedAccess the
       destructured element is typed as always present. */
    const label =
      args.targetLabel === undefined
        ? undefined
        : args.targetLabel?.trim() || undefined

    const existing = await activeTileGoals(ctx, ownerId, args.tile)
    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, {
        targetValue: args.targetValue,
        /* Left out of the call, left alone: changing the number from the
           tile must not silently wipe the words. */
        targetLabel:
          args.targetLabel === undefined ? existing[0].targetLabel : label,
      })
      return existing[0]._id
    }

    const shape = TILE_GOALS[args.tile]
    return await ctx.db.insert('goals', {
      ownerId,
      title: shape.title,
      area: shape.area,
      status: 'active',
      targetValue: args.targetValue,
      targetLabel: label,
      unit: shape.unit,
      tile: args.tile,
    })
  },
})

/* The weight goal is the first active body goal measured in kg — the same
   rule WeightLine reads it by. */
async function activeWeightGoals(ctx: MutationCtx, ownerId: string) {
  const rows = await ctx.db
    .query('goals')
    .withIndex('by_owner_status', (q) =>
      q.eq('ownerId', ownerId).eq('status', 'active'),
    )
    .take(MAX_ROWS)
  return rows.filter(
    (g) => g.area === 'body' && g.unit === 'kg' && g.targetValue !== undefined,
  )
}

/**
 * A weight to aim at, set from the Weight card (25 Sep). A goal, because a
 * goal's targetValue is what §1 lets the dashed line on the chart be. Setting
 * it again moves the number on the same goal.
 */
export const setWeightTarget = mutation({
  args: { targetValue: v.number() },
  returns: v.id('goals'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    if (
      !Number.isFinite(args.targetValue) ||
      args.targetValue < 20 ||
      args.targetValue > 400
    ) {
      throw new ConvexError('That is not a weight in kg.')
    }
    const targetValue = Math.round(args.targetValue * 10) / 10
    const existing = await activeWeightGoals(ctx, ownerId)
    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, { targetValue })
      return existing[0]._id
    }
    return await ctx.db.insert('goals', {
      ownerId,
      title: `Weigh ${targetValue} kg`,
      area: 'body',
      status: 'active',
      targetValue,
      unit: 'kg',
    })
  },
})

/** No weight target any more. Dropped, not deleted. */
export const clearWeightTarget = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    for (const goal of await activeWeightGoals(ctx, ownerId)) {
      await ctx.db.patch(goal._id, { status: 'dropped' })
    }
    return null
  },
})

/** No target on this tile any more. Dropped, not deleted. */
export const clearTileTarget = mutation({
  args: { tile: tileValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    for (const goal of await activeTileGoals(ctx, ownerId, args.tile)) {
      await ctx.db.patch(goal._id, { status: 'dropped' })
    }
    return null
  },
})

/* ------------------------------------------------------------ weekly */

/* The categories Body counts sessions and shakes under. A weekly target is
   only for these: any other word would be a bar nothing ever fills. */
const WEEKLY_CATEGORIES: Record<string, { title: string; unit: string }> = {
  stretch: { title: 'Mobility sessions each week', unit: 'sessions' },
  gym: { title: 'Gym sessions each week', unit: 'sessions' },
  boxing: { title: 'Boxing sessions each week', unit: 'sessions' },
  hiking: { title: 'Hikes each week', unit: 'hikes' },
  supplements: { title: 'Shakes each week', unit: 'shakes' },
}

async function activeWeeklyGoals(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  category: string,
): Promise<Array<Doc<'goals'>>> {
  const rows = await ctx.db
    .query('goals')
    .withIndex('by_owner_weekly', (q) =>
      q.eq('ownerId', ownerId).eq('weekly', category),
    )
    .order('desc')
    .take(MAX_ROWS)
  return rows.filter((goal) => goal.status === 'active')
}

/**
 * How many a week he means to do one Body kind, set from the hero. A goal,
 * because a goal's targetValue is the one thing §1 lets a count be read
 * against — this week's logs of that category are the other side of the
 * bar. Setting it again changes the number on the same goal.
 */
export const setWeeklyTarget = mutation({
  args: { category: v.string(), targetValue: v.number() },
  returns: v.id('goals'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const shape = WEEKLY_CATEGORIES[args.category] as
      (typeof WEEKLY_CATEGORIES)[string] | undefined
    if (shape === undefined) throw new Error('No such Body kind')
    if (
      !Number.isInteger(args.targetValue) ||
      args.targetValue < 1 ||
      args.targetValue > 14
    ) {
      throw new ConvexError('A weekly target is a whole number from 1 to 14.')
    }
    const existing = await activeWeeklyGoals(ctx, ownerId, args.category)
    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, { targetValue: args.targetValue })
      return existing[0]._id
    }
    return await ctx.db.insert('goals', {
      ownerId,
      title: shape.title,
      area: 'body',
      status: 'active',
      targetValue: args.targetValue,
      unit: shape.unit,
      weekly: args.category,
    })
  },
})

/** No weekly target for this kind any more. Dropped, not deleted. */
export const clearWeeklyTarget = mutation({
  args: { category: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    for (const goal of await activeWeeklyGoals(ctx, ownerId, args.category)) {
      await ctx.db.patch(goal._id, { status: 'dropped' })
    }
    return null
  },
})

/** His weekly targets, one per Body kind that has one. */
export const weeklyTargets = query({
  args: {},
  returns: v.array(
    v.object({
      goalId: v.id('goals'),
      category: v.string(),
      targetValue: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    const rows = await ctx.db
      .query('goals')
      .withIndex('by_owner_status', (q) =>
        q.eq('ownerId', ownerId).eq('status', 'active'),
      )
      .take(MAX_ROWS)
    const seen = new Set<string>()
    const out: Array<{
      goalId: Id<'goals'>
      category: string
      targetValue: number
    }> = []
    /* Newest first, so a second active one for a kind loses. */
    for (const goal of rows.reverse()) {
      if (goal.weekly === undefined || goal.targetValue === undefined) continue
      if (seen.has(goal.weekly)) continue
      seen.add(goal.weekly)
      out.push({
        goalId: goal._id,
        category: goal.weekly,
        targetValue: goal.targetValue,
      })
    }
    return out
  },
})
