/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const DAY = 86_400_000
const args = {
  prevStart: 0,
  dayStarts: [30 * DAY, 31 * DAY],
  nextStart: 32 * DAY,
  languages: ['portuguese'],
}

/* Today's THIS MONTH: his own rows only, the bank's never read. */
test('monthSix counts his posts, workouts, sessions and commits', async () => {
  const t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    for (const ownerId of [ME, OTHER])
      await ctx.db.insert('logs', {
        ownerId,
        kind: 'post',
        area: 'social',
        occurredAt: 31 * DAY,
      })
    await ctx.db.insert('logs', {
      ownerId: ME,
      kind: 'workout',
      area: 'body',
      occurredAt: DAY,
    })
    await ctx.db.insert('logs', {
      ownerId: ME,
      kind: 'session',
      area: 'portuguese',
      occurredAt: 30 * DAY,
    })
    const projectId = await ctx.db.insert('projects', {
      ownerId: ME,
      title: 'SL',
      status: 'focus',
      githubRepo: 'a/sl',
    })
    for (const isMerge of [false, true])
      await ctx.db.insert('commits', {
        ownerId: ME,
        projectId,
        repo: 'a/sl',
        sha: `${isMerge}`,
        message: 'x',
        url: 'u',
        authoredAt: 30 * DAY + 1,
        fetchedAt: 0,
        isMerge,
      })
  })
  const six = await t
    .withIdentity({ tokenIdentifier: ME })
    .query(api.aggregate.monthSix, args)
  expect(six.post).toEqual({ days: [0, 1], prev: 0 })
  expect(six.workout).toEqual({ days: [0, 0], prev: 1 })
  expect(six.langs.days).toEqual([1, 0])
  expect(six.commits.days).toEqual([1, 0])
})

/* 20 Oct: September's 411 commits used the 500-row read, October showed 65. */
test('monthSix counts this month past a full month before', async () => {
  const t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    const projectId = await ctx.db.insert('projects', {
      ownerId: ME,
      title: 'SL',
      status: 'focus',
      githubRepo: 'a/sl',
    })
    for (let i = 0; i < 620; i++)
      await ctx.db.insert('commits', {
        ownerId: ME,
        projectId,
        repo: 'a/sl',
        sha: `s${i}`,
        message: 'x',
        url: 'u',
        authoredAt: i < 600 ? DAY + i : 31 * DAY + i,
        fetchedAt: 0,
      })
  })
  const six = await t
    .withIdentity({ tokenIdentifier: ME })
    .query(api.aggregate.monthSix, args)
  expect(six.commits).toEqual({ days: [0, 20], prev: 600 })
})

/* 25 Oct: the month before over the same days — a row past the cut is out. */
test('monthSix counts the month before up to prevCut', async () => {
  const t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    for (const at of [DAY, 20 * DAY])
      await ctx.db.insert('logs', {
        ownerId: ME,
        kind: 'post',
        area: 'social',
        occurredAt: at,
      })
  })
  const six = await t
    .withIdentity({ tokenIdentifier: ME })
    .query(api.aggregate.monthSix, { ...args, prevCut: 10 * DAY })
  expect(six.post.prev).toBe(1)
})

test('monthSix refuses without a user', async () => {
  const t = convexTest(schema, modules)
  await expect(t.query(api.aggregate.monthSix, args)).rejects.toThrow()
})
