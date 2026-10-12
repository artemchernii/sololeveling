/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const NOON = new Date(2026, 9, 11, 12).getTime()
const dayStart = new Date(2026, 9, 11).getTime()
const days = [4, 3, 2, 1].map((n) => new Date(2026, 9, 11 - n).getTime())

/* A broker screenshot against the total it prints (11 Oct): Trade
   Republic's 20 positions and cash reach €25,125.78; with the last one
   under the edge of the screen they do not. */
/* An apply of twenty positions is twenty steps. */
vi.setConfig({ testTimeout: 20_000 })
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup(as: 'same' | 'cut' | 'none' | 'two') {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days })
  const batchId = await me.mutation(api.e2eHoldingsTotal.screens, { as })
  const blocks = async () =>
    (await me.query(api.intake.batchReview, { batchId })).accounts
  const block = async (positions: number) => {
    const a = (await blocks()).find((x) => x.holdings?.positions === positions)
    if (!a?.holdings || !a.accountId) throw new Error('no such screenshot')
    return { ...a, holdings: a.holdings, accountId: a.accountId }
  }
  const apply = async () => {
    await me.mutation(api.intake.applyBatch, { batchId, dayStart })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    return await t.run(async (ctx) => {
      const out = new Map<string, number>()
      for (const h of await ctx.db.query('holdings').collect()) {
        const a = await ctx.db.get(h.accountId)
        out.set(a?.name ?? '?', (out.get(a?.name ?? '?') ?? 0) + 1)
      }
      return Object.fromEntries(out)
    })
  }
  const say = (key: string, on = true) =>
    me.mutation(api.intake.batchAnswer, {
      batchId,
      answer: { kind: 'sum', key, on },
    })
  return { t, me, batchId, block, apply, say }
}

test('the positions and the cash reach the total: saved, nothing asked', async () => {
  const { block, apply } = await setup('same')
  const a = await block(20)
  expect(a.held).toBe(false)
  expect(a.holdings.total).toMatchObject({
    state: 'same',
    positionsEur: 23920.12,
    cashEur: 1205.66,
    bothEur: 25125.78,
    totalEur: 25125.78,
    answer: null,
  })
  expect(await apply()).toEqual({ 'Trade Republic': 20 })
})

test('a position was not read: apply writes nothing of that account', async () => {
  const { block, apply } = await setup('cut')
  const a = await block(19)
  expect(a.held).toBe(true)
  expect(a.holdings.total).toMatchObject({
    state: 'differs',
    bothEur: 24727.26,
    totalEur: 25125.78,
    answer: null,
  })
  expect(await apply()).toEqual({})
})

test('"save it anyway" saves it as the screenshot shows', async () => {
  const { block, apply, say } = await setup('cut')
  const a = await block(19)
  await say(`total:${a.accountId}`)
  const b = await block(19)
  expect(b.held).toBe(false)
  expect(b.holdings.total.answer).toBe('save')
  expect(await apply()).toEqual({ 'Trade Republic': 19 })
})

test('"do not save" replaces "save it anyway", and is taken back', async () => {
  const { block, apply, say } = await setup('cut')
  const { accountId } = await block(19)
  await say(`total:${accountId}`)
  await say(`nototal:${accountId}`)
  const a = await block(19)
  expect(a.holdings.total.answer).toBe('skip')
  expect(a.held).toBe(true)
  await say(`nototal:${accountId}`, false)
  expect((await block(19)).holdings.total.answer).toBeNull()
  await say(`nototal:${accountId}`)
  expect(await apply()).toEqual({})
})

test('no total on the screenshot: not checked, saved', async () => {
  const { block, apply } = await setup('none')
  const a = await block(20)
  expect(a.held).toBe(false)
  expect(a.holdings.total).toMatchObject({ state: 'none', totalEur: null })
  expect(await apply()).toEqual({ 'Trade Republic': 20 })
})

test('two accounts in one drop: the one that adds up is saved, the other is not', async () => {
  const { block, apply } = await setup('two')
  expect((await block(2)).holdings.total.state).toBe('same')
  expect((await block(2)).held).toBe(false)
  expect((await block(19)).held).toBe(true)
  expect(await apply()).toEqual({ Revolut: 2 })
})

/* 3 Oct, his Trading 212: the list of six ETFs prints €2,014, the
   summary screen €15,008 with the cash. Together they add up; the list
   alone does too, as a total without the cash. */
test('a list with its own total and a summary with the account total', async () => {
  const { t, me, batchId, block } = await setup('none')
  await t.run(async (ctx) => {
    const all = await ctx.db.query('intakes').collect()
    const list = all.find((i) => i.batchId === batchId)
    if (!list?.positions) throw new Error('no screenshot')
    const six = list.positions
      .slice(0, 6)
      .map((p, i) => ({ ...p, valueEur: [500, 400, 350, 300, 264, 200][i] }))
    await ctx.db.patch(list._id, {
      positions: six,
      cashEur: undefined,
      totalEur: 2014,
    })
    await ctx.db.insert('intakes', {
      ownerId: list.ownerId,
      batchId,
      accountId: list.accountId,
      storageIds: [],
      status: 'ready',
      kind: 'holdings',
      title: 'summary',
      readAt: NOON + 1000,
      positions: [],
      cashEur: 12994,
      totalEur: 15008,
    })
  })
  expect((await block(6)).holdings.total).toMatchObject({
    state: 'same',
    bothEur: 15008,
    totalEur: 15008,
    withoutCash: false,
  })
  await t.run(async (ctx) => {
    const sum = (await ctx.db.query('intakes').collect()).find(
      (i) => i.title === 'summary',
    )
    if (sum) await ctx.db.patch(sum._id, { totalEur: 2014 })
  })
  expect((await block(6)).holdings.total).toMatchObject({
    state: 'same',
    withoutCash: true,
  })
  void me
})

test('the positions screen refuses one that differs without "anyway"', async () => {
  const { t, me, block } = await setup('cut')
  const a = await block(19)
  const intake = await t.run(async (ctx) =>
    (await ctx.db.query('intakes').collect()).find(
      (i) => i.accountId === a.accountId,
    ),
  )
  if (!intake?.positions) throw new Error('no screenshot')
  const args = {
    intakeId: intake._id,
    accountId: a.accountId,
    asOf: NOON,
    dayStart,
    rows: intake.positions.map((p) => ({
      candidate: p.candidates[0],
      shares: p.shares ?? 1,
    })),
    cashEur: 1205.66,
  }
  await expect(me.mutation(api.intake.confirmHoldings, args)).rejects.toThrow(
    /do not reach the total/,
  )
  /* Unticking a row does not make it right; "anyway" saves it. */
  await expect(
    me.mutation(api.intake.confirmHoldings, { ...args, kept: [0, 1] }),
  ).rejects.toThrow(/do not reach the total/)
  const done = await me.mutation(api.intake.confirmHoldings, {
    ...args,
    anyway: true,
  })
  expect(done.positions).toBe(19)
})

test('another owner cannot answer, and the mock refuses outside tests', async () => {
  const { t, batchId, block, me } = await setup('cut')
  const { accountId } = await block(19)
  const other = t.withIdentity({ tokenIdentifier: 'https://clerk.test|other' })
  await expect(
    other.mutation(api.intake.batchAnswer, {
      batchId,
      answer: { kind: 'sum', key: `total:${accountId}`, on: true },
    }),
  ).rejects.toThrow()
  vi.stubEnv('E2E', '')
  await expect(
    me.mutation(api.e2eHoldingsTotal.screens, { as: 'same' }),
  ).rejects.toThrow()
})
