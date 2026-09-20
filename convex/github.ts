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
/* The one-off walk back when a repo is first connected (20 Sep), so the
   heatmap has a year to draw instead of a fortnight. The hourly check stays
   on the short window: re-reading a year every hour would spend the whole
   unauthenticated budget on commits that have not changed. */
const BACKFILL_MS = 366 * 86_400_000
const BACKFILL_MAX_PAGES = 40
const PER_PAGE = 100
/* 500 commits in a fortnight is far past anything one person writes; the cap
   exists so a runaway repo cannot spin the action, not to trim a real week. */
const MAX_PAGES = 5
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
    /* Look now, rather than leaving the card empty until the next hour —
       and walk back a year once, so the heatmap has something to draw. */
    await ctx.scheduler.runAfter(0, internal.github.backfillOne, {
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
    return (
      rows
        /* Merges are left out here too (20 Sep): showing one in "the latest
         commits" while the count beside it refuses to count it is the app
         disagreeing with itself on the same card. */
        .filter((r) => r.repo === project.githubRepo && r.isMerge !== true)
        .slice(0, 5)
        .map((r) => ({
          sha: r.sha,
          message: r.message,
          url: r.url,
          authoredAt: r.authoredAt,
        }))
    )
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
  isMerge: v.boolean(),
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
      if (seen !== null) {
        /* Written before isMerge existed: classify it rather than leave a
           row that counts as work because nothing ever looked. */
        if (seen.isMerge === undefined) {
          await ctx.db.patch(seen._id, { isMerge: c.isMerge })
        }
        continue
      }
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
  parents?: Array<{ sha: string }>
  commit: {
    message: string
    author: { date: string } | null
    committer: { date: string } | null
  }
}

async function check(
  ctx: ActionCtx,
  projectId: Id<'projects'>,
  { full = false }: { full?: boolean } = {},
): Promise<void> {
  const repo: string | null = await ctx.runQuery(internal.github.repoFor, {
    projectId,
  })
  if (repo === null) return

  const window = full ? BACKFILL_MS : LOOKBACK_MS
  const maxPages = full ? BACKFILL_MAX_PAGES : MAX_PAGES
  const since = new Date(Date.now() - window).toISOString()
  const token = process.env.GITHUB_TOKEN
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'solo-leveling',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }

  /* Paged, not one shot (20 Sep). GitHub returns the newest 100 first, so a
     single page on a busy repo drops the older end for good — every later
     check asks for the same newest 100. The card read "100 this week · 0 last
     week" against a true 117 and 65: a capped number wearing a count's
     clothes, which is the one thing §1 exists to prevent. */
  const commits = []
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/commits?since=${since}&per_page=${PER_PAGE}&page=${page}`,
      { headers },
    )
    if (!res.ok) {
      /* No stamp, and nothing stored — a half-read fortnight would count
         wrong. The card keeps its last "as of", which is the truth. */
      console.error(`GitHub ${res.status} for ${repo}`)
      return
    }

    const body = (await res.json()) as Array<GitHubCommit>
    for (const c of body) {
      const date = c.commit.author?.date ?? c.commit.committer?.date
      if (!date) continue
      commits.push({
        sha: c.sha,
        message: c.commit.message.split('\n')[0].slice(0, 200),
        url: c.html_url,
        authoredAt: Date.parse(date),
        isMerge: (c.parents?.length ?? 1) > 1,
      })
    }
    if (body.length < PER_PAGE) break
  }

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

/** The one-off year, run when a repo is connected. */
export const backfillOne = internalAction({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await check(ctx, args.projectId, { full: true })
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
