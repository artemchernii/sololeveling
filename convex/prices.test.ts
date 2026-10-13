/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import { FRESH_FOR } from './prices'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const NOON = new Date(2026, 9, 13, 12).getTime()

/* Prices are read again only when Finances asks and the last reading is
   half an hour old (13 Oct). The timers are held, so the reading itself —
   a call to Yahoo — never runs here. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup(fetchedAt: number | null, ownerId = ME) {
  const t = convexTest(schema, modules)
  await t.run(async (ctx) => {
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId,
      symbol: 'AAPL',
      name: 'Apple Inc.',
      exchange: 'NMS',
      currency: 'USD',
      type: 'EQUITY',
    })
    if (fetchedAt !== null)
      await ctx.db.insert('prices', {
        ownerId,
        instrumentId,
        price: 200,
        currency: 'USD',
        asOf: fetchedAt,
        fetchedAt,
        source: 'Yahoo Finance',
      })
  })
  const asked = async () =>
    await t.run(
      async (ctx) =>
        await ctx.db.system.query('_scheduled_functions').collect(),
    )
  return { t, me: t.withIdentity({ tokenIdentifier: ME }), asked }
}

test('a reading half an hour old is read again, once asked', async () => {
  const { me, asked } = await setup(NOON - FRESH_FOR)
  expect(await me.mutation(api.prices.refresh, {})).toBe('reading')
  const jobs = await asked()
  expect(jobs).toHaveLength(1)
  expect(jobs[0].args).toEqual([{ pricesOnly: true, ownerId: ME }])
})

test('asked twice before the first prices land: one reading, not two', async () => {
  const { me, asked } = await setup(NOON - FRESH_FOR)
  expect(await me.mutation(api.prices.refresh, {})).toBe('reading')
  expect(await me.mutation(api.prices.refresh, {})).toBe('reading')
  expect(await asked()).toHaveLength(1)
})

test('a ticker never priced is read', async () => {
  const { me, asked } = await setup(null)
  expect(await me.mutation(api.prices.refresh, {})).toBe('reading')
  expect(await asked()).toHaveLength(1)
})

test('a younger reading is left alone', async () => {
  const { me, asked } = await setup(NOON - FRESH_FOR + 60_000)
  expect(await me.mutation(api.prices.refresh, {})).toBe('fresh')
  expect(await asked()).toHaveLength(0)
})

test("nothing owned asks for nothing — another owner's ticker is not mine", async () => {
  const { me, asked } = await setup(null, OTHER)
  expect(await me.mutation(api.prices.refresh, {})).toBe('nothing')
  expect(await asked()).toHaveLength(0)
})

test('refused without a sign-in', async () => {
  const { t } = await setup(null)
  await expect(t.mutation(api.prices.refresh, {})).rejects.toThrow()
})

test("the test backend never reads: its prices are the mock's", async () => {
  vi.stubEnv('E2E', '1')
  const { me, asked } = await setup(null)
  expect(await me.mutation(api.prices.refresh, {})).toBe('fresh')
  expect(await asked()).toHaveLength(0)
})
