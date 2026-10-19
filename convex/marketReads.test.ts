/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'
import { monthKey } from '../src/lib/marketRead'
import type { Fact } from '../src/lib/marketRead'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const THEM = 'https://clerk.test|user_them'

/* The room's numbers as the canned reads name them. */
const fact = (key: string, label: string, value: string): Fact => ({
  key,
  label,
  value,
  tone: null,
})
const facts = [
  fact('us-cpi', 'US CPI SEP', '2.9%'),
  fact('us-cpi-was', 'US CPI AUG', '3.1%'),
  fact('eu-hicp', 'EURO CPI SEP', '2.1%'),
  fact('ecb', 'ECB', '2.00% · SINCE 11 SEP'),
  fact('ecb-next', 'NEXT ECB', '29 OCT'),
  fact('mkt-sp500', 'S&P 500', '▲ 2.4% · 1M'),
  fact('mkt-btc', 'BITCOIN', '▼ 4.1% · 1M'),
  fact('sec-tech', 'TECH', '▲ 5.8% · 1M'),
  fact('co-NVDA', 'NVDA', '▲ 8.1% · 1M'),
  fact('co-AVGO', 'AVGO', '▲ 7.4% · 1M'),
  fact('mine', 'MINE', '€820 · 1 POSITION'),
  fact('pos-AVGO', 'AVGO', '€820 · 100.0%'),
]

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

function setup() {
  vi.useFakeTimers()
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: THEM }),
  }
}
const month = () => monthKey(Date.now())

test('S1 a press stores the facts, reads, and adds the cost to the month', async () => {
  const { t, me } = setup()
  await me.mutation(api.marketReads.run, { facts, via: 'api' })
  let state = await me.query(api.marketReads.forMonth, { month: month() })
  expect(state.read?.status).toBe('reading')
  expect(state.read?.facts).toHaveLength(facts.length)

  await t.finishAllScheduledFunctions(vi.runAllTimers)
  state = await me.query(api.marketReads.forMonth, { month: month() })
  expect(state.read?.status).toBe('done')
  expect(state.read?.read?.lead).toBe('Rates falling')
  expect(state.read?.read?.lines).toHaveLength(4)
  expect(state.read?.stamp?.paidBy).toBe('api')
  expect(state.spent).toBe(0.24)
  expect(state.cap).toBe(2)
})

test('S6 a line naming a fact key not given is refused; the rest stands', async () => {
  const { t, me } = setup()
  await me.mutation(api.e2eMarketRead.arm, { shape: 'broken' })
  await me.mutation(api.marketReads.run, { facts, via: 'api' })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const { read } = await me.query(api.marketReads.forMonth, { month: month() })
  expect(read?.status).toBe('done')
  expect(read?.read?.lines).toHaveLength(3)
  expect(read?.read?.lines.some((l) => l.factKeys.includes('mkt-moon'))).toBe(
    false,
  )
})

test('S6 on the Pro path too: an answer naming only unknown keys fails, nothing paid', async () => {
  const { me } = setup()
  const readId = await me.mutation(api.marketReads.run, { facts, via: 'pro' })
  const line = (k: string) => ({
    kind: 'market',
    tone: 'calm',
    badge: 'X',
    title: 'x',
    line: 'x',
    factKeys: [k],
    plain: 'x',
  })
  await me.mutation(api.marketReads.finishPro, {
    readId,
    raw: JSON.stringify({ lines: [line('a'), line('b'), line('c')] }),
    model: 'claude-sonnet-5-5',
    inputTokens: 1,
    outputTokens: 1,
    searches: 0,
  })
  const state = await me.query(api.marketReads.forMonth, { month: month() })
  expect(state.read?.status).toBe('failed')
  expect(state.read?.error).toBe('TOO FEW LINES')
  expect(state.spent).toBe(0)
})

test('S7 spend adds up per response and stops at $2', async () => {
  const { t, me } = setup()
  const readId = await me.mutation(api.marketReads.run, { facts, via: 'api' })
  /* A response that came back unusable still cost what it cost. */
  await t.mutation(internal.marketReads.fail, {
    readId,
    error: 'BROKEN SHAPE',
    cost: 0.9,
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  await me.mutation(api.marketReads.run, { facts, via: 'api' })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(
    (await me.query(api.marketReads.forMonth, { month: month() })).spent,
  ).toBe(1.14)

  await me.mutation(api.e2eMarketRead.spend, { usd: 2 })
  await expect(
    me.mutation(api.marketReads.run, { facts, via: 'api' }),
  ).rejects.toThrow('CAP_REACHED')
  /* His Pro plan is not counted against the cap. */
  await expect(
    me.mutation(api.marketReads.run, { facts, via: 'pro' }),
  ).resolves.toBeDefined()
})

test('S3 a failed read keeps the read before it, and nothing is paid', async () => {
  const { t, me } = setup()
  await me.mutation(api.marketReads.run, { facts, via: 'api' })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  await me.mutation(api.e2eMarketRead.arm, { shape: 'fail' })
  await me.mutation(api.marketReads.run, { facts, via: 'api' })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const state = await me.query(api.marketReads.forMonth, { month: month() })
  expect(state.read?.status).toBe('failed')
  expect(state.read?.read?.lead).toBe('Rates falling')
  expect(state.spent).toBe(0.24)
})

test('a second press while reading pays once', async () => {
  const { t, me } = setup()
  const a = await me.mutation(api.marketReads.run, { facts, via: 'api' })
  const b = await me.mutation(api.marketReads.run, { facts, via: 'api' })
  expect(b).toBe(a)
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(
    (await me.query(api.marketReads.forMonth, { month: month() })).spent,
  ).toBe(0.24)
})

test('without the key, off the test backend, it fails and pays nothing', async () => {
  const { t, me } = setup()
  vi.stubEnv('E2E', '')
  vi.stubEnv('ANTHROPIC_API_KEY', '')
  await me.mutation(api.marketReads.run, { facts, via: 'api' })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const state = await me.query(api.marketReads.forMonth, { month: month() })
  expect(state.read?.status).toBe('failed')
  expect(state.spent).toBe(0)
})

test('only mine: signed out refused, another person sees and finishes nothing', async () => {
  const { t, me, them } = setup()
  await expect(
    t.mutation(api.marketReads.run, { facts, via: 'api' }),
  ).rejects.toThrow()
  const readId = await me.mutation(api.marketReads.run, { facts, via: 'pro' })
  expect(
    (await them.query(api.marketReads.forMonth, { month: month() })).read,
  ).toBeNull()
  await expect(
    them.mutation(api.marketReads.failPro, { readId, error: 'x' }),
  ).rejects.toThrow('NOT_FOUND')
})

test('the test helpers refuse off the test backend', async () => {
  const { me } = setup()
  vi.stubEnv('E2E', '')
  await expect(
    me.mutation(api.e2eMarketRead.arm, { shape: 'calm' }),
  ).rejects.toThrow()
  await expect(me.mutation(api.e2eMarketRead.spend, { usd: 1 })).rejects.toThrow()
})
