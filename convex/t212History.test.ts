/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const HOUR = 3_600_000
const NOON = new Date(2026, 9, 18, 12).getTime()
const DAY_START = new Date(2026, 9, 18).getTime()

/* Trading 212's history (18 Oct, docs/specs/2026-10-18-t212-history.md).
   The account is the mock one of e2eBank.t212, connected; Trading 212 is
   the canned one of t212Api.ts (E2E=1), and e2eBank.answer says what it
   answers next. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

type Word = 'traded' | 'paid' | 'deposit' | 'early' | 'first'

async function connected() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const accountId = await me.mutation(api.e2eBank.t212, {})
  const args = { accountId, dayStart: DAY_START }
  await me.action(api.t212.connect, args)
  const later = async (as: Word) => {
    await me.mutation(api.e2eBank.answer, { as })
    vi.setSystemTime(Date.now() + 5 * HOUR)
    return await me.action(api.t212.check, args)
  }
  const rows = () =>
    t.run(async (ctx) => ({
      trades: await ctx.db
        .query('trades')
        .withIndex('by_owner_account', (q) =>
          q.eq('ownerId', ME).eq('accountId', accountId),
        )
        .collect(),
      logs: await ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q.eq('ownerId', ME).eq('accountId', accountId),
        )
        .collect(),
    }))
  const card = async () =>
    (await me.query(api.bank.links, {})).find((l) => l.accountId === accountId)
  return { t, me, accountId, args, later, rows, card }
}

async function revolut(
  t: ReturnType<typeof convexTest>,
): Promise<Id<'accounts'>> {
  return await t.run(async (ctx) =>
    ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Revolut',
      kinds: ['bank'],
      currencies: ['EUR'],
      domain: 'revolut.com',
      ibanTails: [],
      cardTails: [],
      order: 1,
    }),
  )
}

test('a buy and a sell are saved as trades with no press, the card shows them, not the shares block', async () => {
  const { later, rows, card } = await connected()
  expect(await later('traded')).toBe('checked')
  const { trades } = await rows()
  expect(
    trades
      .filter((t) => t.ref !== undefined)
      .map((t) => [t.side, t.shares, t.priceEur, t.ref]),
  ).toEqual(
    expect.arrayContaining([
      ['buy', 2, 150, 't212:fill:1'],
      ['sell', 1, 640, 't212:fill:2'],
    ]),
  )
  const c = await card()
  expect(c?.changed).toBeNull()
  expect(c?.came).toMatchObject({ rows: 2, had: 0 })
  expect(c?.came?.lines.map((l) => [l.kind, l.name, l.amount])).toEqual([
    ['buy', 'NVIDIA Corporation', -300],
    ['sell', 'ASML Holding N.V.', 640],
  ])
})

test('the same answer again writes nothing, and ✕ closes the block for good', async () => {
  const { me, args, later, rows, card } = await connected()
  await later('traded')
  const once = await rows()
  await later('traded')
  expect(await rows()).toEqual(once)
  expect((await card())?.came?.rows).toBe(2)
  await me.mutation(api.t212.close, { accountId: args.accountId })
  await later('traded')
  expect((await card())?.came).toBeNull()
})

test('a dividend and interest are money in, a fee money out — and the cash is still what Trading 212 says', async () => {
  const { me, accountId, later, rows, card } = await connected()
  await later('paid')
  const { logs } = await rows()
  const got = logs.map((l) => [l.kind, l.value, l.text, l.meta?.ref])
  expect(got).toEqual(
    expect.arrayContaining([
      ['income', 1.38, 'ASML', 't212:div:1'],
      ['income', 2.04, 'Interest', 't212:cash:1'],
      ['expense', 0.45, 'Fee', 't212:cash:2'],
    ]),
  )
  const dividend = logs.find((l) => l.meta?.ref === 't212:div:1')
  expect(dividend?.meta?.shares).toBe(1)
  expect(dividend?.meta?.instrumentId).toBeDefined()
  expect((await card())?.came?.lines.map((l) => l.kind)).toEqual([
    'dividend',
    'interest',
    'fee',
  ])
  /* Rows of before the answer are inside its cash, not added to it. */
  const b = await me.query(api.aggregate.balances, {})
  const here = b.accounts.find((a) => a.accountId === accountId)
  expect(here?.cashEur).toBe(1283.27)
})

