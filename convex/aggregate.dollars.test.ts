/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'
const DAY = 86_400_000

/* His crypto in dollars (10 Oct): Revolut shows +22.7% in dollars where
   the app said +29.1% in euros — the same coins, the dollar risen since.
   Paid in dollars is each buy at its own day's rate. */
test('paid in dollars at each buy day, worth at today; dust under €1 is no position', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const now = Date.now()
  await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Revolut',
      kinds: ['broker'],
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order: 0,
    })
    const coin = async (symbol: string, shares: number, price: number) => {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId: ME,
        symbol,
        name: symbol,
        exchange: 'CCC',
        currency: 'EUR',
        type: 'CRYPTOCURRENCY',
      })
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId,
        instrumentId,
        side: 'buy',
        shares,
        priceEur: 83,
        occurredAt: now - 400 * DAY,
        noCash: true,
      })
      await ctx.db.insert('prices', {
        ownerId: ME,
        instrumentId,
        price,
        currency: 'EUR',
        asOf: now - DAY,
        fetchedAt: now,
        source: 'Yahoo Finance',
      })
    }
    await coin('SOL-EUR', 1, 120)
    await coin('XLM-EUR', 0.06, 0.2)
    for (const [asOf, rate] of [
      [now - 401 * DAY, 0.845],
      [now - DAY, 0.89],
    ])
      await ctx.db.insert('fxRates', {
        ownerId: ME,
        currency: 'USD',
        rate,
        asOf,
        fetchedAt: now,
        source: 'ECB via Frankfurter',
      })
  })
  const p = await me.query(api.aggregate.positions, {})
  expect(p.rows.map((r) => r.symbol)).toEqual(['SOL-EUR'])
  expect(p.usdRate).toBe(0.89)
  expect(p.rows[0].paid).toBe(83)
  /* €83 on a day a dollar was €0.845: $98.22. */
  expect(p.rows[0].paidUsd).toBeCloseTo(83 / 0.845, 2)
})

test('the nightly job finds an owner whose first trade is older than his first dollar rate', async () => {
  const t = convexTest(schema, modules)
  const now = Date.now()
  await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Revolut',
      kinds: ['broker'],
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order: 0,
    })
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId: ME,
      symbol: 'SOL-EUR',
      name: 'SOL',
      exchange: 'CCC',
      currency: 'EUR',
      type: 'CRYPTOCURRENCY',
    })
    await ctx.db.insert('trades', {
      ownerId: ME,
      accountId,
      instrumentId,
      side: 'buy',
      shares: 1,
      priceEur: 83,
      occurredAt: now - 1500 * DAY,
    })
    await ctx.db.insert('fxRates', {
      ownerId: ME,
      currency: 'USD',
      rate: 0.9,
      asOf: now - 1000 * DAY,
      fetchedAt: now,
      source: 'ECB via Frankfurter',
    })
  })
  expect(await t.query(internal.market.usdGaps, {})).toEqual([
    { ownerId: ME, from: now - 1500 * DAY },
  ])
})
