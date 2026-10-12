/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const NOON = new Date(2026, 9, 11, 12).getTime()
const DAY_START = new Date(2026, 9, 11).getTime()

/* The whole path a dropped file takes — review, answer, apply — for a
   transfer matched before saving (12 Oct), on the canned readings of his
   rows of 3–6 Oct. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup(as: 'added' | 'fee' | 'drop') {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days: [] })
  const batchId = await me.mutation(api.e2eTransfer.read, { as })
  const review = async (name: string) => {
    const r = await me.query(api.intake.batchReview, { batchId })
    const accounts = await t.run((ctx) => ctx.db.query('accounts').collect())
    const id = accounts.find((a) => a.name === name)?._id
    const block = r.accounts.find((a) => a.accountId === id)
    if (!block || !id) throw new Error(`no ${name}`)
    return { r, block, id }
  }
  const say = (key: string, on = true) =>
    me.mutation(api.intake.batchAnswer, {
      batchId,
      answer: { kind: 'sum', key, on },
    })
  const apply = async () => {
    await me.mutation(api.intake.applyBatch, { batchId, dayStart: DAY_START })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
  }
  const rows = (accountId: string, cents: number) =>
    t.run(async (ctx) =>
      (await ctx.db.query('logs').collect()).filter(
        (l) =>
          l.accountId === accountId &&
          Math.round(Math.abs(l.value ?? 0) * 100) === cents,
      ),
    )
  return { t, me, review, say, apply, rows }
}

test('it runs only on the test backend, signed in', async () => {
  const t = convexTest(schema, modules)
  await expect(t.mutation(api.e2eTransfer.read, { as: 'fee' })).rejects.toThrow(
    'Not signed in',
  )
  vi.unstubAllEnvs()
  await expect(
    t
      .withIdentity({ tokenIdentifier: ME })
      .mutation(api.e2eTransfer.read, { as: 'fee' }),
  ).rejects.toThrow('E2E functions run only on the test backend.')
})

test("his €700 top-up, booked by ActivoBank three days after Revolut's file wrote it: already added, the sum is right, and it is saved once", async () => {
  const { review, apply, rows } = await setup('added')
  const { block, id } = await review('ActivoBank')
  expect(block.transfers).toMatchObject([
    { state: 'sure', amount: -700, sides: [{ here: true, fee: 0 }] },
  ])
  expect(block.held).toBe(false)
  expect(block.check).toMatchObject({ state: 'ok', out: 62.86, now: 90.35 })
  await apply()
  expect((await rows(id, 70000)).map((l) => l.text)).toEqual([
    'Top-up by *2789',
  ])
})

test('€500.63 arrived of €505.20: not saved until answered; "same transfer" saves one side and the fee', async () => {
  const { review, say, apply, rows } = await setup('fee')
  const first = await review('Trade Republic')
  const [found] = first.block.transfers
  expect(found).toMatchObject({
    state: 'ask',
    amount: 500.63,
    sides: [{ here: false, fee: 4.57, amount: -505.2, stored: true }],
  })
  expect(first.block.held).toBe(true)
  /* Applied unanswered, nothing of the account is written. */
  const same = `same:${found.key}:${found.sides[0].id}`
  await say(same)
  const answered = await review('Trade Republic')
  expect(answered.block.held).toBe(false)
  expect(answered.block.transfers[0].state).toBe('same')
  expect(answered.block.check).toMatchObject({
    state: 'ok',
    out: 4.57,
    in: 505.2,
    now: 513.03,
  })
  /* "not this one" replaces it, and back. */
  await say(`apart:${found.key}`)
  expect((await review('Trade Republic')).block.transfers[0].state).toBe(
    'apart',
  )
  await say(same)

  await apply()
  const tr = first.id
  expect((await rows(tr, 50520)).map((l) => [l.kind, l.value])).toEqual([
    ['move', 505.2],
  ])
  expect((await rows(tr, 457)).map((l) => [l.kind, l.meta?.category])).toEqual([
    ['expense', 'fees'],
  ])
  expect(await rows(tr, 50063)).toEqual([])
})

test('unanswered, the account is not written; "not this one" saves the row as the file shows', async () => {
  const { review, say, apply, rows } = await setup('fee')
  const { block, id } = await review('Trade Republic')
  await apply()
  expect(await rows(id, 50063)).toEqual([])
  expect(await rows(id, 50520)).toEqual([])
  /* Answered, a second apply saves it as the file shows. */
  await say(`apart:${block.transfers[0].key}`)
  await apply()
  expect((await rows(id, 50063)).map((l) => l.value)).toEqual([500.63])
  expect(await rows(id, 457)).toEqual([])
})

test('both files in one drop: one transfer, one row in each account', async () => {
  const { review, apply, rows } = await setup('drop')
  const a = await review('ActivoBank')
  const r = await review('Revolut')
  expect(a.block.transfers).toMatchObject([{ state: 'sure', amount: -700 }])
  expect(r.block.transfers).toMatchObject([{ state: 'sure', amount: 700 }])
  expect(a.block.held || r.block.held).toBe(false)
  expect(a.r.asks).toEqual([])
  await apply()
  const out = await rows(a.id, 70000)
  const into = await rows(r.id, 70000)
  expect(out.map((l) => [l.kind, l.value])).toEqual([['move', -700]])
  expect(into.map((l) => [l.kind, l.value])).toEqual([['move', 700]])
  expect(into[0].meta?.pairOf).toBe(out[0]._id)
})

test('a key that is not an answer is refused', async () => {
  const { say } = await setup('fee')
  await expect(say('pair:abc:1:def')).rejects.toThrow('No such answer.')
})
