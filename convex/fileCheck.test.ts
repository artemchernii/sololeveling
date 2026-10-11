/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const H = 3_600_000
const day = (d: number) => new Date(2026, 9, d, 12).getTime()
const dayStart = new Date(2026, 9, 11).getTime()

/* Artem's ActivoBank on Sunday 11 Oct at 13:41, copied from his data, not
   a tidy case. The 3 Oct screenshot (IMG_9238) gave €153.21 with −€1,205.20
   pending; Revolut's CSV wrote this bank's side of the −€700 top-up on Sat
   3 Oct. Then IMG_9282: seven rows, a balance printed under each, the bank
   booking the top-up on Tue 6 Oct and the last row on Mon the 12th. */
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 11, 13, 41) })
})
afterEach(() => {
  vi.useRealTimers()
})

const OLD: Array<[number, string, number]> = [
  [2, 'TRF P/ COND P S PRCRT V CASTRO ALMEIDA 4', -175],
  [2, 'TRF P/O ARTEM CHERNII', 1000],
  [1, 'PAG BXVAL- 2789 VIAVERDE', -2.25],
  [1, 'TRF P/O OLEKSANDR SAKHNO', 100],
]
const SCREEN: Array<[number, string, string, number, number, boolean]> = [
  [11, 'Transfer to Andrei Pavlov', 'TRF P/ ANDREI PAVLOV', -25, 90.35, false],
  [
    6,
    'Trade Republic',
    'COMPRA 2789 TRADE REPUBLIC BERLIN DE',
    -505.2,
    115.35,
    true,
  ],
  [6, 'Revolut', 'COMPRA 2789 REVOLUT 8134 DUBLIN IE', -700, 620.55, true],
  [
    5,
    'Veiga e Seabra service station',
    'COMPRA 2789 EST SERVICO VEIGA E SEABRA SA CASAL',
    -37.86,
    1320.55,
    false,
  ],
  [
    2,
    'Condominium payment',
    'TRF P/ COND P S PRCT V CASTRO ALMEIDA 4',
    -175,
    1358.41,
    false,
  ],
  [2, 'Artem Chernii', 'TRF. P/O ARTEM CHERNII', 1000, 1533.41, false],
  [1, 'Viaverde', 'PAG BXVAL- 2789 VIAVERDE', -2.25, 533.41, false],
]

