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

test('monthSix refuses without a user', async () => {
  const t = convexTest(schema, modules)
  await expect(t.query(api.aggregate.monthSix, args)).rejects.toThrow()
})
