import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { parseRepo } from './github'
import { internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import schema, { areaValidator } from './schema'

/* A project is work under a goal. `goalId` is required by the schema, so a
   project that answers to nothing cannot exist. (They were called chains
   until 15 Sep; only the word changed.)

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

/** "New project" is one form: the goal and the project together (§3). */
export const create = mutation({
  args: {
    goalId: v.id('goals'),
    title: v.string(),
    description: v.optional(v.string()),
    deadline: v.optional(v.string()),
    githubRepo: v.optional(v.string()),
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
      throw new Error('A project needs a title')
    }

    /* A repo given at birth (R3c): rejected here rather than stored wrong,
       so the card never shows a repo GitHub will 404 on. */
    let githubRepo: string | undefined
    if (args.githubRepo !== undefined && args.githubRepo.trim().length > 0) {
      const repo = parseRepo(args.githubRepo)
      if (repo === null) {
        throw new ConvexError('That is not a GitHub repo: use owner/name.')
      }
      githubRepo = repo
    }

    const projectId = await ctx.db.insert('projects', {
      ownerId,
      goalId: args.goalId,
      title,
      description: args.description,
      status: 'active',
      deadline: args.deadline,
      githubRepo,
    })

    if (githubRepo !== undefined) {
      await ctx.scheduler.runAfter(0, internal.github.backfillOne, {
        projectId,
      })
    }

    return projectId
  },
})

/**
 * Move a project under a different goal (20 Sep).
 *
 * Until now `goalId` was written once and never again, so a project filed
 * under the wrong goal could only be fixed by deleting it — and its tasks,
 * notes and logged time went with it. The goal it leaves is not touched: a
 * goal with no projects is a goal you have not started, not a mistake.
 */
export const setGoal = mutation({
  args: { projectId: v.id('projects'), goalId: v.id('goals') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedProject(ctx, ownerId, args.projectId)

    const goal = await ctx.db.get(args.goalId)
    if (goal === null || goal.ownerId !== ownerId) {
      throw new Error('No such goal')
    }

    await ctx.db.patch(args.projectId, { goalId: args.goalId })
    return null
  },
})

