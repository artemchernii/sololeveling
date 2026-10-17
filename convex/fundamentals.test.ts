/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'
import { closes } from './e2eFundamentals'
import { signals, verdict } from '../src/lib/indicators'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 16, 8)

/* A company's fundamentals (16 Oct): read from Yahoo when its page
   opens and the latest is a day old, one reading on its way at a time,
   owner-scoped. The timers are held, so Yahoo is never called here. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup(type = 'EQUITY', ownerId = ME) {
  const t = convexTest(schema, modules)
  const instrumentId = await t.run(
    async (ctx) =>
      await ctx.db.insert('instruments', {
        ownerId,
        symbol: type === 'EQUITY' ? 'AVGO' : 'VUAA.L',
        name: 'Broadcom',
        exchange: 'NMS',
        currency: 'USD',
        type,
      }),
  )
  const jobs = async () =>
    await t.run(
      async (ctx) =>
        await ctx.db.system.query('_scheduled_functions').collect(),
    )
  const reading = (ageDays: number, over: object = {}) =>
    t.run(async (ctx) => {
      await ctx.db.insert('fundamentals', {
        ownerId,
        instrumentId,
        asOf: NOW - ageDays * DAY,
        source: 'Yahoo Finance',
        industry: 'Semiconductors',
        target: { mean: 412.5, low: 310, high: 500, count: 41 },
        ...over,
      })
    })
  return {
    t,
    instrumentId,
    jobs,
    reading,
    me: t.withIdentity({ tokenIdentifier: ME }),
    other: t.withIdentity({ tokenIdentifier: OTHER }),
  }
}

test('a share with no reading asks Yahoo once, however often it opens', async () => {
  const { me, instrumentId, jobs } = await setup()
  expect(await me.mutation(api.fundamentals.refresh, { instrumentId })).toBe(
    'reading',
  )
  expect(await me.mutation(api.fundamentals.refresh, { instrumentId })).toBe(
    'reading',
  )
  const js = await jobs()
  expect(js).toHaveLength(1)
  expect(js[0].name).toMatch(/fundamentals(\.js)?:read$/)
})

test('a reading younger than a day is left alone; a day old is read again', async () => {
  const { me, instrumentId, jobs, reading } = await setup()
  await reading(0.5)
  expect(await me.mutation(api.fundamentals.refresh, { instrumentId })).toBe(
    'fresh',
  )
  expect(await jobs()).toHaveLength(0)
  await reading(1.5)
  vi.setSystemTime(NOW + 0.6 * DAY)
  expect(await me.mutation(api.fundamentals.refresh, { instrumentId })).toBe(
    'reading',
  )
})

test('a fund has no fundamentals and asks nothing', async () => {
  const { me, instrumentId, jobs } = await setup('ETF')
  expect(await me.mutation(api.fundamentals.refresh, { instrumentId })).toBe(
    'nothing',
  )
  expect(await jobs()).toHaveLength(0)
})

test("another user's share is refused and its reading never shown", async () => {
  const { other, instrumentId, reading } = await setup()
  await reading(1)
  await expect(
    other.mutation(api.fundamentals.refresh, { instrumentId }),
  ).rejects.toThrow(/No such share/)
  expect(
    await other.query(api.fundamentals.latest, { instrumentId }),
  ).toBeNull()
})

test('the latest reading comes with its sector and market P/E', async () => {
  const { t, me, instrumentId, reading } = await setup()
  expect(await me.query(api.fundamentals.latest, { instrumentId })).toBeNull()
  await reading(3, { target: { mean: 300, low: 1, high: 2, count: 3 } })
  await reading(1)
  const rows = [
    { industry: 'Semiconductor', firms: 66, forwardPe: 37.29 },
    { industry: 'Total Market', firms: 5994, forwardPe: 27.66 },
  ]
  await t.mutation(internal.fundamentals.storeSectors, {
    ownerId: ME,
    year: 2026,
    rows,
  })
  /* A second time the same year stores nothing. */
  await t.mutation(internal.fundamentals.storeSectors, {
    ownerId: ME,
    year: 2026,
    rows,
  })
  const got = await me.query(api.fundamentals.latest, { instrumentId })
  expect(got?.reading.asOf).toBe(NOW - DAY)
  expect(got?.reading.target?.mean).toBe(412.5)
  expect(got?.sector).toMatchObject({
    industry: 'Semiconductor',
    forwardPe: 37.29,
    year: 2026,
  })
  expect(got?.market).toMatchObject({
    industry: 'Total Market',
    forwardPe: 27.66,
  })
  expect(
    await t.run(
      async (ctx) => (await ctx.db.query('sectorAverages').collect()).length,
    ),
  ).toBe(2)
})

test('a stored reading says when the sector averages want reading', async () => {
  const { t, instrumentId } = await setup()
  const store = () =>
    t.mutation(internal.fundamentals.store, {
      ownerId: ME,
      instrumentId,
      reading: { asOf: NOW, source: 'Yahoo Finance' },
    })
  expect(await store()).toBe(true)
  await t.mutation(internal.fundamentals.storeSectors, {
    ownerId: ME,
    year: 2026,
    rows: [{ industry: 'Total Market', firms: 1, forwardPe: 20 }],
  })
  expect(await store()).toBe(false)
})

test('the canned re-read runs only on the test backend', async () => {
  const { t, instrumentId, reading } = await setup()
  await reading(2)
  await t.mutation(internal.fundamentals.readCanned, { instrumentId })
  expect(
    await t.run(
      async (ctx) => (await ctx.db.query('fundamentals').collect()).length,
    ),
  ).toBe(1)
  vi.stubEnv('E2E', '1')
  await t.mutation(internal.fundamentals.readCanned, { instrumentId })
  const all = await t.run(
    async (ctx) => await ctx.db.query('fundamentals').collect(),
  )
  expect(all.map((r) => r.asOf)).toEqual([NOW - 2 * DAY, NOW])
})

test('the test share refuses to run off the test backend', async () => {
  const { me } = await setup()
  await expect(
    me.mutation(api.e2eFundamentals.share, { shape: 'add' }),
  ).rejects.toThrow(/test backend/)
})

test("the test shapes give the lines' ADD, HOLD and WAIT", () => {
  const call = (shape: 'add' | 'hold' | 'wait') => {
    const pts = closes(shape).map((v, i) => ({ t: i * DAY, v }))
    return verdict(signals(pts, null))?.call
  }
  expect(closes('add').at(-1)).toBe(343.86)
  expect(call('add')).toBe('add')
  expect(call('hold')).toBe('hold')
  expect(call('wait')).toBe('wait')
})