async function setup(
  opts: { topUp?: 'revolut' | 'typed'; closing?: number } = {},
) {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const ids = await t.run(async (ctx) => {
    const bank = (name: string, order: number) =>
      ctx.db.insert('accounts', {
        ownerId: ME,
        name,
        kinds: ['bank'],
        currencies: ['EUR'],
        ibanTails: [],
        cardTails: [],
        order,
      })
    const accountId = await bank('ActivoBank', 0)
    const revolut = await bank('Revolut', 1)
    const file = (account: typeof accountId) =>
      ctx.db.insert('intakes', {
        ownerId: ME,
        accountId: account,
        storageIds: [],
        status: 'done',
        kind: 'transactions',
      })
    const first = await file(accountId)
    const csv = await file(revolut)
    for (const [d, merchant, amount] of OLD)
      await ctx.db.insert('logs', {
        ownerId: ME,
        area: 'money',
        kind: amount > 0 ? 'income' : 'expense',
        occurredAt: day(d),
        value: Math.abs(amount),
        unit: 'eur',
        text: merchant,
        accountId,
        meta: { merchant, raw: merchant, intakeId: first },
      })
    await ctx.db.insert('stateSnapshots', {
      ownerId: ME,
      area: 'money',
      key: `balance:${accountId}:EUR`,
      value: 153.21,
      unit: 'eur',
      recordedAt: day(3) + 6 * H,
      source: 'screenshot',
      pending: -1205.2,
    })
    /* The top-up as Revolut's file wrote it — or, as before 11 Oct's
       fix, a row nothing ties to another bank's file. */
    await ctx.db.insert('logs', {
      ownerId: ME,
      area: 'money',
      kind: 'move',
      occurredAt: day(3),
      value: -700,
      unit: 'eur',
      text: 'Top-up by *2789',
      accountId,
      meta: {
        merchant: 'Top-up by *2789',
        raw: 'Top-up by *2789',
        intakeId: opts.topUp === 'typed' ? undefined : csv,
        otherAccountId: revolut,
      },
    })
    const batchId = await ctx.db.insert('batches', {
      ownerId: ME,
      status: 'open',
      leftOut: [],
      quietMonths: [],
      moves: [],
      extras: [],
      dismissed: [],
    })
    const intakeId = await ctx.db.insert('intakes', {
      ownerId: ME,
      accountId,
      batchId,
      storageIds: [],
      status: 'ready',
      kind: 'transactions',
      title: 'ActivoBank',
      transactions: SCREEN.map(([d, merchant, raw, amount, after, self]) => ({
        occurredAt: day(d),
        merchant,
        raw,
        amount,
        currency: 'EUR',
        pending: false,
        self,
        balanceAfter: after,
      })),
      balance: { currency: 'EUR', value: opts.closing ?? 90.35, asOf: day(11) },
      files: [{ name: 'IMG_9282.PNG', size: 1, contentType: 'image/png' }],
    })
    /* A second bank in the same drop, with nothing to ask. */
    await ctx.db.insert('intakes', {
      ownerId: ME,
      accountId: revolut,
      batchId,
      storageIds: [],
      status: 'ready',
      kind: 'transactions',
      title: 'Revolut',
      transactions: [
        {
          occurredAt: day(10),
          merchant: 'Bolt',
          raw: 'Bolt',
          amount: -6.7,
          currency: 'EUR',
          pending: false,
          self: false,
        },
      ],
      files: [{ name: 'revolut.csv', size: 1, contentType: 'text/csv' }],
    })
    return { accountId, revolut, batchId, intakeId }
  })
  const block = async () => {
    const r = await me.query(api.intake.batchReview, { batchId: ids.batchId })
    const a = r.accounts.find((x) => x.accountId === ids.accountId)
    if (!a) throw new Error('no ActivoBank block')
    return a
  }
  const apply = async () => {
    await me.mutation(api.intake.applyBatch, { batchId: ids.batchId, dayStart })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
  }
  const balance = async () =>
    (await me.query(api.aggregate.balances, {})).accounts.find(
      (a) => a.accountId === ids.accountId,
    )?.pockets[0].value
  const rows = (account = ids.accountId) =>
    t.run(async (ctx) =>
      (await ctx.db.query('logs').collect())
        .filter((l) => l.accountId === account)
        .map((l) => [l.text, l.kind === 'expense' ? -(l.value ?? 0) : l.value]),
    )
  return { t, me, ...ids, block, apply, balance, rows }
}

describe('his ActivoBank screenshot of 11 Oct, checked before it is saved', () => {
  test('it adds up: the row that was pending is saved and not taken off twice', async () => {
    const { t, intakeId, block, apply, balance, rows } = await setup()
    const b = await block()
    expect([b.fresh, b.had, b.held]).toEqual([3, 4, false])
    expect(b.check).toMatchObject({
      state: 'ok',
      was: 153.21,
      out: 62.86,
      in: 0,
      now: 90.35,
      printed: 90.35,
      gap: 0,
      twin: null,
    })
    expect(b.check?.pending.map((r) => [r.merchant, r.amount])).toEqual([
      ['Trade Republic', -505.2],
    ])
    await apply()
    expect(await balance()).toBe(90.35)
    expect((await rows()).filter(([, v]) => v === -700)).toHaveLength(1)
    expect(await rows()).toHaveLength(8)
    const landed = (await t.run((ctx) => ctx.db.get(intakeId)))?.landed
    expect(landed).toMatchObject({ was: 153.21, gap: 0, pending: -505.2 })
  })

  test('the top-up comes again under another name: seen before it is written', async () => {
    const { block } = await setup({ topUp: 'typed' })
    const b = await block()
    expect(b.held).toBe(true)
    expect(b.check).toMatchObject({
      state: 'ask',
      out: 762.86,
      now: -609.65,
      printed: 90.35,
      gap: 700,
    })
    expect(b.check?.twin).toMatchObject({
      merchant: 'Revolut',
      amount: -700,
      occurredAt: day(6),
      mine: { merchant: 'Top-up by *2789', occurredAt: day(3) },
    })
  })

  test('no row explains it: off, by what no row shows', async () => {
    const { block } = await setup({ closing: 78.35 })
    const b = await block()
    expect(b.held).toBe(true)
    expect(b.check).toMatchObject({
      state: 'off',
      now: 90.35,
      printed: 78.35,
      gap: -12,
      twin: null,
    })
  })
})