/** Everything not finished or filed away — what the projects grid renders. */
export const listLive = query({
  args: {},
  /* Each row carries its goal's `area` alongside the document. A project has
     no area of its own — it inherits the kind of the goal it answers to, and
     §3d says colour is how a kind is shown. Optional, not defaulted: a goal
     cannot normally be deleted out from under a project, and if one ever is,
     the card says "unfiled" rather than inventing a kind. */
  returns: v.array(
    v.object({
      ...schema.doc('projects').fields,
      area: v.optional(areaValidator),
      goalTitle: v.optional(v.string()),
      logoUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)

    const live: Array<Doc<'projects'>> = []
    for (const status of LIVE_STATUSES) {
      const rows = await ctx.db
        .query('projects')
        .withIndex('by_owner_status', (q) =>
          q.eq('ownerId', ownerId).eq('status', status),
        )
        .take(MAX_ROWS)
      live.push(...rows)
    }

    /* One read per distinct goal, not one per project. */
    const areas = new Map<string, Doc<'goals'> | null>()
    const out = []
    for (const project of live) {
      let goal = areas.get(project.goalId)
      if (goal === undefined) {
        goal = await ctx.db.get(project.goalId)
        areas.set(project.goalId, goal)
      }
      out.push({
        ...project,
        area: goal?.area,
        /* The goal's name, not its area: a card that says KNOWLEDGE next to a
           project reads as though the project were filed under it (20 Sep).
           The area is already on the card as colour, which is what §3d asks
           colour to do — the word was saying nothing the edge did not. */
        goalTitle: goal?.title,
        logoUrl:
          project.logoId === undefined
            ? null
            : await ctx.storage.getUrl(project.logoId),
      })
    }
    return out
  },
})

/* A project's logo (20 Sep). Two steps, as Convex file storage works: the
   client asks for a short-lived upload URL, POSTs the file straight to it, and
   hands back the storageId it gets. Nothing about the image is interpreted
   here — it is stored and shown, and that is all. */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireUser(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

export const setLogo = mutation({
  args: {
    projectId: v.id('projects'),
    storageId: v.union(v.id('_storage'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const project = await ownedProject(ctx, ownerId, args.projectId)

    /* The old file goes with it: an image nothing points at is a bill with
       no screen behind it. */
    if (project.logoId !== undefined) {
      await ctx.storage.delete(project.logoId)
    }
    await ctx.db.patch(args.projectId, {
      logoId: args.storageId ?? undefined,
    })
    return null
  },
})

/* Read by a URL, so the id is a plain string: a pasted-wrong or cut-short
   link reads as "no such project" instead of failing argument validation — an
   error the page cannot tell apart from a real crash. */
export const get = query({
  args: { projectId: v.string() },
  returns: v.union(
    v.object({
      ...schema.doc('projects').fields,
      logoUrl: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const projectId = ctx.db.normalizeId('projects', args.projectId)
    if (projectId === null) return null
    const project = await ctx.db.get(projectId)
    if (project === null || project.ownerId !== ownerId) return null
    return {
      ...project,
      logoUrl:
        project.logoId === undefined
          ? null
          : await ctx.storage.getUrl(project.logoId),
    }
  },
})

/**
 * §3c.2: one focus project. Promoting one demotes the other, in the same
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
 * Finishing, pausing or filing a project away. Completing the focus project
 * leaves nothing in focus — deliberately: which project matters next is a
 * decision, not
 * something to be inferred from whatever happens to be nearby.
 */
/**
 * Move a project's deadline (20 Sep).
 *
 * A date that has passed while you are still working is the normal case, not
 * an error to be scolded about: the honest thing is to let it be pushed out
 * where it is shown. `null` clears it — a project with no end date is a
 * project you have not committed to a date, which is allowed.
 */
export const setDeadline = mutation({
  args: {
    projectId: v.id('projects'),
    deadline: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedProject(ctx, ownerId, args.projectId)
    await ctx.db.patch(args.projectId, {
      deadline: args.deadline ?? undefined,
    })
    return null
  },
})

/**
 * What this project actually is, in his own words (20 Sep).
 *
 * The field has existed since R1 and nothing ever wrote to it, so nothing
 * showed it. It is the one thing a project page can say that no count can.
 */
export const setDescription = mutation({
  args: { projectId: v.id('projects'), description: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedProject(ctx, ownerId, args.projectId)
    const trimmed = args.description.trim()
    await ctx.db.patch(args.projectId, {
      description: trimmed.length === 0 ? undefined : trimmed,
    })
    return null
  },
})

export const setStatus = mutation({
  args: { projectId: v.id('projects'), status: projectStatusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    await ownedProject(ctx, ownerId, args.projectId)

    if (args.status === 'focus') {
      throw new Error(
        'Use setFocus, which demotes the project already in focus',
      )
    }

    await ctx.db.patch(args.projectId, { status: args.status })
    return null
  },
})

/**
 * A project written by mistake. Its tasks are cut loose rather than deleted —
 * they may still be worth doing, and a task outliving the project it was filed
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

    /* The logo goes with it, or it is a stored file nothing can reach. */
    const project = await ctx.db.get(args.projectId)
    if (project?.logoId !== undefined) {
      await ctx.storage.delete(project.logoId)
    }

    /* Readings about this project mean nothing without it. */
    const commits = await ctx.db
      .query('commits')
      .withIndex('by_owner_project_time', (q) =>
        q.eq('ownerId', ownerId).eq('projectId', args.projectId),
      )
      .take(1000)
    for (const commit of commits) await ctx.db.delete(commit._id)

    await ctx.db.delete(args.projectId)
    return null
  },
})
