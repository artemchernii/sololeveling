/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'

/* CLOSE (spec docs/specs/2026-10-22-n3-investment-alerts.md). Vitest runs
   in Lisbon: new Date(y, m, d, h) is his wall clock. */

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const THEM = 'https://clerk.test|user_them'
const at = (d: number, h: number) => new Date(2026, 9, d, h).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(at(22, 21))
})
afterEach(() => vi.useRealTimers())

type Backend = ReturnType<typeof convexTest>

/** 10 shares of a euro share, closes 100 on the 21st and 94 today. */
async function held(t: Backend, ownerId: string) {
  return await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', {
      ownerId,
      name: 'Broker',
      kinds: ['broker'],
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order: 0,
    })
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId,
      symbol: 'ASML.AS',
      name: 'ASML Holding N.V.',
      exchange: 'AMS',
      currency: 'EUR',
      type: 'EQUITY',
    })
    await ctx.db.insert('holdings', {
      ownerId,
      accountId,
      instrumentId,
      shares: 10,
      asOf: at(20, 12),
    })
    for (const [d, price] of [
      [21, 100],
      [22, 94],
    ])
      await ctx.db.insert('prices', {
        ownerId,
        instrumentId,
        price,
        currency: 'EUR',
        asOf: at(d, 17),
        fetchedAt: at(d, 18),
        source: 'Yahoo Finance',
      })
    return instrumentId
  })
}

test('S10 the day: worth now and at the close before, both', async () => {
  const t = convexTest(schema, modules)
  await held(t, ME)
  const day = await t.query(internal.aggregate.dayCloseFor, {
    ownerId: ME,
    since: at(22, 0),
  })
  expect(day.traded).toBe(true)
  expect(day.nowEur).toBe(940)
  expect(day.wasEur).toBe(1000)
  expect(day.rows[0]).toMatchObject({ price: 94, was: 100, symbol: 'ASML.AS' })
})

test('S11 a weekend: no price today → not traded', async () => {
  const t = convexTest(schema, modules)
  await held(t, ME)
  const day = await t.query(internal.aggregate.dayCloseFor, {
    ownerId: ME,
    since: at(23, 0),
  })
  expect(day.traded).toBe(false)
})

test('S6 another owner’s shares never reach mine', async () => {
  const t = convexTest(schema, modules)
  const theirs = await held(t, THEM)
  const day = await t.query(internal.aggregate.dayCloseFor, {
    ownerId: ME,
    since: at(22, 0),
  })
  expect(day.rows).toEqual([])
  expect(
    await t.query(internal.closeReport.shareFacts, {
      ownerId: ME,
      id: theirs,
      now: Date.now(),
    }),
  ).toBeNull()
})

test('S5 one push a day, and one 21:30 job kept', async () => {
  const t = convexTest(schema, modules)
  const words = { title: 'Close · ▼ €60 · 6%', body: 'ASML ▼ 6%' }
  expect(
    await t.mutation(internal.closeReport.send, { ownerId: ME, words }),
  ).toBe(true)
  expect(
    await t.mutation(internal.closeReport.send, { ownerId: ME, words }),
  ).toBe(false)
  const rows = await t.run((ctx) => ctx.db.query('notifications').collect())
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    kind: 'day_close',
    url: '/finances?room=insights#close',
  })
  const jobs = await t.run((ctx) => ctx.db.query('closeJobs').collect())
  expect(jobs).toHaveLength(1)
  expect(jobs[0].at).toBe(at(22, 21) + 30 * 60_000)
})
