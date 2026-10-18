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
const HOUR = 3_600_000

async function seed(kind: 'workout' | 'weight' | 'expense', owner = ME) {
  const t = convexTest(schema, modules)
  const at = Date.now() - 48 * HOUR
  const logId = await t.run((ctx) =>
    ctx.db.insert('logs', {
      ownerId: owner.tokenIdentifier,
      kind,
      area: kind === 'expense' ? 'money' : 'body',
      occurredAt: at,
    }),
  )
  return { t, logId, at }
}

test('a block moves, and the first time stays on the row', async () => {
  const { t, logId, at } = await seed('workout')
  const me = t.withIdentity(ME)
  await me.mutation(api.logs.setTime, { logId, occurredAt: at + HOUR })
  await me.mutation(api.logs.setTime, { logId, occurredAt: at + 2 * HOUR })
  const row = await t.run((ctx) => ctx.db.get(logId))
  expect(row?.occurredAt).toBe(at + 2 * HOUR)
  expect(row?.meta?.movedFrom).toBe(at)
})

test('not into the future', async () => {
  const { t, logId } = await seed('workout')
  await expect(
    t.withIdentity(ME).mutation(api.logs.setTime, {
      logId,
      occurredAt: Date.now() + HOUR,
    }),
  ).rejects.toThrow(/not in the future/)
})

test('a weight and a bank row stay where they are', async () => {
  for (const kind of ['weight', 'expense'] as const) {
    const { t, logId, at } = await seed(kind)
    await expect(
      t
        .withIdentity(ME)
        .mutation(api.logs.setTime, { logId, occurredAt: at + HOUR }),
    ).rejects.toThrow(/Only a workout/)
  }
})

test("someone else's row is refused", async () => {
  const { t, logId, at } = await seed('workout')
  await expect(
    t
      .withIdentity(OTHER)
      .mutation(api.logs.setTime, { logId, occurredAt: at + HOUR }),
  ).rejects.toThrow(/No such log/)
})
