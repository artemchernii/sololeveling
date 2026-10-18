/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const NOW = Date.UTC(2026, 9, 14, 20)

/* A thing's sector badge (14 Oct): read once, stored with its source.
   The timers are held, so Yahoo is never called here. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOW })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup(
  over: {
    ownerId?: string
    name?: string
    type?: string
    symbol?: string
  } = {},
) {
  const t = convexTest(schema, modules)
  const instrumentId = await t.run(
    async (ctx) =>
      await ctx.db.insert('instruments', {
        ownerId: over.ownerId ?? ME,
        symbol: over.symbol ?? 'VDPG.L',
        name: over.name ?? 'Vanguard FTSE Developed Asia Pacific ex Japan',
        exchange: 'LSE',
        currency: 'EUR',
        type: over.type ?? 'ETF',
      }),
  )
  const jobs = async () =>
    await t.run(
      async (ctx) =>
        await ctx.db.system.query('_scheduled_functions').collect(),
    )
  return { t, instrumentId, me: t.withIdentity({ tokenIdentifier: ME }), jobs }
}

test("a fund's sector comes from its name, stored once with its source", async () => {
  const { me, instrumentId, jobs } = await setup()
  expect(await me.mutation(api.sector.ask, { instrumentId })).toBe('fresh')
  expect(await me.query(api.sector.of, { instrumentId })).toEqual({
    sector: 'asia pacific',
    from: 'name',
    readAt: NOW,
  })
  expect(await jobs()).toHaveLength(0)
  /* Asked again: nothing is read or written twice. */
  vi.setSystemTime(NOW + 60_000)
  expect(await me.mutation(api.sector.ask, { instrumentId })).toBe('fresh')
  expect((await me.query(api.sector.of, { instrumentId }))?.readAt).toBe(NOW)
})

test('a name with nothing in it is marked read, with no badge', async () => {
  const { me, instrumentId } = await setup({
    name: 'Vanguard LifeStrategy 80% Equity',
  })
  await me.mutation(api.sector.ask, { instrumentId })
  expect(await me.query(api.sector.of, { instrumentId })).toEqual({
    sector: undefined,
    from: undefined,
    readAt: NOW,
  })
})

test("a share asks Yahoo once, that share alone; its answer is stored as Yahoo's", async () => {
  const { t, me, instrumentId, jobs } = await setup({
    symbol: 'MSFT',
    name: 'Microsoft Corporation',
    type: 'EQUITY',
  })
  expect(await me.mutation(api.sector.ask, { instrumentId })).toBe('reading')
  const j = await jobs()
  expect(j).toHaveLength(1)
  expect(j[0].args).toEqual([{ instrumentId }])
  await t.mutation(internal.sector.store, { instrumentId, sector: 'tech' })
  expect(await me.query(api.sector.of, { instrumentId })).toEqual({
    sector: 'tech',
    from: 'yahoo',
    readAt: NOW,
  })
  expect(await me.mutation(api.sector.ask, { instrumentId })).toBe('fresh')
})

test('the test backend never asks Yahoo', async () => {
  vi.stubEnv('E2E', '1')
  const { me, instrumentId, jobs } = await setup({ type: 'EQUITY' })
  expect(await me.mutation(api.sector.ask, { instrumentId })).toBe('fresh')
  expect(await jobs()).toHaveLength(0)
})

test("another user's instrument is refused and never shown", async () => {
  const { me, instrumentId, t } = await setup({ ownerId: OTHER })
  await expect(me.mutation(api.sector.ask, { instrumentId })).rejects.toThrow(
    'No such share',
  )
  expect(await me.query(api.sector.of, { instrumentId })).toBeNull()
  const inst = await t.run(async (ctx) => await ctx.db.get(instrumentId))
  expect(inst?.sectorReadAt).toBeUndefined()
})

test('signed out is refused', async () => {
  const { t, instrumentId } = await setup()
  await expect(t.mutation(api.sector.ask, { instrumentId })).rejects.toThrow()
})

/* Tags on Portfolio (18 Oct): what is missing is read once, on open. */
test('askAll: a share asks Yahoo once for its profile; the country is stored', async () => {
  const { t, me, instrumentId, jobs } = await setup({
    symbol: 'ASML',
    name: 'ASML Holding',
    type: 'EQUITY',
  })
  expect(await me.mutation(api.sector.askAll, { ids: [instrumentId] })).toBe(1)
  expect(await jobs()).toHaveLength(1)
  await t.mutation(internal.sector.storeProfile, {
    instrumentId,
    sector: 'tech',
    country: 'Netherlands',
  })
  expect(await me.query(api.sector.tags, { ids: [instrumentId] })).toEqual([
    { instrumentId, sector: 'tech', country: 'Netherlands' },
  ])
  /* Asked again: read already, nothing goes out. */
  expect(await me.mutation(api.sector.askAll, { ids: [instrumentId] })).toBe(0)
  expect(await jobs()).toHaveLength(1)
})

test("askAll: a fund's sector from its name, no Yahoo", async () => {
  const { me, instrumentId, jobs } = await setup()
  expect(await me.mutation(api.sector.askAll, { ids: [instrumentId] })).toBe(0)
  expect(await jobs()).toHaveLength(0)
  expect(await me.query(api.sector.tags, { ids: [instrumentId] })).toEqual([
    { instrumentId, sector: 'asia pacific', country: undefined },
  ])
})

test('askAll: no Yahoo on the test backend; nothing of another user', async () => {
  vi.stubEnv('E2E', '1')
  const mine = await setup({ type: 'EQUITY' })
  expect(
    await mine.me.mutation(api.sector.askAll, { ids: [mine.instrumentId] }),
  ).toBe(0)
  expect(await mine.jobs()).toHaveLength(0)
  const other = await setup({ ownerId: OTHER })
  expect(
    await other.me.mutation(api.sector.askAll, { ids: [other.instrumentId] }),
  ).toBe(0)
  expect(
    await other.me.query(api.sector.tags, { ids: [other.instrumentId] }),
  ).toEqual([])
  await expect(
    other.t.query(api.sector.tags, { ids: [other.instrumentId] }),
  ).rejects.toThrow()
})
