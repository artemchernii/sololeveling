/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'

/* Insights I1, S6 (19 Oct): the market is fetched and shown, never
   saved — "DONT SAVE IT TO DB". The action writes no row, on the test
   backend's canned answer and on the real path with every source down,
   where each card comes back not reached instead of failing the room. */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const TABLES = [
  'prices',
  'instruments',
  'fundamentals',
  'fxRates',
  'priceYears',
  'logs',
  'stateSnapshots',
] as const

async function rows(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    let n = 0
    for (const table of TABLES) n += (await ctx.db.query(table).take(10)).length
    return n
  })
}

test('S6 the canned market comes back for a period and writes nothing', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const a = await me.action(api.insightsMarket.market, { period: '1W' })
  expect(a.period).toBe('1W')
  expect(a.markets).toHaveLength(13)
  expect(a.companies).toHaveLength(30)
  expect(a.markets.every((m) => m.move !== null)).toBe(true)
  /* No FRED_API_KEY: the three FRED cards alone are not reached. */
  expect(a.rates.map((r) => [r.id, r.reached])).toEqual([
    ['us-cpi', true],
    ['eu-hicp', true],
    ['fed', false],
    ['ecb', true],
    ['us-jobs', false],
    ['us-2y', false],
  ])
  /* Brazil is a region (30 Oct, MARKET's story). */
  expect(a.regions.map((r) => r.id)).toContain('brazil')
  const q = await me.action(api.insightsMarket.market, { period: '3M' })
  expect(q.period).toBe('3M')
  expect(q.markets[0].move?.change).not.toBe(a.markets[0].move?.change)
  const m = await me.action(api.insightsMarket.market, { period: '1M' })
  expect(m.markets[0].move?.change).not.toBe(a.markets[0].move?.change)
  expect(await rows(t)).toBe(0)
})

test('S3 every source down: each card not reached, nothing written', async () => {
  vi.stubEnv('E2E', '0')
  vi.stubEnv('FRED_API_KEY', 'k')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('down', { status: 503 })),
  )
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const a = await me.action(api.insightsMarket.market, { period: '1D' })
  expect(a.rates.every((r) => !r.reached)).toBe(true)
  expect(a.markets.every((m) => m.move === null)).toBe(true)
  expect(a.capsReached).toBe(false)
  expect(await rows(t)).toBe(0)
})

test('refuses without a user', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  await expect(
    t.action(api.insightsMarket.market, { period: '1D' }),
  ).rejects.toThrow()
})
