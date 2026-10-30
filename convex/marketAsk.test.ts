/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import { monthKey } from '../src/lib/marketRead'
import type { Fact } from '../src/lib/marketRead'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const THEM = 'https://clerk.test|user_them'

const fact = (key: string, label: string, value: string): Fact => ({
  key,
  label,
  value,
  tone: null,
})
/* The room's numbers as the canned read names them. */
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
  fact('me-prices', 'Euro area prices, a year', '2.1% · was 2.2%'),
  fact('me-ecb', 'ECB rate', '2.00% · for euro cash'),
]

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

async function setup() {
  vi.useFakeTimers()
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  /* Artem: the deploy key seeded his principles (profiles.ts isOwner). */
  await t.run((ctx) =>
    ctx.db.insert('principles', { ownerId: ME, text: 'P', sortOrder: 0 }),
  )
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: THEM }),
  }
}
const month = () => monthKey(Date.now())

/* The canned backend waits 900 ms so the page shows "asking". */
async function ask(
  who: Awaited<ReturnType<typeof setup>>['me'],
  question: string,
  line?: {
    ticker: string
    part: string
    call: string
    eur: number
    why: string
  },
) {
  const state = { done: false }
  const p = who
    .action(api.ai.ask.ask, { question, facts, ...(line && { line }) })
    .finally(() => (state.done = true))
  /* The first call loads the modules before its timer is set. */
  while (!state.done) await vi.advanceTimersByTimeAsync(300)
  return await p
}

test('S1 a question is answered with the keys given, and its cost added to the month', async () => {
  const { me } = await setup()
  const r = await ask(me, 'Explain my allocation')
  expect(r.ok).toBe(true)
  if (!r.ok) return
  expect(r.answer.kind).toBe('allocation')
  expect(r.answer.factKeys).toEqual(['mine', 'sec-tech'])
  expect(r.stamp).toMatchObject({ searches: 2, cost: 0.08, paidBy: 'api' })
  const state = await me.query(api.marketReads.forMonth, { month: month() })
  expect(state.spent).toBe(0.08)
  /* Nothing of the question is stored: no read row appears. */
  expect(state.read).toBeNull()
})

test('S2 the web is always searched: sources and searches', async () => {
  const { me } = await setup()
  const r = await ask(me, 'What did Powell say?')
  expect(r.ok && r.answer.sources.map((s) => s.site)).toEqual([
    'reuters.com',
    'federalreserve.gov',
  ])
  expect(r.ok && r.stamp.searches).toBe(2)
  expect(
    (await me.query(api.marketReads.forMonth, { month: month() })).spent,
  ).toBe(0.08)
})

test('S7 asked for ideas: tickers not owned, three at most, on the same cap', async () => {
  const { t, me } = await setup()
  await me.mutation(api.marketReads.run, { facts, via: 'api' })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const r = await ask(me, 'Give me more ideas')
  expect(r.ok && r.answer.kind).toBe('ideas')
  /* NEXT's cards are gone (29 Oct): nothing skipped; ZZZZ is dropped on
     screen when the market does not know it. */
  expect(r.ok && r.answer.ideas.map((i) => i.ticker)).toEqual([
    'JNJ',
    'EXV1.DE',
    'ZZZZ',
  ])
  expect(
    (await me.query(api.marketReads.forMonth, { month: month() })).spent,
  ).toBe(0.32)
})

test('S8 asked from an IDEAS line: a chart the app draws and a table', async () => {
  const { me } = await setup()
  const r = await ask(me, 'Should I really add?', {
    ticker: 'AVGO',
    part: 'add',
    call: 'add',
    eur: 2500,
    why: 'Fell on results',
  })
  expect(r.ok && r.answer.charts).toEqual([
    { tickers: ['AVGO', 'NVDA'], range: '6mo' },
  ])
  expect(r.ok && r.answer.tables[0].head).toEqual(['', 'AVGO', 'NVDA'])
})

test('S3 failed: nothing paid, nothing retried', async () => {
  const { me } = await setup()
  await me.mutation(api.e2eMarketRead.arm, { shape: 'fail' })
  expect(await ask(me, 'Is gold still a hedge?')).toEqual({
    ok: false,
    error: 'NOT REACHED',
    cost: 0,
  })
  expect(
    (await me.query(api.marketReads.forMonth, { month: month() })).spent,
  ).toBe(0)
})

test('S4 at the cap a question is refused before any call', async () => {
  const { me } = await setup()
  await me.mutation(api.e2eMarketRead.spend, { usd: 2 })
  expect(await ask(me, 'Anything?')).toEqual({
    ok: false,
    error: 'CAP REACHED',
    cost: 0,
  })
  expect(
    (await me.query(api.marketReads.forMonth, { month: month() })).spent,
  ).toBe(2)
})

test('an empty question, or no key off the test backend, pays nothing', async () => {
  const { me } = await setup()
  expect(await ask(me, '   ')).toMatchObject({
    ok: false,
    error: 'NO QUESTION',
  })
  vi.stubEnv('E2E', '')
  vi.stubEnv('ANTHROPIC_API_KEY', '')
  expect(await ask(me, 'x')).toMatchObject({ ok: false, error: 'NO KEY' })
  expect(
    (await me.query(api.marketReads.forMonth, { month: month() })).spent,
  ).toBe(0)
})

test('only mine: signed out refused; my spend is not theirs', async () => {
  const { t, me, them } = await setup()
  await expect(
    t.action(api.ai.ask.ask, { question: 'x', facts }),
  ).rejects.toThrow()
  await ask(me, 'Explain my allocation')
  expect(
    (await them.query(api.marketReads.forMonth, { month: month() })).spent,
  ).toBe(0)
})
