import { v } from 'convex/values'

import { requireUser } from './auth'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema from './schema'

/* A project is a chain: a goal with work hanging off it. `goalId` is required
   by the schema, so a chain that answers to nothing cannot exist.

   Exactly one project per owner is 'focus' (PLAN.md §3c.2). That is enforced
   here, in setFocus, because Convex has no triggers and a rule the UI merely
   suggests is a rule that breaks the first time two tabs are open. */

const MAX_ROWS = 200

const projectStatusValidator = v.union(
  v.literal('focus'),
  v.literal('active'),
  v.literal('paused'),
  v.literal('completed'),
  v.literal('archived'),
)

const LIVE_STATUSES = ['focus', 'active', 'paused'] as const

async function ownedProject(
  ctx: QueryCtx | MutationCtx,
  ownerId: string,
  projectId: Id<'projects'>,
): Promise<Doc<'projects'>> {
  const project = await ctx.db.get(projectId)
  if (project === null || project.ownerId !== ownerId) {
    throw new Error('No such project')
  }
  return project
}

/** "New chain" is one form: the goal and its first project together (§3). */
export const create = mutation({
  args: {
    goalId: v.id('goals'),
    title: v.string(),
    description: v.optional(v.string()),
    deadline: v.optional(v.string()),
  },
  returns: v.id('projects'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)

    const goal = await ctx.db.get(args.goalId)
    if (goal === null || goal.ownerId !== ownerId) {
      throw new Error('No such goal')
    }

    const title = args.title.trim()
    if (title.length === 0) {
      throw new Error('A chain needs a title')
    }

    return await ctx.db.insert('projects', {
      ownerId,
      goalId: args.goalId,
      title,
      description: args.description,
      status: 'active',
      deadline: args.deadline,
    })
  },
})

/** Everything not finished or filed away — what the chains grid renders. */
export const listLive = query({
  args: {},
  returns: v.array(schema.doc('projects')),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)

    const chains: Array<Doc<'projects'>> = []
    for (const status of LIVE_STATUSES) {
      const rows = await ctx.db
        .query('projects')
        .withIndex('by_owner_status', (q) =>
          q.eq('ownerId', ownerId).eq('status', status),
        )
        .take(MAX_ROWS)
      chains.push(...rows)
    }
    return chains
  },
})

export const get = query({
  args: { projectId: v.id('projects') },
  returns: v.union(schema.doc('projects'), v.null()),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const project = await ctx.db.get(args.projectId)
    return project === null || project.ownerId !== ownerId ? null : project
  },
})

/**
 * §3c.2: one focus chain. Promoting one demotes the other, in the same
 * transaction, so there is no window in which two are focused or none is.
 */
export const setFocus = mutation({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedProject(ctx, ownerId, args.projectId)

    const current = await ctx.db
      .query('projects')
      .withIndex('by_owner_status', (q) =>
        q.eq('ownerId', ownerId).eq('status', 'focus'),
      )
      .take(MAX_ROWS)

    for (const project of current) {
      if (project._id !== args.projectId) {
        await ctx.db.patch(project._id, { status: 'active' })
      }
    }

    await ctx.db.patch(args.projectId, { status: 'focus' })
    return null
  },
})

/**
 * Finishing, pausing or filing a chain away. Completing the focus chain leaves
 * nothing in focus — deliberately: which chain matters next is a decision, not
 * something to be inferred from whatever happens to be nearby.
 */
export const setStatus = mutation({
  args: { projectId: v.id('projects'), status: projectStatusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedProject(ctx, ownerId, args.projectId)

    if (args.status === 'focus') {
      throw new Error('Use setFocus, which demotes the chain already in focus')
    }

    await ctx.db.patch(args.projectId, { status: args.status })
    return null
  },
})

/**
 * A chain written by mistake. Its tasks are cut loose rather than deleted —
 * they may still be worth doing, and a task outliving the chain it was filed
 * under is the normal case, not an error.
 *
 * Deleting the project without this would leave tasks pointing at a document
 * that no longer exists, and listByProject would throw on every read.
 */
export const remove = mutation({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedProject(ctx, ownerId, args.projectId)

    const tasks = await ctx.db
      .query('tasks')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .take(MAX_ROWS)

    for (const task of tasks) {
      await ctx.db.patch(task._id, { projectId: undefined, goalId: undefined })
    }

    await ctx.db.delete(args.projectId)
    return null
  },
})
