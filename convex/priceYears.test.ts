/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const NOW = Date.UTC(2026, 9, 13, 12)

/* The older years behind "all" (13 Oct): read for one share when it is
   asked, one record a past calendar year, stored once. Yahoo and the ECB
   are answered here by hand. */
const at = (y: number, m: number, d: number) => Date.UTC(y, m, d, 13, 30)
const days = (list: Array<number>) => ({
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          regularMarketPrice: 118.4,
          regularMarketTime: NOW / 1000,
        },
        timestamp: list.map((t) => t / 1000),
        indicators: {
          quote: [
            {
              close: list.map((_, i) => 100 + i),
              open: list.map((_, i) => 99 + i),
              high: list.map((_, i) => 102 + i),
              low: list.map((_, i) => 98 + i),
              volume: list.map((_, i) => 1000 + i),
            },
          ],
        },
      },
    ],
  },
})
const FIVE = [
  at(2022, 5, 1),
  at(2023, 0, 2),
  at(2023, 0, 3),
  at(2024, 6, 1),
  at(2025, 11, 30),
  at(2026, 0, 5),
]

let asked: Array<string> = []
function answer(yahoo: unknown | null) {
  asked = []
  vi.stubGlobal('fetch', (url: string) => {
    asked.push(url)
    if (url.includes('frankfurter'))
      return Promise.resolve(
        Response.json({
          rates: { '2022-12-30': { EUR: 0.9 }, '2023-01-03': { EUR: 0.5 } },
        }),
      )
    return Promise.resolve(
      yahoo === null ? new Response('', { status: 500 }) : Response.json(yahoo),
    )
  })
}

beforeEach(() => {
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function setup(ownerId = ME, type = 'EQUITY') {
  const t = convexTest(schema, modules)
  const instrumentId = await t.run(
    async (ctx) =>
      await ctx.db.insert('instruments', {
        ownerId,
        symbol: 'SHOP',
        name: 'Shopify Inc.',
        exchange: 'NMS',
        currency: 'USD',
        type,
      }),
  )
  const stored = async () =>
    await t.run(async (ctx) => await ctx.db.query('priceYears').collect())
  const me = t.withIdentity({ tokenIdentifier: ME })
  return { t, instrumentId, me, stored }
}

test('five years are stored, a record a past year, and once', async () => {
  answer(days(FIVE))
  const { me, instrumentId, stored } = await setup()
  expect(await me.action(api.priceYears.read, { instrumentId })).toBe('stored')
  expect(asked[0]).toContain('range=5y')
  const years = await stored()
  /* The year still running stays in `prices`. */
  expect(years.map((y) => y.year)).toEqual([2022, 2023, 2024, 2025])
  expect(years[1].bars.map((b) => b.asOf)).toEqual([FIVE[1], FIVE[2]])
  expect(years[1].bars[0]).toMatchObject({
    price: 101,
    open: 100,
    volume: 1001,
  })
  expect(years[1]).toMatchObject({
    ownerId: ME,
    source: 'Yahoo Finance',
    fetchedAt: NOW,
  })
  /* A second ask reads nothing and writes nothing. */
  asked = []
  expect(await me.action(api.priceYears.read, { instrumentId })).toBe('fresh')
  expect(asked).toEqual([])
  expect(await stored()).toHaveLength(4)
})

test('a year stored before is never written again', async () => {
  const { t, instrumentId, stored } = await setup()
  const bars = [{ asOf: FIVE[1], price: 101 }]
  const args = { instrumentId, currency: 'USD', rates: [], fetchedAt: NOW }
  expect(await t.mutation(internal.priceYears.store, { ...args, bars })).toBe(1)
  expect(
    await t.mutation(internal.priceYears.store, {
      ...args,
      bars: [{ asOf: FIVE[1], price: 55 }, ...bars],
    }),
  ).toBe(0)
  expect((await stored())[0].bars).toEqual(bars)
})

test('a share two years old has two years, none empty', async () => {
  answer(days([at(2024, 6, 1), at(2025, 11, 30), at(2026, 0, 5)]))
  const { me, instrumentId, stored } = await setup()
  await me.action(api.priceYears.read, { instrumentId })
  expect((await stored()).map((y) => y.year)).toEqual([2024, 2025])
})

test("another user's share is refused, and not read for them", async () => {
  answer(days(FIVE))
  const { me, t, instrumentId, stored } = await setup(OTHER)
  await expect(
    me.action(api.priceYears.read, { instrumentId }),
  ).rejects.toThrow('No such share')
  expect(asked).toEqual([])
  await t.mutation(internal.priceYears.store, {
    instrumentId,
    currency: 'USD',
    bars: [{ asOf: FIVE[1], price: 101 }],
    rates: [],
    fetchedAt: NOW,
  })
  expect(await stored()).toHaveLength(1)
  expect(await me.query(api.priceYears.line, { instrumentId })).toEqual([])
})

test('Yahoo not answering stores nothing, and it can be asked again', async () => {
  answer(null)
  const { me, instrumentId, stored } = await setup()
  expect(await me.action(api.priceYears.read, { instrumentId })).toBe('failed')
  expect(await stored()).toEqual([])
  answer(days(FIVE))
  expect(await me.action(api.priceYears.read, { instrumentId })).toBe('stored')
})

test('a share with no market is not read', async () => {
  answer(days(FIVE))
  const { me, instrumentId } = await setup(ME, 'UNPRICED')
  expect(await me.action(api.priceYears.read, { instrumentId })).toBe('nothing')
  expect(asked).toEqual([])
})

test('the years come back oldest first, in euros where a rate is stored', async () => {
  answer(days(FIVE))
  const { me, instrumentId } = await setup()
  await me.action(api.priceYears.read, { instrumentId })
  const line = await me.query(api.priceYears.line, { instrumentId })
  expect(line.map((b) => b.asOf)).toEqual(FIVE.slice(0, 5))
  /* 2 Jan 2023 takes the rate of 30 Dec, three days before; 3 Jan its
     own. No rate within four days: the dollar price alone. */
  expect(line.map((b) => b.eur)).toEqual([
    undefined,
    90.9,
    51,
    undefined,
    undefined,
  ])
  expect(line[1]).toMatchObject({ price: 101, open: 100, high: 103, low: 99 })
})
