/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const THEM = 'https://clerk.test|user_them'
const AUG = new Date(2026, 7, 1).getTime()
const SEP = new Date(2026, 8, 1).getTime()

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

async function setup() {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  /* Artem: the deploy key seeded his principles (profiles.ts isOwner). */
  await t.run((ctx) =>
    ctx.db.insert('principles', { ownerId: ME, text: 'P', sortOrder: 0 }),
  )
  await t
    .withIdentity({ tokenIdentifier: ME })
    .mutation(api.e2eRowsAsk.month, { from: AUG })
  await t.run(async (ctx) => {
    /* Not in August, a merge, and someone else's. */
    await ctx.db.insert('logs', {
      ownerId: ME,
      kind: 'workout',
      area: 'body',
      occurredAt: SEP + 3_600_000,
    })
    await ctx.db.insert('logs', {
      ownerId: THEM,
      kind: 'workout',
      area: 'body',
      occurredAt: AUG + 3_600_000,
    })
    const p = (await ctx.db.query('projects').first())!
    await ctx.db.insert('commits', {
      ownerId: ME,
      projectId: p._id,
      repo: 'artem/oreum',
      sha: 'm',
      message: 'Merge pull request #1',
      url: 'https://github.com/artem/oreum',
      authoredAt: AUG + 86_400_000,
      fetchedAt: AUG,
      isMerge: true,
    })
    await ctx.db.insert('goals', {
      ownerId: ME,
      title: 'B2 Portuguese',
      area: 'portuguese',
      status: 'active',
    })
  })
  return t
}

test('the period’s rows: his only, only those days, merges left out', async () => {
  const t = await setup()
  const r = await t
    .withIdentity({ tokenIdentifier: ME })
    .query(api.rowsAsk.forPeriod, { from: AUG, to: SEP })
  expect(r.rows.logs).toHaveLength(8)
  expect(r.rows.logs.filter((l) => l.kind === 'workout')).toHaveLength(3)
  expect(r.rows.commits.map((c) => c.message)).toEqual([
    'feat: first run',
    'fix: auth',
    'feat: feed',
  ])
  expect(r.rows.commits[0].project).toBe('Oreum')
  expect(r.rows.goals).toEqual([
    { title: 'B2 Portuguese', area: 'portuguese', status: 'active' },
  ])
  expect(r.rows.more).toBe(false)
  expect(r.areas.find((a) => a.slug === 'portuguese')?.label).toBe('Portuguese')

  const them = await t
    .withIdentity({ tokenIdentifier: THEM })
    .query(api.rowsAsk.forPeriod, { from: AUG, to: SEP })
  expect(them.rows.logs).toHaveLength(1)
  expect(them.rows.commits).toHaveLength(0)
})

test('refused: signed out, a backwards or too long period', async () => {
  const t = await setup()
  await expect(
    t.query(api.rowsAsk.forPeriod, { from: AUG, to: SEP }),
  ).rejects.toThrow()
  const me = t.withIdentity({ tokenIdentifier: ME })
  await expect(
    me.query(api.rowsAsk.forPeriod, { from: SEP, to: AUG }),
  ).rejects.toThrow('BAD_PERIOD')
  await expect(
    me.query(api.rowsAsk.forPeriod, { from: AUG - 500 * 86_400_000, to: SEP }),
  ).rejects.toThrow('BAD_PERIOD')
})

test('the test answer: counted from the rows, charged to the month, a key never given dropped', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const t = await setup()
  const me = t.withIdentity({ tokenIdentifier: ME })
  const res = await me.action(api.ai.rowsAsk.ask, {
    question: 'What did I actually do in August?',
    from: AUG,
    to: SEP,
    title: 'AUG 2026',
    range: 'AUG 1 – 31',
    offsetMin: new Date(AUG).getTimezoneOffset(),
  })
  expect(res.ok).toBe(true)
  if (!res.ok) return
  expect(res.answer.tiles).toEqual([
    'commits',
    'workout.body',
    'session.portuguese',
    'spent',
  ])
  expect(res.answer.lines.map((l) => l.area)).toEqual([
    'projects',
    'body',
    'languages',
    'money',
    'tasks',
  ])
  /* The canned answer names commits.p2, which one project never gives. */
  expect(res.answer.lines[0].factKeys).toEqual(['commits.p1'])
  expect(res.answer.lines[3].stray).toBe(true)
  expect(res.stamp.cost).toBe(0.03)
  const month = new Date().toISOString().slice(0, 7)
  expect(await me.query(api.rowsAsk.spend, { month })).toEqual({
    spent: 0.03,
    cap: 2,
  })
})

test('the e2e seed refuses outside the test backend', async () => {
  const t = convexTest(schema, modules)
  await expect(
    t
      .withIdentity({ tokenIdentifier: ME })
      .mutation(api.e2eRowsAsk.month, { from: AUG }),
  ).rejects.toThrow('only on the test backend')
})
