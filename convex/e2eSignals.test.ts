/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'

afterEach(() => vi.unstubAllEnvs())

test('heldShare runs only on the test backend', async () => {
  const me = convexTest(schema, modules).withIdentity({ tokenIdentifier: ME })
  await expect(me.mutation(api.e2eSignals.heldShare, {})).rejects.toThrow()
})

test('heldShare stores a year of closes, two buys now and a closed round', async () => {
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
  const id = await me.mutation(api.e2eSignals.heldShare, {})
  const { prices, trades } = await t.run(async (ctx) => ({
    prices: await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q.eq('ownerId', ME).eq('instrumentId', id),
      )
      .collect(),
    trades: await ctx.db
      .query('trades')
      .withIndex('by_owner_instrument', (q) =>
        q.eq('ownerId', ME).eq('instrumentId', id),
      )
      .collect(),
  }))
  expect(prices).toHaveLength(300)
  expect(prices.at(-1)?.price).toBe(449.5)
  expect(trades.map((r) => r.side).sort()).toEqual([
    'buy',
    'buy',
    'buy',
    'sell',
  ])
})
