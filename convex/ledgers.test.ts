/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { LEDGER_PART } from './ledgers'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const DAY = 86_400_000

/* Positions read from ledgers say exactly what they said read from every
   trade (18 Oct). Built as his account stands: two brokers, a dollar
   share, a coin with staking rewards, a sale, a sold-out share, a
   retired account and another owner. */
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
    const thing = async (
      ownerId: string,
      symbol: string,
      price: number,
      currency = 'EUR',
    ) => {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId,
        symbol,
        name: symbol,
        exchange: 'NMS',
        currency,
        type: symbol === 'ADA' ? 'CRYPTOCURRENCY' : 'EQUITY',
      })
      for (let d = 1; d <= 40; d++)
        await ctx.db.insert('prices', {
          ownerId,
          instrumentId,
          price: price + d,
          currency,
          asOf: now - d * DAY,
          fetchedAt: now,
          source: 'Yahoo Finance',
        })
      return instrumentId
    }
    for (let d = 0; d <= 400; d += 1)
      await ctx.db.insert('fxRates', {
        ownerId: ME,
        currency: 'USD',
        rate: 0.9,
        asOf: now - d * DAY,
        fetchedAt: now,
        source: 'ECB',
      })
    const old = await account(ME, 'Old broker', 2)
    await ctx.db.patch(old, { retiredAt: now })
    return {
      revolut: await account(ME, 'Revolut', 0),
      tr: await account(ME, 'Trade Republic', 1),
      old,
      theirs: await account(OTHER, 'Revolut', 0),
      shop: await thing(ME, 'SHOP', 118),
      nvda: await thing(ME, 'NVDA', 100, 'USD'),
      ada: await thing(ME, 'ADA', 0.5),
      gone: await thing(ME, 'GONE', 10),
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
    reward?: true,
  ) =>
    t.run((ctx) =>
      ctx.db.insert('trades', {
        ownerId,
        accountId,
        instrumentId,
        side,
        shares,
        priceEur,
        occurredAt: now - daysAgo * DAY,
        ...(reward ? { reward } : {}),
      }),
    )
  const { revolut, tr, old, theirs } = ids
  await trade(ME, revolut, ids.shop, 'buy', 2, 100, 30)
  await trade(ME, revolut, ids.shop, 'sell', 0.5, 115, 10)
  await trade(ME, tr, ids.shop, 'buy', 1, 105, 20)
  await trade(ME, revolut, ids.nvda, 'buy', 3, 80, 25)
  await trade(ME, revolut, ids.nvda, 'buy', 1, 85, 25)
  for (let d = 35; d >= 5; d--)
    await trade(ME, revolut, ids.ada, 'buy', 0.1, 0, d, true)
  await trade(ME, revolut, ids.ada, 'buy', 100, 0.4, 36)
  await trade(ME, tr, ids.gone, 'buy', 5, 8, 39)
  await trade(ME, tr, ids.gone, 'sell', 5, 12, 15)
  await trade(ME, old, ids.shop, 'buy', 9, 90, 30)
  await trade(OTHER, theirs, ids.theirShop, 'buy', 50, 100, 30)

  const me = t.withIdentity({ tokenIdentifier: ME })
  const dayEnds = [30, 20, 10, 2].map((d) => now - d * DAY)
  const screens = async () => ({
    positions: await me.query(api.aggregate.positions, {}),
    worth: await me.query(api.aggregate.worth, {}),
    worthPast: await me.query(api.aggregate.worthPast, { dayEnds }),
    held: await t.query(internal.aggregate.heldInstruments, { ownerId: ME }),
  })
  const ledgerRows = () =>
    t.run(async (ctx) => (await ctx.db.query('ledgers').collect()).length)
  /* Each of his ledgers, as his trades say it should be. */
  const inStep = () =>
    t.run(async (ctx) => {
      const trades = await ctx.db
        .query('trades')
        .withIndex('by_owner_time', (q) => q.eq('ownerId', ME))
        .collect()
      const slots = new Map<string, Array<number>>()
      for (const x of trades.sort(
        (a, b) =>
          a.occurredAt - b.occurredAt || a._creationTime - b._creationTime,
      )) {
        const k = `${x.ownerId}|${x.accountId}|${x.instrumentId}`
        slots.set(k, [...(slots.get(k) ?? []), x.shares])
      }
      const ledgers = new Map<string, Array<number>>()
      for (const l of (
        await ctx.db
          .query('ledgers')
          .withIndex('by_owner_account_instrument_part', (q) =>
            q.eq('ownerId', ME),
          )
          .collect()
      ).sort((a, b) => a.part - b.part)) {
        const k = `${l.ownerId}|${l.accountId}|${l.instrumentId}`
        ledgers.set(k, [...(ledgers.get(k) ?? []), ...l.shares])
      }
      return {
        slots: Object.fromEntries(slots),
        ledgers: Object.fromEntries(ledgers),
      }
    })
  return { t, now, ids, trade, me, screens, ledgerRows, inStep }
}

