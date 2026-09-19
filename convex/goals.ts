import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema, { areaValidator, tileValidator } from './schema'
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

async function ownedGoal(
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
    area: areaValidator,
    description: v.optional(v.string()),
    targetLabel: v.optional(v.string()),
    targetValue: v.optional(v.number()),
    unit: v.optional(v.string()),
    deadline: v.optional(v.string()),
  },
  returns: v.id('goals'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

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
    area: v.optional(areaValidator),
    deadline: v.optional(v.union(v.string(), v.null())),
    targetLabel: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
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
    await ctx.db.patch(args.goalId, { status: args.status })
    return null
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

    const projects = await ctx.db
      .query('projects')
      .withIndex('by_owner_status', (q) => q.eq('ownerId', ownerId))
      .take(MAX_ROWS)

    const attached = projects.filter((p) => p.goalId === args.goalId)
    if (attached.length > 0) {
      /* ConvexError, not Error: a plain throw reaches the client wrapped in a
         stack trace, and this sentence is written to be read by a person. */
      throw new ConvexError(
        `Delete its projects first: ${attached.map((p) => p.title).join(', ')}`,
      )
    }

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
  args: { tile: tileValidator, targetValue: v.number() },
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
    const existing = await activeTileGoals(ctx, ownerId, args.tile)
    if (existing.length > 0) {
      await ctx.db.patch(existing[0]._id, { targetValue: args.targetValue })
      return existing[0]._id
    }

    const shape = TILE_GOALS[args.tile]
    return await ctx.db.insert('goals', {
      ownerId,
      title: shape.title,
      area: shape.area,
      status: 'active',
      targetValue: args.targetValue,
      unit: shape.unit,
      tile: args.tile,
    })
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
