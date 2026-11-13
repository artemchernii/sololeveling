/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const at = (d: number, h: number, m = 0) => Date.UTC(2026, 10, d, h, m)

/* Artem's Trade Republic statement, dropped on Thu 12 Nov at 23:52,
   copied from his data. The bank's answer of 8 Nov held €500.57. The
   statement ends on 9 Nov at €399.72: a dividend of €0.24 and a buy of
   NVIDIA for €101.09 that day, the buy among the file's orders, not its
   money rows. The check summed the rows only and asked about
   "NO ROW · €101.09 OUT". */
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(at(12, 23, 52)) })
})
afterEach(() => {
  vi.useRealTimers()
})

const buy = (d: number, name: string, shares: number, price: number) => ({
  occurredAt: at(d, 12),
  side: 'buy' as const,
  name,
  shares,
  price,
  currency: 'EUR',
  candidates: [
    {
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      exchange: 'NASDAQ',
      type: 'EQUITY',
    },
  ],
  preferred: 0,
})

async function setup(opts: { stored?: boolean } = {}) {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const ids = await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order: 0,
    })
    await ctx.db.insert('stateSnapshots', {
      ownerId: ME,
      area: 'money',
      key: `balance:${accountId}:EUR`,
      value: 500.57,
      unit: 'eur',
      recordedAt: at(8, 20, 22),
      source: 'sync',
    })
    if (opts.stored) {
      /* The same buy, saved before from another door. */
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId: ME,
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        currency: 'USD',
        exchange: 'NASDAQ',
        type: 'EQUITY',
      })
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId,
        instrumentId,
        side: 'buy',
        shares: 0.632191,
        priceEur: 159.9042,
        occurredAt: at(9, 12),
      })
    }
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
      title: 'Trade Republic',
      transactions: [
        {
          occurredAt: at(9, 12),
          merchant: 'Cash Dividend',
          raw: 'Cash Dividend',
          amount: 0.24,
          currency: 'EUR',
          pending: false,
          self: false,
          balanceAfter: 500.81,
        },
      ],
      trades: [
        buy(9, 'NVIDIA CORP. DL-,001', 0.632191, 159.904206),
        /* Before the held balance: it had this one off already. */
        buy(5, 'NVIDIA CORP. DL-,001', 0.917992, 164.587491),
      ],
      balance: { currency: 'EUR', value: 399.72, asOf: at(9, 12) },
      files: [
        { name: 'statement.pdf', size: 1, contentType: 'application/pdf' },
      ],
    })
    return { accountId, batchId, intakeId }
  })
  const block = async () => {
    const r = await me.query(api.intake.batchReview, { batchId: ids.batchId })
    const a = r.accounts.find((x) => x.accountId === ids.accountId)
    if (!a) throw new Error('no Trade Republic block')
    return a
  }
  return { t, me, ...ids, block }
}

describe('his Trade Republic statement of 12 Nov: a buy among the file’s orders', () => {
  test('the buy is money out: 500.57 + 0.24 − 101.09 is the statement’s 399.72', async () => {
    const { block } = await setup()
    expect((await block()).check).toMatchObject({
      state: 'ok',
      was: 500.57,
      out: 101.09,
      in: 0.24,
      now: 399.72,
      printed: 399.72,
      gap: 0,
    })
  })

  test('a buy the account already has is in `was`, not taken off twice', async () => {
    const { block } = await setup({ stored: true })
    expect((await block()).check).toMatchObject({
      state: 'ok',
      was: 399.48,
      out: 0,
      in: 0.24,
      now: 399.72,
      gap: 0,
    })
  })

  test('applied: the landed sum has no gap and the buy is saved', async () => {
    const { t, me, accountId, batchId, intakeId } = await setup()
    await me.mutation(api.intake.applyBatch, { batchId, dayStart: at(12, 0) })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const saved = await t.run(async (ctx) => ({
      landed: (await ctx.db.get(intakeId))?.landed,
      trades: (await ctx.db.query('trades').collect()).filter(
        (x) => x.accountId === accountId,
      ).length,
    }))
    expect(saved.landed).toMatchObject({ was: 500.57, gap: 0 })
    expect(saved.trades).toBe(2)
  })
})
