import { ConvexError, v } from 'convex/values'

import { requireUser } from './auth'
import { internal } from './_generated/api'
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import type { ActionCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'

/* PLAN.md §1 source 4, first implementation (R3c, 16 Sep): commits on a
   project's public GitHub repo. The four conditions, and where each is kept:
   stored — the `commits` table, filled here, never fetched by a page;
   attributed — GitHub and `owner/name` travel with every row and the card
   links to the repo; as of a time — projects.githubCheckedAt, stamped only
   when a fetch succeeded; not a licence to derive — aggregate.projectCommits
   counts rows per week, and that is all anything reads.

   No token: the repo is public. GitHub allows 60 unauthenticated requests an
   hour per IP, and Convex's egress is shared, so if checks start failing with
   403, set GITHUB_TOKEN (read-only) and it is used. */

const LOOKBACK_MS = 14 * 86_400_000
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/

/** `owner/name` from what a person pastes: the pair itself or a github.com URL. */
export function parseRepo(input: string): string | null {
  const trimmed = input.trim()
  const url = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)/i,
  )
  const candidate = url ? `${url[1]}/${url[2].replace(/\.git$/, '')}` : trimmed
  return REPO.test(candidate) ? candidate : null
}

export const setRepo = mutation({
  args: { projectId: v.id('projects'), repo: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const project = await ctx.db.get(args.projectId)
    if (project === null || project.ownerId !== ownerId) {
      throw new Error('No such project')
    }

    if (args.repo === null) {
      await ctx.db.patch(args.projectId, {
        githubRepo: undefined,
        githubCheckedAt: undefined,
      })
      return null
    }

    const repo = parseRepo(args.repo)
    if (repo === null) {
      throw new ConvexError('That is not a GitHub repo: use owner/name.')
    }
    await ctx.db.patch(args.projectId, {
      githubRepo: repo,
      githubCheckedAt: undefined,
    })
    /* Look now, rather than leaving the card empty until the next hour. */
    await ctx.scheduler.runAfter(0, internal.github.checkOne, {
      projectId: args.projectId,
    })
    return null
  },
})

/** The latest five commits on the project's current repo, newest first. */
export const listRecent = query({
  args: { projectId: v.string() },
  returns: v.array(
    v.object({
      sha: v.string(),
      message: v.string(),
      url: v.string(),
      authoredAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    const projectId = ctx.db.normalizeId('projects', args.projectId)
    const project = projectId === null ? null : await ctx.db.get(projectId)
    if (project === null || project.ownerId !== ownerId || !project.githubRepo)
      return []

    const rows = await ctx.db
      .query('commits')
      .withIndex('by_owner_project_time', (q) =>
        q.eq('ownerId', ownerId).eq('projectId', project._id),
      )
      .order('desc')
      .take(50)
    return rows
      .filter((r) => r.repo === project.githubRepo)
      .slice(0, 5)
      .map((r) => ({
        sha: r.sha,
        message: r.message,
        url: r.url,
        authoredAt: r.authoredAt,
      }))
  },
})

/* ---- the hourly check: internal, for every owner ---------------------- */

export const repoFor = internalQuery({
  args: { projectId: v.id('projects') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    return project?.githubRepo ?? null
  },
})

export const connectedProjects = internalQuery({
  args: {},
  returns: v.array(v.id('projects')),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('projects')
      .withIndex('by_github_repo', (q) => q.gte('githubRepo', ''))
      .take(200)
    return rows.map((p) => p._id)
  },
})

const commitRow = v.object({
  sha: v.string(),
  message: v.string(),
  url: v.string(),
  authoredAt: v.number(),
})

export const record = internalMutation({
  args: {
    projectId: v.id('projects'),
    repo: v.string(),
    checkedAt: v.number(),
    commits: v.array(commitRow),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    /* Deleted or re-pointed while the fetch was in flight: these readings
       belong to nothing now. */
    if (project === null || project.githubRepo !== args.repo) return null

    for (const c of args.commits) {
      const seen = await ctx.db
        .query('commits')
        .withIndex('by_project_sha', (q) =>
          q.eq('projectId', args.projectId).eq('sha', c.sha),
        )
        .first()
      if (seen !== null) continue
      await ctx.db.insert('commits', {
        ownerId: project.ownerId,
        projectId: args.projectId,
        repo: args.repo,
        ...c,
        fetchedAt: args.checkedAt,
      })
    }
    await ctx.db.patch(args.projectId, { githubCheckedAt: args.checkedAt })
    return null
  },
})

type GitHubCommit = {
  sha: string
  html_url: string
  commit: {
    message: string
    author: { date: string } | null
    committer: { date: string } | null
  }
}

async function check(ctx: ActionCtx, projectId: Id<'projects'>): Promise<void> {
  const repo: string | null = await ctx.runQuery(internal.github.repoFor, {
    projectId,
  })
  if (repo === null) return

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString()
  const token = process.env.GITHUB_TOKEN
  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits?since=${since}&per_page=100`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'solo-leveling',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  )
  if (!res.ok) {
    /* No stamp: the card keeps its last "as of", which is the truth. */
    console.error(`GitHub ${res.status} for ${repo}`)
    return
  }

  const body = (await res.json()) as Array<GitHubCommit>
  const commits = body.flatMap((c) => {
    const date = c.commit.author?.date ?? c.commit.committer?.date
    if (!date) return []
    return [
      {
        sha: c.sha,
        message: c.commit.message.split('\n')[0].slice(0, 200),
        url: c.html_url,
        authoredAt: Date.parse(date),
      },
    ]
  })

  await ctx.runMutation(internal.github.record, {
    projectId,
    repo,
    checkedAt: Date.now(),
    commits,
  })
}

export const checkOne = internalAction({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await check(ctx, args.projectId)
    return null
  },
})

export const checkAll = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const ids: Array<Id<'projects'>> = await ctx.runQuery(
      internal.github.connectedProjects,
      {},
    )
    for (const id of ids) {
      await check(ctx, id)
    }
    return null
  },
})
