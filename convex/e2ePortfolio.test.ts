/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'

afterEach(() => vi.unstubAllEnvs())

test('misplaceBuys runs only on the test backend', async () => {
  const me = convexTest(schema, modules).withIdentity({ tokenIdentifier: ME })
  await expect(me.mutation(api.e2ePortfolio.misplaceBuys, {})).rejects.toThrow()
})

/* Gold's saved buys move to iShares Digital Security; one typed by hand
   (no file) stays on Gold. */
test('misplaceBuys moves the buys a file wrote, and only those', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Revolut',
      kinds: ['broker'],
      currencies: ['EUR'],
      order: 0,
    })
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId: ME,
      symbol: 'GC=F',
      name: 'Gold',
      exchange: 'CMX',
      currency: 'EUR',
      type: 'FUTURE',
    })
    const importId = await ctx.db.insert('intakes', {
      ownerId: ME,
      storageIds: [],
      status: 'done',
      files: [],
    })
    const trade = { ownerId: ME, accountId, instrumentId, side: 'buy' as const }
    await ctx.db.insert('trades', {
      ...trade,
      shares: 1,
      priceEur: 3600,
      occurredAt: 1,
      importId,
    })
    await ctx.db.insert('trades', {
      ...trade,
      shares: 2,
      priceEur: 3600,
      occurredAt: 2,
    })
  })
  await me.mutation(api.e2ePortfolio.misplaceBuys, {})
  const on = await t.run(async (ctx) => {
    const ins = await ctx.db.query('instruments').collect()
    return (await ctx.db.query('trades').collect()).map((x) => [
      x.shares,
      ins.find((i) => i._id === x.instrumentId)?.symbol,
    ])
  })
  expect(on).toEqual([
    [1, 'SHLD.L'],
    [2, 'GC=F'],
  ])
})
