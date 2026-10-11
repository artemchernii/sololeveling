/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const NOON = new Date(2026, 9, 11, 12).getTime()
const DAY = 86_400_000
const days = [4, 3, 2, 1].map((n) => new Date(2026, 9, 11 - n).getTime())

/* A trading history against the account's shares (11 Oct): the mock
   history adds up to 20 Apple and 5 Microsoft; the screenshot shows the
   same, or 6 Microsoft. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup(as: 'same' | 'fewer' | null) {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days })
  if (as) await me.mutation(api.e2eUpdate.sharesScreen, { as })
  const batchId = await me.mutation(api.e2e.readHistory, { days })
  const shares = async () => {
    const r = await me.query(api.intake.batchReview, { batchId })
    const s = r.accounts.find((a) => a.shares !== null)?.shares
    if (!s) throw new Error('no shares check')
    return s
  }
  const apply = async () => {
    await me.mutation(api.intake.applyBatch, {
      batchId,
      dayStart: new Date(2026, 9, 11).getTime(),
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    return await t.run(async (ctx) => {
      const out = new Map<string, number>()
      for (const x of await ctx.db.query('trades').collect()) {
        if (x.importId === undefined) continue
        const i = await ctx.db.get(x.instrumentId)
        const k = i?.symbol ?? '?'
        out.set(k, (out.get(k) ?? 0) + 1)
      }
      const intake = (await ctx.db.query('intakes').collect()).find(
        (i) => i.batchId === batchId,
      )
      return { written: Object.fromEntries(out), note: intake?.note ?? '' }
    })
  }
  const say = (key: string, on = true) =>
    me.mutation(api.intake.batchAnswer, {
      batchId,
      answer: { kind: 'sum', key, on },
    })
  return { t, me, batchId, shares, apply, say }
}

test('the same shares in the file and in the account: all of it is saved', async () => {
  const { shares, apply } = await setup('same')
  const s = await shares()
  expect(s.state).toBe('checked')
  expect(s.lines.map((l) => [l.symbol, l.file, l.account, l.same])).toEqual([
    ['AAPL', 20, 20, true],
    ['MSFT', 5, 5, true],
  ])
  expect((await apply()).written).toEqual({ AAPL: 21, MSFT: 10 })
})

test('one company differs: its rows are not saved, the rest are', async () => {
  const { shares, apply } = await setup('fewer')
  const s = await shares()
  expect(s.lines[0]).toMatchObject({
    symbol: 'MSFT',
    file: 5,
    account: 6,
    same: false,
    answer: null,
    rows: 10,
  })
  const done = await apply()
  expect(done.written).toEqual({ AAPL: 21 })
  expect(done.note).toMatch(/Not saved, shares differ from the account: MSFT/)
})

test('"save it anyway" saves it; the two answers replace each other', async () => {
  const { shares, apply, say } = await setup('fewer')
  const s = await shares()
  const n = s.lines[0].n
  await say(`noshares:${s.intakeId}:${n}`)
  expect((await shares()).lines[0].answer).toBe('skip')
  await say(`shares:${s.intakeId}:${n}`)
  expect((await shares()).lines[0].answer).toBe('save')
  expect((await apply()).written).toEqual({ AAPL: 21, MSFT: 10 })
})

test('"do not save it" is taken back with on: false', async () => {
  const { shares, say } = await setup('fewer')
  const s = await shares()
  const key = `noshares:${s.intakeId}:${s.lines[0].n}`
  await say(key)
  await say(key, false)
  expect((await shares()).lines[0].answer).toBeNull()
})

test('no screenshot of the shares: not checked, all of it is saved', async () => {
  const { shares, apply } = await setup(null)
  expect(await shares()).toMatchObject({ state: 'none', lines: [] })
  expect((await apply()).written).toEqual({ AAPL: 21, MSFT: 10 })
})

test('a screenshot from before the file keeps rows for: not checked', async () => {
  const { t, shares } = await setup('fewer')
  await t.run(async (ctx) => {
    for (const h of await ctx.db.query('holdings').collect())
      await ctx.db.patch(h._id, { asOf: NOON - 200 * DAY })
  })
  expect((await shares()).state).toBe('old')
})

test('the mock refuses without E2E', async () => {
  const { me } = await setup(null)
  vi.stubEnv('E2E', '')
  await expect(
    me.mutation(api.e2eUpdate.sharesScreen, { as: 'same' }),
  ).rejects.toThrow()
})
