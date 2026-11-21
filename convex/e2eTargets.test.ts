/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'

afterEach(() => vi.unstubAllEnvs())

test('funds runs only on the test backend', async () => {
  const me = convexTest(schema, modules).withIdentity({ tokenIdentifier: ME })
  await expect(me.mutation(api.e2eTargets.funds, {})).rejects.toThrow()
})

test('funds holds a gold fund and a coin, each with a price', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await t.run((ctx) =>
    ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Revolut',
      kinds: ['broker'],
      currencies: ['EUR'],
      order: 0,
    }),
  )
  await me.mutation(api.e2eTargets.funds, {})
  const { held, prices } = await t.run(async (ctx) => ({
    held: await ctx.db.query('holdings').collect(),
    prices: await ctx.db.query('prices').collect(),
  }))
  expect(held).toHaveLength(2)
  expect(prices.map((p) => p.price).sort((a, b) => a - b)).toEqual([300, 2000])
})
