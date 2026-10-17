/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const DAY = 86_400_000
const MON = Date.UTC(2026, 2, 23)

/* A share's days stored before candles (13 Oct) are read again once, when
   its page is opened. The timers are held, so the reading itself — a call
   to Yahoo — never runs here. */
beforeEach(() => {
  vi.useFakeTimers({ now: MON + 10 * DAY })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup(ownerId = ME, type = 'EQUITY') {
  const t = convexTest(schema, modules)
  const instrumentId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('instruments', {
      ownerId,
      symbol: 'SHOP',
      name: 'Shopify Inc.',
      exchange: 'NMS',
      currency: 'USD',
      type,
    })
    /* Stored at the close, as the latest price is; Yahoo stamps a past
       day at its open. */
    for (const [day, price] of [
      [0, 96],
      [1, 98],
      [2, 124],
    ])
      await ctx.db.insert('prices', {
        ownerId,
        instrumentId: id,
        price,
        currency: 'USD',
        asOf: MON + day * DAY + 20 * 3_600_000,
        fetchedAt: MON,
        source: 'Yahoo Finance',
      })
    return id
  })
  const asked = async () =>
    await t.run(
      async (ctx) =>
        await ctx.db.system.query('_scheduled_functions').collect(),
    )
  const stored = async () =>
    await t.run(async (ctx) => await ctx.db.query('prices').collect())
  return {
    t,
    instrumentId,
    me: t.withIdentity({ tokenIdentifier: ME }),
    asked,
    stored,
  }
}

const bar = (day: number, price: number) => ({
  asOf: MON + day * DAY + 13.5 * 3_600_000,
  price,
  open: price - 2,
  high: price + 1.5,
  low: price - 3,
  volume: 199_000 + day,
})

test('a share never read as bars is read, that share alone', async () => {
  const { me, instrumentId, asked } = await setup()
  expect(await me.mutation(api.bars.ask, { instrumentId })).toBe('reading')
  const jobs = await asked()
  expect(jobs).toHaveLength(1)
  expect(jobs[0].args).toEqual([{ instrumentId }])
})

test("another user's share is refused", async () => {
  const { me, instrumentId, asked } = await setup(OTHER)
  await expect(me.mutation(api.bars.ask, { instrumentId })).rejects.toThrow(
    'No such share',
  )
  expect(await asked()).toHaveLength(0)
})

test('the test backend keeps its mock prices', async () => {
  vi.stubEnv('E2E', '1')
  const { me, instrumentId, asked } = await setup()
  expect(await me.mutation(api.bars.ask, { instrumentId })).toBe('fresh')
  expect(await asked()).toHaveLength(0)
})

test('a share with no market is not asked about', async () => {
  const { me, instrumentId, asked } = await setup(ME, 'UNPRICED')
  expect(await me.mutation(api.bars.ask, { instrumentId })).toBe('nothing')
  expect(await asked()).toHaveLength(0)
})

test('the four are written onto the stored day, and nothing twice', async () => {
  const { t, me, instrumentId, asked, stored } = await setup()
  const rows = [bar(0, 96), bar(1, 98), bar(2, 124), bar(3, 126)]
  expect(await t.mutation(internal.bars.store, { instrumentId, rows })).toBe(3)
  const after = await stored()
  /* No row added, none moved: the day, its close and its time stay. */
  expect(after).toHaveLength(3)
  expect(after[0]).toMatchObject({
    asOf: MON + 20 * 3_600_000,
    price: 96,
    open: 94,
    high: 97.5,
    low: 93,
    volume: 199_000,
  })
  expect(await t.mutation(internal.bars.store, { instrumentId, rows })).toBe(0)
  /* Read once: opening the page again asks for nothing. */
  expect(await me.mutation(api.bars.ask, { instrumentId })).toBe('fresh')
  expect(await asked()).toHaveLength(0)
})

test('a bar is not put on a close it does not belong to', async () => {
  const { t, instrumentId, stored } = await setup()
  /* The stored close is 96; a bar closing at 48 is another reading of
     that day (a split since), not this one's open and high. */
  expect(
    await t.mutation(internal.bars.store, {
      instrumentId,
      rows: [bar(0, 48), bar(1, 98)],
    }),
  ).toBe(1)
  const after = await stored()
  expect(after[0].open).toBeUndefined()
  expect(after[1].open).toBe(96)
})

/* From now on every reading stores the four (market.storePrices). */
test('a new reading stores the bar; a day stored without takes it', async () => {
  const { t, instrumentId, stored } = await setup()
  const args = {
    ownerId: ME,
    instrumentId,
    currency: 'USD',
    fetchedAt: MON + 10 * DAY,
  }
  const late = { ...bar(2, 124), asOf: MON + 2 * DAY + 20 * 3_600_000 }
  await t.mutation(internal.market.storePrices, {
    ...args,
    rows: [late, bar(3, 126)],
  })
  const after = (await stored()).sort((a, b) => a.asOf - b.asOf)
  expect(after).toHaveLength(4)
  expect(after[2]).toMatchObject({ price: 124, open: 122, volume: 199_002 })
  expect(after[3]).toMatchObject({ price: 126, high: 127.5, low: 123 })
  /* The same reading again writes nothing. */
  const ids = after.map((r) => r._id)
  await t.mutation(internal.market.storePrices, {
    ...args,
    rows: [late, bar(3, 126)],
  })
  expect((await stored()).map((r) => r._id).sort()).toEqual(ids.sort())
})

/* One reading of every ticker is one write (17 Oct): each separate write
   re-ran every open worth query. */
test('a batch stores each ticker as storePrices would, once', async () => {
  const { t, instrumentId, stored } = await setup()
  const other = await t.run(
    async (ctx) =>
      await ctx.db.insert('instruments', {
        ownerId: ME,
        symbol: 'VWCE.DE',
        name: 'Vanguard FTSE All-World',
        exchange: 'GER',
        currency: 'EUR',
        type: 'ETF',
      }),
  )
  const fetchedAt = MON + 10 * DAY
  const readings = [
    {
      ownerId: ME,
      instrumentId,
      currency: 'USD',
      rows: [bar(3, 126)],
      fetchedAt,
    },
    {
      ownerId: ME,
      instrumentId: other,
      currency: 'EUR',
      rows: [bar(3, 140)],
      fetchedAt,
    },
  ]
  await t.mutation(internal.market.storePriceBatch, { readings })
  expect(await stored()).toHaveLength(5)
  const theirs = await t.run(
    async (ctx) =>
      await ctx.db
        .query('prices')
        .withIndex('by_owner_instrument_time', (q) =>
          q.eq('ownerId', ME).eq('instrumentId', other),
        )
        .collect(),
  )
  expect(theirs).toHaveLength(1)
  expect(theirs[0]).toMatchObject({ price: 140, currency: 'EUR' })
  /* The same batch again writes nothing. */
  await t.mutation(internal.market.storePriceBatch, { readings })
  expect(await stored()).toHaveLength(5)
})
