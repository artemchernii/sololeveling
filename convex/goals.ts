import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema, { areaValidator } from './schema'

/* PLAN.md §2. A goal is the thing a chain answers to. It carries a target only
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
 * Refuses while chains still hang off it. Cascading would delete work the goal
 * merely explained, and a silent no-op would leave you wondering why the goal
 * is still there — so it says which chains are in the way.
 */
export const remove = mutation({
  args: { goalId: v.id('goals') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedGoal(ctx, ownerId, args.goalId)

    const chains = await ctx.db
      .query('projects')
      .withIndex('by_owner_status', (q) => q.eq('ownerId', ownerId))
      .take(MAX_ROWS)

    const attached = chains.filter((c) => c.goalId === args.goalId)
    if (attached.length > 0) {
      /* ConvexError, not Error: a plain throw reaches the client wrapped in a
         stack trace, and this sentence is written to be read by a person. */
      throw new ConvexError(
        `Delete its chains first: ${attached.map((c) => c.title).join(', ')}`,
      )
    }

    await ctx.db.delete(args.goalId)
    return null
  },
})
