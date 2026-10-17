/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { HELD } from './e2eFind'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'

afterEach(() => vi.unstubAllEnvs())

test('manyHeld runs only on the test backend', async () => {
  const me = convexTest(schema, modules).withIdentity({ tokenIdentifier: ME })
  await expect(me.mutation(api.e2eFind.manyHeld, {})).rejects.toThrow()
})

test('manyHeld holds eight things, each with one price', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const accountId = await t.run((ctx) =>
    ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Revolut',
      kinds: ['broker'],
      currencies: ['EUR'],
      order: 0,
    }),
  )
  await me.mutation(api.e2eFind.manyHeld, {})
  const { held, prices } = await t.run(async (ctx) => ({
    held: await ctx.db
      .query('holdings')
      .withIndex('by_owner_account', (q) =>
        q.eq('ownerId', ME).eq('accountId', accountId),
      )
      .collect(),
    prices: await ctx.db.query('prices').collect(),
  }))
  expect(held).toHaveLength(HELD.length)
  expect(prices).toHaveLength(HELD.length)
})
