/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { rowKey } from '../src/lib/payee'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'
const DAY = 86_400_000
const MON = new Date(2026, 9, 12).getTime()
const dayStarts = Array.from({ length: 14 }, (_, i) => MON - 7 * DAY + i * DAY)
const end = MON + 7 * DAY
const fourWeeksStart = MON - 21 * DAY
const args = { dayStarts, end, fourWeeksStart, languages: ['portuguese'] }

/* Two people in one database, so "only mine" is really tested. */
function twoOwners() {
  const t = convexTest(schema, modules)
  return {
    t,
    mine: t.withIdentity({ tokenIdentifier: ME }),
    theirs: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

describe('aggregate.weekReview', () => {
  test('spent this week and last, bills apart, biggest by name — only mine', async () => {
    const { t, mine } = twoOwners()
    await t.run(async (ctx) => {
      const bill = await ctx.db.insert('recurring', {
        ownerId: ME,
        name: 'Anthropic',
        kind: 'expense',
        amount: 22.14,
        cadence: 'monthly',
        day: 13,
      })
      const spend = (owner: string, at: number, value: number, meta = {}) =>
        ctx.db.insert('logs', {
          ownerId: owner,
          area: 'money',
          kind: 'expense',
          occurredAt: at,
          value,
          unit: 'eur',
          text: 'Solinca',
          meta,
        })
      await spend(ME, MON + 2 * DAY + 3_600_000, 5.98, {
        category: 'subscriptions',
      })
      await spend(ME, MON + DAY, 22.14, { recurringId: bill })
      await spend(ME, MON - 7 * DAY + 3_600_000, 37.86, { payee: 'Veiga' })
      await spend(ME, MON - DAY, 25)
      await spend(SOMEONE_ELSE, MON + DAY, 999)
      await ctx.db.insert('payees', {
        ownerId: ME,
        key: rowKey({ text: 'Solinca' }),
        name: 'Solinca Gym',
        domain: 'solinca.pt',
        updatedAt: 0,
      })
    })

    const r = await mine.query(api.aggregate.weekReview, args)
    expect(r.money.spent).toBe(5.98)
    expect(r.money.lastSpent).toBe(62.86)
    expect(r.money.bills).toBe(22.14)
    expect(r.money.byDay).toEqual([0, 0, 5.98, 0, 0, 0, 0])
    expect(r.money.biggest.map((b) => [b.name, b.domain, b.category])).toEqual([
      ['Solinca Gym', 'solinca.pt', 'subscriptions'],
    ])
    expect(r.money.latestAt).toBe(MON + 2 * DAY + 3_600_000)
    expect(r.complete).toBe(true)
  })

  test('a live project: commits by day, last week, target, messages, tasks', async () => {
    const { t, mine } = twoOwners()
    await t.run(async (ctx) => {
      const p = await ctx.db.insert('projects', {
        ownerId: ME,
        title: 'Solo Leveling',
        status: 'focus',
        githubRepo: 'me/sl',
        commitTargetWeekly: 2,
      })
      await ctx.db.insert('projects', {
        ownerId: ME,
        title: 'Oreum',
        status: 'active',
      })
      await ctx.db.insert('projects', {
        ownerId: ME,
        title: 'Old',
        status: 'completed',
      })
      await ctx.db.insert('projects', {
        ownerId: SOMEONE_ELSE,
        title: 'Theirs',
        status: 'focus',
      })
      const commit = (at: number, message: string, isMerge = false) =>
        ctx.db.insert('commits', {
          ownerId: ME,
          projectId: p,
          repo: 'me/sl',
          sha: message,
          message,
          url: '',
          authoredAt: at,
          fetchedAt: at,
          isMerge,
        })
      await commit(MON + 3_600_000, 'first')
      await commit(MON + 3 * DAY, 'second')
      await commit(MON + 3 * DAY + 1, 'merge', true)
      await commit(MON - 3 * DAY, 'last week')
      await ctx.db.insert('tasks', {
        ownerId: ME,
        title: 'Ship',
        projectId: p,
        status: 'done',
        priority: 0,
        completedAt: MON - 20 * DAY,
      })
    })

    const r = await mine.query(api.aggregate.weekReview, args)
    expect(r.projects.map((p) => p.title)).toEqual(['Solo Leveling', 'Oreum'])
    const [sl, oreum] = r.projects
    expect(sl).toMatchObject({
      focus: true,
      target: 2,
      thisWeek: 2,
      lastWeek: 1,
      days: [1, 0, 0, 1, 0, 0, 0],
      messages: ['second', 'first'],
      tasksDone: 0,
      lastDoneAt: MON - 20 * DAY,
    })
    expect(oreum).toMatchObject({ thisWeek: 0, lastWeek: 0, lastDoneAt: null })
  })

  test('body and languages: this week beside four weeks; the last weight', async () => {
    const { t, mine } = twoOwners()
    await t.run(async (ctx) => {
      const log = (
        at: number,
        row: { kind: 'workout' | 'session'; area: string },
      ) => ctx.db.insert('logs', { ownerId: ME, occurredAt: at, ...row })
      await log(MON + 3_600_000, { kind: 'workout', area: 'body' })
      await log(MON - 10 * DAY, { kind: 'workout', area: 'body' })
      await log(MON - 30 * DAY, { kind: 'workout', area: 'body' })
      await log(MON - 2 * DAY, { kind: 'session', area: 'portuguese' })
      await ctx.db.insert('stateSnapshots', {
        ownerId: ME,
        area: 'body',
        key: 'weight',
        value: 75.4,
        unit: 'kg',
        recordedAt: MON - 37 * DAY,
        source: 'typed',
      })
    })

    const r = await mine.query(api.aggregate.weekReview, args)
    expect(r.body).toEqual({
      workouts: 1,
      workouts4: 2,
      weight: { value: 75.4, at: MON - 37 * DAY },
    })
    expect(r.languages).toEqual([{ slug: 'portuguese', week: 0, four: 1 }])
  })

  test('a quiet account: zeros and nothing to show, never a guess', async () => {
    const r = await twoOwners().mine.query(api.aggregate.weekReview, args)
    expect(r.money).toMatchObject({ spent: 0, lastSpent: 0, latestAt: null })
    expect(r.projects).toEqual([])
    expect(r.body.weight).toBeNull()
  })

  test('refuses anything but fourteen days', async () => {
    await expect(
      twoOwners().mine.query(api.aggregate.weekReview, {
        ...args,
        dayStarts: dayStarts.slice(7),
      }),
    ).rejects.toThrow('FOURTEEN_DAYS')
  })

  test('refuses without a signed-in person', async () => {
    await expect(
      convexTest(schema, modules).query(api.aggregate.weekReview, args),
    ).rejects.toThrow()
  })
})