test("a deposit pairs with Revolut's move of the same €500, and Revolut's learns where it went", async () => {
  const { t, accountId, later, rows, card } = await connected()
  const revolutId = await revolut(t)
  await later('deposit')
  const { logs } = await rows()
  const move = logs.find((l) => l.meta?.ref === 't212:cash:3')
  expect(move).toMatchObject({ kind: 'move', value: 500 })
  expect(move?.meta?.otherAccountId).toBe(revolutId)
  const side = move?.meta?.pairOf
    ? await t.run((ctx) => ctx.db.get(move.meta!.pairOf!))
    : null
  expect(side).toMatchObject({ accountId: revolutId, value: -500 })
  expect(side?.meta?.otherAccountId).toBe(accountId)
  expect((await card())?.came?.lines[0]).toMatchObject({
    kind: 'transfer',
    name: 'Revolut',
    amount: 500,
    other: { name: 'Revolut', domain: 'revolut.com' },
  })
})

test('a deposit no bank has a row for is a move of its own, saved in no bank', async () => {
  const { later, rows, card } = await connected()
  await later('early')
  const move = (await rows()).logs.find((l) => l.meta?.ref === 't212:cash:3')
  expect(move?.meta?.pairOf).toBeUndefined()
  expect((await card())?.came?.lines[0]).toMatchObject({
    kind: 'transfer',
    name: 'Deposit',
    other: null,
  })
})

test('the first answer reads from the newest file row on: a buy the file had is matched, not written again', async () => {
  const { later, rows, card } = await connected()
  await later('first')
  const { trades } = await rows()
  const file = trades.filter((t) => t.priceEur === 140)
  expect(file).toHaveLength(1)
  expect(file[0].ref).toBe('t212:fill:3')
  expect((await card())?.came).toMatchObject({ rows: 5, had: 1 })
})

test('the opened account lists the same rows as the card, none typed, and a dividend a file had keeps its badge', async () => {
  const { t, me, accountId, later, rows } = await connected()
  await later('paid')
  const page = await me.query(api.sheetRows.page, { accountId, show: 20 })
  const own = page?.rows.filter((r) => r.line !== null) ?? []
  expect(own.map((r) => [r.line?.kind, r.line?.amount, r.logId])).toEqual([
    ['dividend', 1.38, null],
    ['interest', 2.04, null],
    ['fee', -0.45, null],
  ])
  expect(own[0].line).toMatchObject({
    symbol: 'ASML.AS',
    shares: 1,
    each: 1.38,
  })
  /* A file's dividend matched by its id, with no company saved. */
  const div = (await rows()).logs.find((l) => l.meta?.ref === 't212:div:1')!
  await t.run((ctx) =>
    ctx.db.patch(div._id, { meta: { ref: 't212:div:1', merchant: 'ASML' } }),
  )
  const again = await me.query(api.sheetRows.page, { accountId, show: 20 })
  expect(again?.rows.find((r) => r.id === div._id)?.line).toMatchObject({
    kind: 'dividend',
    symbol: null,
  })
  /* Another owner's account answers nothing. */
  const them = t.withIdentity({ tokenIdentifier: 'https://clerk.test|them' })
  expect(await them.query(api.sheetRows.page, { accountId, show: 20 })).toBe(
    null,
  )
})

test('a history call that fails writes nothing at all', async () => {
  const { me, args, rows } = await connected()
  const before = await rows()
  const api212 = await import('./t212Api')
  vi.spyOn(api212, 't212Api').mockReturnValue({
    summary: () =>
      Promise.resolve({ currency: 'EUR', free: 9, inPies: 0, reserved: 0 }),
    positions: () => Promise.resolve([]),
    history: () => Promise.reject(new api212.T212Fail('down')),
  })
  vi.setSystemTime(Date.now() + 5 * HOUR)
  expect(await me.action(api.t212.check, args)).toBe('down')
  expect(await rows()).toEqual(before)
})
