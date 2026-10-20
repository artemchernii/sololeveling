/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const DAY = 86_400_000
const NOON = new Date(2026, 9, 11, 12).getTime()
const DAY_START = new Date(2026, 9, 11).getTime()
/* The next evening: the bank has booked rows since the balance held. */
const NEXT = NOON + DAY + 8 * 3_600_000

/* A connected bank, slice 2 (11 Oct): the bank's rows through the check.
   The account is connected through the canned bank of bankApi.ts (E2E=1,
   €727.49 booked, no rows); what the bank answers next is handed to
   `arrive` as the bank would send it. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

const out = (day: string, amount: string, words: string, status = 'BOOK') => ({
  status,
  amount,
  currency: 'EUR',
  indicator: 'DBIT',
  bookingDate: day,
  remittance: [words],
})

/* Pending as Revolut sends it: only the day the card was used. */
const held = (day: string, amount: string, words: string) => ({
  status: 'PDNG',
  amount,
  currency: 'EUR',
  indicator: 'DBIT',
  transactionDate: day,
  remittance: [words],
})

async function connected() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  const accountId = await me.mutation(api.accounts.create, {
    name: 'ActivoBank',
    kinds: ['bank'],
    currencies: ['EUR'],
    product: 'activo',
  })
  const url = await me.action(api.bank.connect, { accountId })
  const state = new URL(url, 'http://app').searchParams.get('state') as string
  await me.action(api.bank.finish, { code: 'one', state, dayStart: DAY_START })
  const rows = () =>
    t.run(async (ctx) =>
      (
        await ctx.db
          .query('logs')
          .withIndex('by_owner_account_time', (q) =>
            q.eq('ownerId', ME).eq('accountId', accountId),
          )
          .collect()
      ).map((l) => ({ kind: l.kind, value: l.value, text: l.text })),
    )
  const balance = () =>
    t.run(async (ctx) => {
      const s = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q.eq('ownerId', ME).eq('key', `balance:${accountId}:EUR`),
        )
        .order('desc')
        .first()
      return s === null ? null : { value: s.value, source: s.source }
    })
  const link = () =>
    t.run(async (ctx) => {
      const l = await ctx.db
        .query('bankLinks')
        .withIndex('by_owner_account', (q) => q.eq('ownerId', ME))
        .unique()
      if (l === null) throw new Error('no link')
      return l
    })
  /** The bank's answer the next evening, and every step it starts. */
  const arrive = async (
    value: number,
    list: Array<ReturnType<typeof out> | ReturnType<typeof held>>,
    at = NEXT,
    booked = false,
  ) => {
    vi.setSystemTime(at)
    await t.mutation(internal.bankRows.arrive, {
      ownerId: ME,
      accountId,
      dayStart: DAY_START + DAY,
      names: [],
      readings: [{ currency: 'EUR', value, booked, rows: list }],
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
  }
  return { t, me, other, accountId, rows, balance, link, arrive }
}

const TWO = [
  out('2026-10-12', '25.00', 'TRF P/ ANDREI PAVLOV'),
  out('2026-10-12', '37.86', 'COMPRA 2789 EST SERVICO VEIGA'),
]

test('rows that reach the bank’s balance are saved with no press, once', async () => {
  const { me, rows, balance, link, arrive } = await connected()
  await arrive(664.63, TWO)
  expect(await rows()).toHaveLength(2)
  expect(await rows()).toContainEqual({
    kind: 'expense',
    value: 25,
    text: 'TRF P/ ANDREI PAVLOV',
  })
  expect(await balance()).toEqual({ value: 664.63, source: 'sync' })
  expect(await link()).toMatchObject({ checkedAt: NEXT, questions: [] })
  expect((await link()).arrived).toHaveLength(1)
  /* What the card shows of it: log sums between two stored balances. */
  expect((await me.query(api.bank.links, {}))[0]).toMatchObject({
    checking: false,
    question: null,
    arrived: {
      rows: 2,
      currency: 'EUR',
      was: 727.49,
      wasAt: NOON,
      out: 62.86,
      in: 0,
      now: 664.63,
    },
  })

  /* The same answer again: nothing new, nothing written. */
  await arrive(664.63, TWO, NEXT + 3_600_000)
  expect(await rows()).toHaveLength(2)
  expect((await link()).arrived).toHaveLength(1)
  expect(await balance()).toEqual({ value: 664.63, source: 'sync' })
})

test('a payee filed before under another name: the bank’s row gets its group; one never filed gets none', async () => {
  const { t, arrive } = await connected()
  await t.run(async (ctx) => {
    await ctx.db.insert('merchantRules', {
      ownerId: ME,
      key: 'est servico veiga e seabra sa',
      category: 'car',
      updatedAt: NOON,
    })
    /* Someone else's filing is not his. */
    await ctx.db.insert('merchantRules', {
      ownerId: 'https://clerk.test|user_other',
      key: 'andrei pavlov',
      category: 'fun',
      updatedAt: NOON,
    })
  })
  await arrive(664.63, TWO)
  const saved = await t.run(async (ctx) =>
    (
      await ctx.db
        .query('logs')
        .withIndex('by_owner_time', (q) => q.eq('ownerId', ME))
        .take(50)
    )
      .filter((l) => l.meta?.intakeId !== undefined)
      .map((l) => [l.meta?.merchant, l.meta?.category ?? null]),
  )
  expect(saved).toContainEqual(['COMPRA 2789 EST SERVICO VEIGA', 'car'])
  expect(saved).toContainEqual(['TRF P/ ANDREI PAVLOV', null])
})

test('pending money is never a row; it is one once the bank books it', async () => {
  /* ActivoBank's booked balance: the pending €25 is still in it. */
  const { rows, balance, arrive } = await connected()
  await arrive(
    727.49,
    [out('2026-10-12', '25.00', 'TRF P/ ANDREI', 'PDNG')],
    NEXT,
    true,
  )
  expect(await rows()).toEqual([])
  await arrive(
    702.49,
    [out('2026-10-12', '25.00', 'TRF P/ ANDREI')],
    NEXT + 3_600_000,
    true,
  )
  expect(await rows()).toHaveLength(1)
  expect(await balance()).toEqual({ value: 702.49, source: 'sync' })
})

test('a balance with pending payments taken off: saved with no question, and again once they are booked', async () => {
  /* His 17 Oct Revolut: three booked, McDonald's and Petiscaria pending,
     the balance with all five off. */
  const { me, accountId, rows, balance, link, arrive } = await connected()
  const pending = [
    held('2026-10-12', '8.65', "McDonald's"),
    held('2026-10-12', '6.00', 'Petiscaria Do'),
  ]
  await arrive(649.98, [...TWO, ...pending])
  expect(await rows()).toHaveLength(2)
  expect(await balance()).toEqual({ value: 649.98, source: 'sync' })
  expect((await link()).questions).toEqual([])
  /* The sheet draws no "no row" under it. */
  const sheet = () => me.query(api.aggregate.accountSheet, { accountId })
  expect((await sheet())?.checks.filter((c) => c.missing !== 0)).toEqual([])
  /* By name, for the window to list under their day. */
  const newest = async () =>
    (await sheet())?.readings.sort((x, y) => y.at - x.at)[0]
  expect(
    (await newest())?.pendingRows.map((p) => [p.merchant, p.amount]),
  ).toEqual([
    ["McDonald's", -8.65],
    ['Petiscaria Do', -6],
  ])

  /* Still pending an hour on, nothing new booked: the same. */
  await arrive(649.98, pending, NEXT + 3_600_000)
  expect((await link()).questions).toEqual([])
  expect((await newest())?.pendingRows).toHaveLength(2)
  expect((await sheet())?.checks.filter((c) => c.missing !== 0)).toEqual([])

  /* Next day the same two, booked; the balance has not moved. */
  await arrive(
    649.98,
    [
      ...TWO,
      out('2026-10-13', '8.65', "McDonald's"),
      out('2026-10-13', '6.00', 'Petiscaria Do'),
    ],
    NEXT + DAY,
  )
  expect(await rows()).toHaveLength(4)
  expect(await balance()).toEqual({ value: 649.98, source: 'sync' })
  expect((await newest())?.pendingRows).toEqual([])
  expect((await link()).questions).toEqual([])
  expect((await sheet())?.checks.filter((c) => c.missing !== 0)).toEqual([])
})

test('a first connect takes nothing older than the balance held', async () => {
  const { rows, balance, arrive } = await connected()
  await arrive(727.49, [out('2026-10-06', '700.00', 'COMPRA 2789 REVOLUT')])
  expect(await rows()).toEqual([])
  expect(await balance()).toEqual({ value: 727.49, source: 'sync' })
})

test('a payment the account already has under another name is held, then saved once', async () => {
  const { t, me, accountId, rows, balance, link, arrive } = await connected()
  /* The top-up as Revolut's file wrote it here, two days before the bank
     books it — already inside the balance held. */
  await t.run((ctx) =>
    ctx.db.insert('logs', {
      ownerId: ME,
      area: 'money',
      kind: 'move',
      occurredAt: NOON - DAY,
      value: -700,
      unit: 'eur',
      text: 'Top-up by *2789',
      accountId,
      meta: { merchant: 'Top-up by *2789', raw: 'Top-up by *2789' },
    }),
  )
  await arrive(702.49, [
    out('2026-10-12', '700.00', 'COMPRA 2789 REVOLUT 8134 DUBLIN IE'),
    out('2026-10-12', '25.00', 'TRF P/ ANDREI PAVLOV'),
  ])
  /* Held: nothing of the account is written, and the question waits. */
  expect(await rows()).toHaveLength(1)
  expect(await balance()).toEqual({ value: 727.49, source: 'sync' })
  const [batchId] = (await link()).questions ?? []
  expect(batchId).toBeDefined()
  expect((await me.query(api.bank.links, {}))[0]).toMatchObject({
    question: batchId,
    arrived: null,
  })
  /* It is not the update a dropped file would join. */
  expect(await me.query(api.intake.openBatch, {})).toBeNull()
  /* And the bank is not asked again while it is open. */
  expect(await me.action(api.bankRows.check, { accountId, dayStart: 0 })).toBe(
    'question',
  )

  const review = await me.query(api.intake.batchReview, { batchId })
  const check = review.accounts[0].check
  expect(check).toMatchObject({ state: 'ask', was: 727.49, printed: 702.49 })
  await me.mutation(api.intake.batchAnswer, {
    batchId,
    answer: { kind: 'sum', key: `skip:${check?.twin?.key}`, on: true },
  })
  await me.mutation(api.intake.applyBatch, {
    batchId,
    dayStart: DAY_START + DAY,
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await rows()).toHaveLength(2)
  expect(await balance()).toEqual({ value: 702.49, source: 'sync' })
  /* Answered: it reads as rows that arrived, before any next check. */
  expect((await me.query(api.bank.links, {}))[0]).toMatchObject({
    question: null,
    arrived: { rows: 1, was: 727.49, out: 25, now: 702.49 },
  })

  /* Answered: the next check goes through, and the rows count as arrived. */
  vi.setSystemTime(NEXT + 5 * 3_600_000)
  expect(await me.action(api.bankRows.check, { accountId, dayStart: 0 })).toBe(
    'checked',
  )
  expect(await link()).toMatchObject({ questions: [] })
  expect((await link()).arrived).toHaveLength(1)
})

test('rows no balance explains are held; nothing is written', async () => {
  const { rows, balance, link, arrive } = await connected()
  await arrive(690.49, [out('2026-10-12', '25.00', 'TRF P/ ANDREI PAVLOV')])
  expect(await rows()).toEqual([])
  expect(await balance()).toEqual({ value: 727.49, source: 'sync' })
  expect((await link()).questions).toHaveLength(1)
  expect((await link()).arrived ?? []).toEqual([])
})

test('✕ closes the arrived rows; they stay saved', async () => {
  const { me, accountId, rows, link, arrive } = await connected()
  await arrive(664.63, TWO)
  await me.mutation(api.bankRows.close, { accountId })
  expect((await link()).arrived).toEqual([])
  expect(await rows()).toHaveLength(2)
})

test('✕ also closes an answered question; one still open stays', async () => {
  const { t, me, accountId, link } = await connected()
  const batch = (status: 'done' | 'open') =>
    t.run((ctx) =>
      ctx.db.insert('batches', {
        ownerId: ME,
        status,
        leftOut: [],
        quietMonths: [],
        moves: [],
        extras: [],
        dismissed: [],
        via: 'bank',
      }),
    )
  const answered = await batch('done')
  const waiting = await batch('open')
  const linkId = (await link())._id
  await t.run((ctx) => ctx.db.patch(linkId, { questions: [answered, waiting] }))
  await me.mutation(api.bankRows.close, { accountId })
  expect((await link()).questions).toEqual([waiting])
})

test('not asked: approval ended, or a check already running', async () => {
  const { t, me, accountId, balance, link } = await connected()
  const linkId = (await link())._id
  await t.run((ctx) => ctx.db.patch(linkId, { checking: Date.now() }))
  expect(await me.action(api.bankRows.check, { accountId, dayStart: 0 })).toBe(
    'busy',
  )
  /* A check that never ended is not waited for for ever. */
  vi.setSystemTime(NOON + 3 * 60_000)
  expect(await me.action(api.bankRows.check, { accountId, dayStart: 0 })).toBe(
    'checked',
  )
  expect((await link()).checking).toBeUndefined()
  await t.run((ctx) => ctx.db.patch(linkId, { validUntil: Date.now() - 1 }))
  expect(await me.action(api.bankRows.check, { accountId, dayStart: 0 })).toBe(
    'ended',
  )
  expect(await balance()).toEqual({ value: 727.49, source: 'sync' })
})

test('a key the bank rejects: kept, not asked again, gone once approved again', async () => {
  const { t, me, accountId, balance, link } = await connected()
  const linkId = (await link())._id
  /* What a new Enable Banking application does to every older link. */
  await t.run((ctx) =>
    ctx.db.patch(linkId, {
      uids: [{ uid: 'e2e-a:refused', currency: 'EUR' }],
    }),
  )
  await expect(
    me.action(api.bankRows.check, { accountId, dayStart: 0 }),
  ).rejects.toThrow('The bank rejected the key.')
  expect((await link()).failed?.why).toBe('refused')
  expect((await link()).checking).toBeUndefined()
  expect(
    (await me.query(api.bank.links, {})).find((l) => l.accountId === accountId)
      ?.failed,
  ).toBe('refused')
  /* Nothing is asked of the bank again until he approves. */
  expect(await me.action(api.bankRows.check, { accountId, dayStart: 0 })).toBe(
    'ended',
  )
  expect(await balance()).toEqual({ value: 727.49, source: 'sync' })

  const url = await me.action(api.bank.connect, { accountId })
  const state = new URL(url, 'http://app').searchParams.get('state') as string
  await me.action(api.bank.finish, { code: 'one', state, dayStart: DAY_START })
  expect((await link()).failed).toBeUndefined()
  expect(await me.action(api.bankRows.check, { accountId, dayStart: 0 })).toBe(
    'checked',
  )
})

test('refused: someone else’s account, one not connected, not signed in', async () => {
  const { t, me, other, accountId, rows } = await connected()
  await expect(
    other.action(api.bankRows.check, { accountId, dayStart: 0 }),
  ).rejects.toThrow('This account is not connected.')
  await expect(
    other.mutation(api.bankRows.close, { accountId }),
  ).rejects.toThrow('This account is not connected.')
  await expect(
    t.action(api.bankRows.check, { accountId, dayStart: 0 }),
  ).rejects.toThrow('Not signed in')
  const cash = await me.mutation(api.accounts.create, {
    name: 'Cash',
    kinds: ['cash'],
    currencies: ['EUR'],
  })
  await expect(
    me.action(api.bankRows.check, { accountId: cash, dayStart: 0 }),
  ).rejects.toThrow('This account is not connected.')
  expect(await rows()).toEqual([])
})
