/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import { parseRepo } from './github'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* 14 Sep 2026 is a Monday. Lisbon is UTC+1 in September. */
const LAST_WEEK = new Date(2026, 8, 7).getTime()
const THIS_WEEK = new Date(2026, 8, 14).getTime()
const NEXT_WEEK = new Date(2026, 8, 21).getTime()

function gh(sha: string, message: string, date: string) {
  return {
    sha,
    html_url: `https://github.com/artemchernii/oreum/commit/${sha}`,
    commit: { message, author: { date }, committer: { date } },
  }
}

const PAYLOAD = [
  gh('c3', 'Ship onboarding\n\nlong body', '2026-09-14T10:00:00Z'),
  gh('c2', 'Fix pricing', '2026-09-10T09:00:00Z'),
  gh('c1', 'Start', '2026-09-01T09:00:00Z'),
]

function stubGitHub(status = 200, body: unknown = PAYLOAD) {
  const fetchMock = vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function oreum(
  t: ReturnType<ReturnType<typeof convexTest>['withIdentity']>,
) {
  const goalId = await t.mutation(api.goals.create, {
    title: 'A business',
    area: 'business',
  })
  return await t.mutation(api.projects.create, { goalId, title: 'Oreum' })
}

const bounds = {
  lastWeekStart: LAST_WEEK,
  weekStart: THIS_WEEK,
  nextWeekStart: NEXT_WEEK,
}

describe('parseRepo', () => {
  test.each([
    ['artemchernii/oreum', 'artemchernii/oreum'],
    ['https://github.com/artemchernii/oreum', 'artemchernii/oreum'],
    ['https://github.com/artemchernii/oreum.git', 'artemchernii/oreum'],
    ['github.com/artemchernii/oreum/tree/main', 'artemchernii/oreum'],
    ['  artemchernii/oreum.js  ', 'artemchernii/oreum.js'],
  ])('%s → %s', (input, out) => {
    expect(parseRepo(input)).toBe(out)
  })

  test.each(['oreum', 'https://gitlab.com/a/b', 'a/b/c d', ''])(
    '%s is not a repo',
    (input) => {
      expect(parseRepo(input)).toBeNull()
    },
  )
})

describe('commits are stored readings (source 4)', () => {
  test('a check stores each commit once and stamps when it looked', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    const fetchMock = stubGitHub()

    await t.action(internal.github.checkOne, { projectId })
    await t.action(internal.github.checkOne, { projectId })

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      '/repos/artemchernii/oreum/commits?since=',
    )
    const rows = await t.run((ctx) => ctx.db.query('commits').collect())
    expect(rows.map((r) => r.sha).sort()).toEqual(['c1', 'c2', 'c3'])
    expect(rows.every((r) => r.ownerId === ME)).toBe(true)

    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect(counts.repo).toBe('artemchernii/oreum')
    expect(typeof counts.checkedAt).toBe('number')
    expect([counts.thisWeek, counts.lastWeek]).toEqual([1, 1])

    const recent = await me.query(api.github.listRecent, { projectId })
    expect(recent.map((c) => c.message)).toEqual([
      'Ship onboarding',
      'Fix pricing',
      'Start',
    ])
  })

  test('a failed fetch stores nothing and does not pretend it looked', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    stubGitHub(403, { message: 'API rate limit exceeded' })

    await t.action(internal.github.checkOne, { projectId })

    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect(counts.checkedAt).toBeNull()
    expect(await t.run((ctx) => ctx.db.query('commits').collect())).toEqual([])
  })

  test('setRepo accepts a URL, stores owner/name, and checks straight away', async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    stubGitHub()

    await me.mutation(api.github.setRepo, {
      projectId,
      repo: 'https://github.com/artemchernii/oreum',
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect(counts.repo).toBe('artemchernii/oreum')
    expect(counts.thisWeek).toBe(1)
  })

  test('changing the repo stops counting the old one’s commits', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    stubGitHub()
    await t.action(internal.github.checkOne, { projectId })

    await t.run((ctx) =>
      ctx.db.patch(projectId, {
        githubRepo: 'artemchernii/other',
        githubCheckedAt: undefined,
      }),
    )
    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect([counts.thisWeek, counts.lastWeek, counts.checkedAt]).toEqual([
      0,
      0,
      null,
    ])
    expect(await me.query(api.github.listRecent, { projectId })).toEqual([])
  })

  test('setRepo refuses nonsense and another owner’s project; null disconnects', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const them = t.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    const projectId = await oreum(me)

    await expect(
      me.mutation(api.github.setRepo, { projectId, repo: 'oreum' }),
    ).rejects.toThrow('not a GitHub repo')
    await expect(
      them.mutation(api.github.setRepo, { projectId, repo: null }),
    ).rejects.toThrow('No such project')

    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    await me.mutation(api.github.setRepo, { projectId, repo: null })
    expect(
      (await me.query(api.aggregate.projectCommits, { projectId, ...bounds }))
        .repo,
    ).toBeNull()
  })

  test('another owner reads nothing of mine', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const them = t.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    stubGitHub()
    await t.action(internal.github.checkOne, { projectId })

    expect(
      await them.query(api.aggregate.projectCommits, { projectId, ...bounds }),
    ).toEqual({
      repo: null,
      checkedAt: null,
      thisWeek: 0,
      lastWeek: 0,
    })
    expect(await them.query(api.github.listRecent, { projectId })).toEqual([])
  })

  test('deleting a project deletes its commits', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )
    stubGitHub()
    await t.action(internal.github.checkOne, { projectId })

    await me.mutation(api.projects.remove, { projectId })
    expect(await t.run((ctx) => ctx.db.query('commits').collect())).toEqual([])
  })
})
