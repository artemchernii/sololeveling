/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const at = (d: number, h: number, m = 0) => Date.UTC(2026, 10, d, h, m)

/* Artem's ActivoBank on Thu 12 Nov at 22:50, copied from his data. The
   bank's 00:57 answer gave €514.95. At 17:37 BPI's answer was saved first
   and wrote this bank's side of the €105 it sent (stamped noon, BPI's
   intake on it). ActivoBank's own answer of 17:37 then printed €518.95
   with that +€105 and a −€101 he sent to a person: 514.95 + 105 − 101.
   The check counted neither row and asked about €4 with no row. */
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(at(12, 22, 50)) })
})
afterEach(() => {
  vi.useRealTimers()
})

async function setup() {
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
    const bpi = await bank('BPI', 1)
    await ctx.db.insert('stateSnapshots', {
      ownerId: ME,
      area: 'money',
      key: `balance:${accountId}:EUR`,
      value: 514.95,
      unit: 'eur',
      recordedAt: at(12, 0, 57),
      source: 'sync',
    })
    const earlier = await ctx.db.insert('intakes', {
      ownerId: ME,
      accountId,
      storageIds: [],
      status: 'done',
      kind: 'transactions',
      via: 'bank',
    })
    await ctx.db.insert('logs', {
      ownerId: ME,
      area: 'money',
      kind: 'expense',
      occurredAt: at(11, 5, 19),
      value: 5.98,
      unit: 'eur',
      text: 'Solinca',
      accountId,
      meta: {
        merchant: 'Solinca',
        raw: 'DD SOLINCA LIGHT',
        intakeId: earlier,
      },
    })
    const fromBpi = await ctx.db.insert('intakes', {
      ownerId: ME,
      accountId: bpi,
      storageIds: [],
      status: 'done',
      kind: 'transactions',
      via: 'bank',
    })
    const sent = 'TRF SEPA+ INST P/ ACTIVOBANK'
    const out = await ctx.db.insert('logs', {
      ownerId: ME,
      area: 'money',
      kind: 'move',
      occurredAt: at(12, 12),
      value: -105,
      unit: 'eur',
      text: sent,
      accountId: bpi,
      meta: {
        merchant: sent,
        raw: sent,
        intakeId: fromBpi,
        otherAccountId: accountId,
      },
    })
    await ctx.db.insert('logs', {
      ownerId: ME,
      area: 'money',
      kind: 'move',
      occurredAt: at(12, 12),
      value: 105,
      unit: 'eur',
      text: sent,
      accountId,
      meta: {
        merchant: sent,
        raw: sent,
        intakeId: fromBpi,
        otherAccountId: bpi,
        pairOf: out,
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
    const row = (d: number, raw: string, amount: number, self: boolean) => ({
      occurredAt: at(d, 12),
      merchant: raw,
      raw,
      amount,
      currency: 'EUR',
      pending: false,
      self,
    })
    const intakeId = await ctx.db.insert('intakes', {
      ownerId: ME,
      accountId,
      batchId,
      storageIds: [],
      status: 'ready',
      kind: 'transactions',
      via: 'bank',
      title: 'ActivoBank',
      transactions: [
        row(12, 'TRF. P O ARTEM CHERNII', 105, true),
        row(12, 'TRF P  CHERNII ARTEM', -101, true),
        row(11, 'DD SOLINCA LIGHT', -5.98, false),
      ],
      balance: { currency: 'EUR', value: 518.95, asOf: at(12, 11, 37) },
    })
    return { accountId, batchId, intakeId }
  })
  const block = async () => {
    const r = await me.query(api.intake.batchReview, { batchId: ids.batchId })
    const a = r.accounts.find((x) => x.accountId === ids.accountId)
    if (!a) throw new Error('no ActivoBank block')
    return a
  }
  return { t, me, ...ids, block }
}

describe('his ActivoBank on 12 Nov: a transfer in the other bank saved the same day', () => {
  test('the saved +€105 and the new −€101 reach the bank’s €518.95', async () => {
    const { block } = await setup()
    const b = await block()
    expect([b.fresh, b.had]).toEqual([1, 2])
    expect(b.check).toMatchObject({
      state: 'ok',
      was: 619.95,
      out: 101,
      in: 0,
      now: 518.95,
      printed: 518.95,
      gap: 0,
    })
  })

  test('answered and applied: the balance is the bank’s, the −€101 saved once', async () => {
    const { t, me, accountId, batchId, intakeId, block } = await setup()
    await me.mutation(api.intake.batchAnswer, {
      batchId,
      answer: { kind: 'move', intakeId, index: 1, otherAccountId: null },
    })
    expect((await block()).held).toBe(false)
    await me.mutation(api.intake.applyBatch, {
      batchId,
      dayStart: at(12, 0),
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const mine = (await me.query(api.aggregate.balances, {})).accounts.find(
      (a) => a.accountId === accountId,
    )
    expect(mine?.pockets[0].value).toBe(518.95)
    const rows = await t.run(async (ctx) =>
      (await ctx.db.query('logs').collect())
        .filter((l) => l.accountId === accountId)
        .map((l) => (l.kind === 'expense' ? -(l.value ?? 0) : l.value)),
    )
    expect(rows.sort()).toEqual([-101, -5.98, 105].sort())
  })
})
