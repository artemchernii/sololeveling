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
  return await t.mutation(api.projects.create, { title: 'Oreum' })
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
      days: [],
    })
    expect(await them.query(api.github.listRecent, { projectId })).toEqual([])
  })

  test('a project made with a repo is connected from birth', async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    stubGitHub()
    const projectId = await me.mutation(api.projects.create, {
      title: 'Oreum',
      githubRepo: 'github.com/artemchernii/oreum',
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect(counts.repo).toBe('artemchernii/oreum')
    expect(counts.thisWeek).toBe(1)
  })

  test('a busy repo is paged, so last week is not silently zero', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )

    /* The shape that broke it on 20 Sep: a full page of this week's commits,
       so every one of last week's sits on page 2. One page read 100 and 0
       against a true 117 and 65. */
    const first = Array.from({ length: 100 }, (_, i) =>
      gh(`a${i}`, `This week ${i}`, '2026-09-15T10:00:00Z'),
    )
    const second = [
      gh('b1', 'Last week one', '2026-09-09T10:00:00Z'),
      gh('b2', 'Last week two', '2026-09-10T10:00:00Z'),
    ]
    const fetchMock = vi.fn(
      async (url: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify(
            new URL(String(url)).searchParams.get('page') === '2'
              ? second
              : first,
          ),
          { status: 200 },
        ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await t.action(internal.github.checkOne, { projectId })

    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect([counts.thisWeek, counts.lastWeek]).toEqual([100, 2])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('the strip counts each commit into its own local day', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )

    /* Two on the 15th, one on the 10th, and one on the 1st — which is before
       the strip begins and must fall into no bucket rather than the first. */
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              gh('d1', 'One', '2026-09-15T09:00:00Z'),
              gh('d2', 'Two', '2026-09-15T18:00:00Z'),
              gh('d3', 'Three', '2026-09-10T09:00:00Z'),
              gh('d4', 'Old', '2026-09-01T09:00:00Z'),
            ]),
            { status: 200 },
          ),
      ),
    )
    await t.action(internal.github.checkOne, { projectId })

    /* 14 local midnights from Mon 7 Sep, oldest first. */
    const dayStarts = Array.from({ length: 14 }, (_, i) =>
      new Date(2026, 8, 7 + i).getTime(),
    )
    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
      dayStarts,
    })

    expect(counts.days).toHaveLength(14)
    expect(counts.days[8]).toBe(2) // 15 Sep
    expect(counts.days[3]).toBe(1) // 10 Sep
    expect(counts.days.reduce((a, b) => a + b, 0)).toBe(3) // the 1st is not in it
  })

  test('no dayStarts means no strip, not a strip of zeroes elsewhere', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect(counts.days).toEqual([])
  })

  test('a merge is stored but not counted as work', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const projectId = await oreum(me)
    await t.run((ctx) =>
      ctx.db.patch(projectId, { githubRepo: 'artemchernii/oreum' }),
    )

    const merge = {
      ...gh('m1', 'Merge pull request #51', '2026-09-15T12:00:00Z'),
      parents: [{ sha: 'p1' }, { sha: 'p2' }],
    }
    const real = {
      ...gh('r1', 'Real work', '2026-09-15T13:00:00Z'),
      parents: [{ sha: 'p1' }],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify([merge, real]), { status: 200 }),
      ),
    )
    await t.action(internal.github.checkOne, { projectId })

    /* Both rows are kept — the merge happened, and throwing it away would
       mean re-fetching to ever change our mind about it. */
    const rows = await t.run((ctx) => ctx.db.query('commits').collect())
    expect(rows.map((r) => r.sha).sort()).toEqual(['m1', 'r1'])
    /* And the list agrees with the count: no merge in "latest commits". */
    expect(
      (await me.query(api.github.listRecent, { projectId })).map(
        (c) => c.message,
      ),
    ).toEqual(['Real work'])
    expect(rows.find((r) => r.sha === 'm1')?.isMerge).toBe(true)
    expect(rows.find((r) => r.sha === 'r1')?.isMerge).toBe(false)

    const counts = await me.query(api.aggregate.projectCommits, {
      projectId,
      ...bounds,
    })
    expect(counts.thisWeek).toBe(1)

    const dayStarts = Array.from({ length: 14 }, (_, i) =>
      new Date(2026, 8, 7 + i).getTime(),
    )
    const year = await me.query(api.aggregate.projectActivity, {
      projectId,
      dayStarts,
      end: new Date(2026, 8, 21).getTime(),
    })
    expect(year.total).toBe(1)
    expect(year.days[8]).toBe(1) // 15 Sep, the real commit only
    expect(year.complete).toBe(true)
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