test('ledgers give positions, worth, worthPast and the held tickers unchanged', async () => {
  const w = await world()
  expect(await w.ledgerRows()).toBe(0)
  const fromTrades = await w.screens()
  expect(fromTrades.positions.rows.length).toBeGreaterThan(2)
  expect(fromTrades.positions.sold.map((s) => s.symbol)).toEqual(['GONE'])

  await w.t.mutation(internal.ledgers.build, { ownerId: ME })
  expect(await w.ledgerRows()).toBeGreaterThan(0)
  expect(await w.screens()).toEqual(fromTrades)
  const { slots, ledgers } = await w.inStep()
  expect(ledgers).toEqual(slots)
})

test('a removed trade, and its undo, change the ledger with it', async () => {
  const w = await world()
  await w.t.mutation(internal.ledgers.build, { ownerId: ME })
  const before = await w.screens()
  const sell = await w.t.run(
    async (ctx) =>
      (await ctx.db.query('trades').collect()).find(
        (x) => x.side === 'sell' && x.instrumentId === w.ids.shop,
      )!._id,
  )
  const removed = await w.me.mutation(api.invest.removeTrade, {
    tradeId: sell,
  })
  let s = await w.inStep()
  expect(s.ledgers).toEqual(s.slots)
  const shop = (await w.screens()).positions.rows.find(
    (r) => r.symbol === 'SHOP' && r.accountId === w.ids.revolut,
  )
  expect(shop?.shares).toBe(2)

  await w.me.mutation(api.invest.restoreTrade, { removedId: removed })
  s = await w.inStep()
  expect(s.ledgers).toEqual(s.slots)
  expect(await w.screens()).toEqual(before)
})

test('the first trade written after the deploy builds every ledger', async () => {
  const w = await world()
  const before = await w.screens()
  const sell = await w.t.run(async (ctx) =>
    (await ctx.db.query('trades').collect()).find(
      (x) => x.side === 'sell' && x.instrumentId === w.ids.gone,
    )!,
  )
  const removed = await w.me.mutation(api.invest.removeTrade, {
    tradeId: sell._id,
  })
  await w.me.mutation(api.invest.restoreTrade, { removedId: removed })
  const s = await w.inStep()
  const mine = (o: object) =>
    Object.keys(o)
      .filter((k) => k.startsWith(ME))
      .sort()
  expect(mine(s.ledgers)).toEqual(mine(s.slots))
  expect(await w.screens()).toEqual(before)
})

test('a position past one part splits and reads back the same', async () => {
  const w = await world()
  await w.t.run(async (ctx) => {
    for (let i = 0; i < LEDGER_PART + 5; i++)
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId: w.ids.tr,
        instrumentId: w.ids.ada,
        side: 'buy',
        shares: 0.001,
        priceEur: 0,
        occurredAt: w.now - 38 * DAY + i,
        reward: true,
      })
  })
  const fromTrades = await w.screens()
  await w.t.mutation(internal.ledgers.build, { ownerId: ME })
  const parts = await w.t.run(async (ctx) =>
    (await ctx.db.query('ledgers').collect())
      .filter((l) => l.accountId === w.ids.tr && l.instrumentId === w.ids.ada)
      .map((l) => [l.part, l.at.length]),
  )
  expect(parts.sort()).toEqual([
    [0, LEDGER_PART],
    [1, 5],
  ])
  expect(await w.screens()).toEqual(fromTrades)
})

test('an erased account takes its ledgers with it', async () => {
  const w = await world()
  await w.t.mutation(internal.ledgers.build, { ownerId: ME })
  await w.me.mutation(api.accounts.erase, { accountId: w.ids.tr })
  const s = await w.inStep()
  expect(s.ledgers).toEqual(s.slots)
})

test('ledgers are the owner’s alone, and a stranger is refused', async () => {
  const w = await world()
  await w.t.mutation(internal.ledgers.build, { ownerId: ME })
  await w.t.mutation(internal.ledgers.build, { ownerId: OTHER })
  const other = w.t.withIdentity({ tokenIdentifier: OTHER })
  const theirs = await other.query(api.aggregate.positions, {})
  expect(theirs.rows.map((r) => r.instrumentId)).toEqual([w.ids.theirShop])
  const mine = await w.me.query(api.aggregate.positions, {})
  expect(mine.rows.some((r) => r.instrumentId === w.ids.theirShop)).toBe(false)
  await expect(w.t.query(api.aggregate.positions, {})).rejects.toThrow()
  await expect(w.t.query(api.aggregate.worth, {})).rejects.toThrow()
})
