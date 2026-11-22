/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'
const FRI_CLOSE = Date.UTC(2026, 10, 20, 21)
const SUN = Date.UTC(2026, 10, 22, 13, 11)
const MON_CLOSE = Date.UTC(2026, 10, 23, 21)

/* A Trade Republic Net Worth PDF's shape: 17 positions, shares and the
   value it printed, priced on Friday's close (made-up numbers; total
   €5,481.30). */
const PDF: Array<[string, number, number]> = [
  ['GEV', 2.07823, 190.51],
  ['NBIS', 3.97542, 143.46],
  ['DASH', 3.308116, 319.41],
  ['MA', 0.536394, 404.46],
  ['UBER', 0.417475, 360.19],
  ['AVGO', 0.605161, 154.43],
  ['RHM', 2.662211, 596.11],
  ['V', 0.918051, 233.94],
  ['GOOGL', 3.839113, 668.63],
  ['NVDA', 3.547197, 338.01],
  ['NFLX', 5.86228, 127.95],
  ['SHOP', 5.179117, 273.77],
  ['MSFT', 1.036679, 170.68],
  ['PLTR', 1.989195, 589.68],
  ['MELI', 1.248213, 448.96],
  ['META', 3.905698, 323.44],
  ['AMZN', 3.376918, 137.67],
]

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(SUN + 3_600_000) })
})
afterEach(() => {
  vi.useRealTimers()
})

async function world(opts: { monday?: boolean; boughtSince?: boolean } = {}) {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await t.run(async (ctx) => {
    const tr = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order: 0,
    })
    for (const asOf of [FRI_CLOSE, MON_CLOSE])
      await ctx.db.insert('fxRates', {
        ownerId: ME,
        currency: 'USD',
        rate: 0.9,
        asOf: Math.floor(asOf / 86_400_000) * 86_400_000,
        fetchedAt: asOf,
        source: 'ECB',
      })
    for (const [symbol, shares, valueEur] of PDF) {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId: ME,
        symbol,
        name: symbol,
        type: 'EQUITY',
        currency: 'USD',
        exchange: 'NASDAQ',
      })
      await ctx.db.insert('holdings', {
        ownerId: ME,
        accountId: tr,
        instrumentId,
        shares,
        asOf: SUN,
        valueEur,
      })
      /* Yahoo's close: a dollar price 1% under TR's euro one. */
      const price = Math.round((valueEur / shares / 0.9) * 0.99 * 100) / 100
      await ctx.db.insert('prices', {
        ownerId: ME,
        instrumentId,
        price,
        currency: 'USD',
        asOf: FRI_CLOSE,
        fetchedAt: FRI_CLOSE,
        source: 'Yahoo Finance',
      })
      if (opts.monday)
        await ctx.db.insert('prices', {
          ownerId: ME,
          instrumentId,
          price,
          currency: 'USD',
          asOf: MON_CLOSE,
          fetchedAt: MON_CLOSE,
          source: 'Yahoo Finance',
        })
      if (opts.boughtSince && symbol === 'NVDA')
        await ctx.db.insert('trades', {
          ownerId: ME,
          accountId: tr,
          instrumentId,
          side: 'buy',
          shares: 1,
          priceEur: 110,
          occurredAt: SUN + 60_000,
        })
    }
  })
  return me
}

const sum = (rows: ReadonlyArray<{ valueEur: number | null }>) =>
  Math.round(rows.reduce((s, r) => s + (r.valueEur ?? 0), 0) * 100) / 100

test('17 positions are worth what the Net Worth PDF says: €5,481.30', async () => {
  const me = await world()
  const p = await me.query(api.aggregate.positions, {})
  expect(p.rows).toHaveLength(17)
  expect(sum(p.rows)).toBe(5481.3)
  expect(p.rows.every((r) => r.statementAt === SUN)).toBe(true)
})

test("a newer close than the statement: Yahoo's price again", async () => {
  const me = await world({ monday: true })
  const p = await me.query(api.aggregate.positions, {})
  expect(p.rows.every((r) => r.statementAt === null)).toBe(true)
  expect(sum(p.rows)).not.toBe(5481.3)
})

test('a buy since the statement: that position is the market’s', async () => {
  const me = await world({ boughtSince: true })
  const p = await me.query(api.aggregate.positions, {})
  const nvda = p.rows.find((r) => r.symbol === 'NVDA')
  expect(nvda?.statementAt).toBeNull()
  expect(p.rows.filter((r) => r.statementAt !== null)).toHaveLength(16)
})

test("the Treasury's worth today reads the same €5,481.30", async () => {
  const me = await world()
  const end = Date.UTC(2026, 10, 22, 23, 59)
  const past = await me.query(api.aggregate.worthPast, {
    dayEnds: [end - 86_400_000, end],
  })
  const today = await me.query(api.aggregate.worthToday, past.today)
  expect(today.invested).toBe(5481.3)
})
