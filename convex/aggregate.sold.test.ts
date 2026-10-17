/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const DAY = 86_400_000

/* What was sold out sits under the list (13 Oct). It is read from the
   same trades as what is owned, never as a position. */
async function world() {
  const t = convexTest(schema, modules)
  const now = Date.now()
  const ids = await t.run(async (ctx) => {
    const account = (ownerId: string, name: string, order: number) =>
      ctx.db.insert('accounts', {
        ownerId,
        name,
        kinds: ['broker'],
        currencies: ['EUR'],
        ibanTails: [],
        cardTails: [],
        order,
      })
    const thing = async (ownerId: string, symbol: string, price: number) => {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId,
        symbol,
        name: symbol,
        exchange: 'NMS',
        currency: 'EUR',
        type: 'EQUITY',
      })
      await ctx.db.insert('prices', {
        ownerId,
        instrumentId,
        price,
        currency: 'EUR',
        asOf: now - DAY,
        fetchedAt: now,
        source: 'Yahoo Finance',
      })
      return instrumentId
    }
    return {
      revolut: await account(ME, 'Revolut', 0),
      tr: await account(ME, 'Trade Republic', 1),
      theirs: await account(OTHER, 'Revolut', 0),
      shop: await thing(ME, 'SHOP', 118),
      amzn: await thing(ME, 'AMZN', 200),
      nvda: await thing(ME, 'NVDA', 100),
      theirShop: await thing(OTHER, 'SHOP', 118),
    }
  })
  const trade = (
    ownerId: string,
    accountId: Id<'accounts'>,
    instrumentId: Id<'instruments'>,
    side: 'buy' | 'sell',
    shares: number,
    priceEur: number,
    daysAgo: number,
  ) =>
    t.run(async (ctx) => {
      await ctx.db.insert('trades', {
        ownerId,
        accountId,
        instrumentId,
        side,
        shares,
        priceEur,
        occurredAt: now - daysAgo * DAY,
      })
    })
  return { t, now, ids, trade, me: t.withIdentity({ tokenIdentifier: ME }) }
}

test('sold out: under sold with its sums, not in what is owned', async () => {
  const { me, ids, trade, now } = await world()
  await trade(ME, ids.revolut, ids.shop, 'buy', 2, 90.3, 400)
  await trade(ME, ids.revolut, ids.shop, 'sell', 2, 118.45, 90)
  await trade(ME, ids.revolut, ids.nvda, 'buy', 1, 80, 30)
  /* Another owner's sale is never read. */
  await trade(OTHER, ids.theirs, ids.theirShop, 'buy', 1, 10, 50)
  await trade(OTHER, ids.theirs, ids.theirShop, 'sell', 1, 20, 40)

  const p = await me.query(api.aggregate.positions, {})
  expect(p.rows.map((r) => r.symbol)).toEqual(['NVDA'])
  expect(p.totalEur).toBe(100)
  expect(p.sold).toHaveLength(1)
  expect(p.sold[0]).toMatchObject({
    accountId: ids.revolut,
    instrumentId: ids.shop,
    symbol: 'SHOP',
    shares: 0,
    valueEur: 0,
    paid: 180.6,
    soldFor: 236.9,
    soldAt: now - 90 * DAY,
    price: 118,
  })
})

test('sold in one account and owned in another is owned', async () => {
  const { me, ids, trade } = await world()
  await trade(ME, ids.revolut, ids.amzn, 'buy', 1, 150, 300)
  await trade(ME, ids.revolut, ids.amzn, 'sell', 1, 180, 100)
  await trade(ME, ids.tr, ids.amzn, 'buy', 2, 160, 200)
  const p = await me.query(api.aggregate.positions, {})
  expect(p.rows.map((r) => [r.symbol, r.accountId])).toEqual([['AMZN', ids.tr]])
  expect(p.sold).toEqual([])
})

test('sold with no buys in the files: what was paid is not known', async () => {
  const { t, me, ids, trade, now } = await world()
  await t.run(async (ctx) => {
    await ctx.db.insert('holdings', {
      ownerId: ME,
      accountId: ids.revolut,
      instrumentId: ids.shop,
      shares: 3,
      asOf: now - 200 * DAY,
    })
  })
  await trade(ME, ids.revolut, ids.shop, 'sell', 3, 100, 50)
  const [s] = (await me.query(api.aggregate.positions, {})).sold
  expect(s.paid).toBeNull()
  expect(s.soldFor).toBe(300)
})

test('a retired account takes what it sold with it', async () => {
  const { t, me, ids, trade } = await world()
  await trade(ME, ids.revolut, ids.shop, 'buy', 1, 10, 50)
  await trade(ME, ids.revolut, ids.shop, 'sell', 1, 20, 40)
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.revolut, { retiredAt: Date.now() })
  })
  expect((await me.query(api.aggregate.positions, {})).sold).toEqual([])
})

/* The price reading asks only for what is held now (17 Oct). */
test("held tickers: a sold one and another owner's are left out", async () => {
  const { t, ids, trade } = await world()
  await trade(ME, ids.revolut, ids.shop, 'buy', 2, 90.3, 400)
  await trade(ME, ids.revolut, ids.shop, 'sell', 2, 118.45, 90)
  await trade(ME, ids.revolut, ids.nvda, 'buy', 1, 80, 30)
  await trade(ME, ids.tr, ids.nvda, 'buy', 1, 85, 20)
  await trade(OTHER, ids.theirs, ids.theirShop, 'buy', 1, 10, 50)
  expect(
    await t.query(internal.aggregate.heldInstruments, { ownerId: ME }),
  ).toEqual([ids.nvda])
})
