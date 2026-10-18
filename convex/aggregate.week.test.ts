/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ME = { subject: 'user_me', tokenIdentifier: 'https://clerk.test|user_me' }
const OTHER = {
  subject: 'user_other',
  tokenIdentifier: 'https://clerk.test|user_other',
}
const DAY = 86_400_000
const args = { from: 10 * DAY, to: 17 * DAY, languages: ['portuguese'] }

/* Today's THIS WEEK: his rows of the six in the week, one each; the bank's
   and another user's never read. */
test('weekItems returns his six in the week, one row each', async () => {
  const t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    const log = (
      ownerId: string,
      kind: 'workout' | 'session' | 'post' | 'expense',
      area: string,
      occurredAt: number,
    ) => ctx.db.insert('logs', { ownerId, kind, area, occurredAt, value: 30 })
    const me = ME.tokenIdentifier
    await log(me, 'workout', 'body', 11 * DAY)
    await log(me, 'session', 'portuguese', 12 * DAY)
    await log(me, 'post', 'social', 13 * DAY)
    await log(me, 'workout', 'body', 9 * DAY)
    await log(me, 'workout', 'body', 17 * DAY)
    await log(me, 'expense', 'money', 12 * DAY)
    await log(OTHER.tokenIdentifier, 'workout', 'body', 11 * DAY)
  })
  const rows = await t.withIdentity(ME).query(api.aggregate.weekItems, args)
  expect(rows.map((r) => [r.kind, r.at])).toEqual([
    ['workout', 11 * DAY],
    ['langs', 12 * DAY],
    ['post', 13 * DAY],
  ])
  expect(rows[0].id).toBeDefined()
})

test('weekItems is refused without a user', async () => {
  const t = convexTest(schema, modules)
  await expect(t.query(api.aggregate.weekItems, args)).rejects.toThrow()
})
