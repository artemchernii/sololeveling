/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const H = 3_600_000
const day = (d: number) => new Date(2026, 9, d, 12).getTime()

/* His ActivoBank screenshot of 12 Oct against what the app held: €153.21
   on 3 Oct, a −€700 top-up already in under another name. */
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 13, 9) })
})
afterEach(() => {
  vi.useRealTimers()
})

const SCREEN: Array<[number, string, number, number | undefined]> = [
  [12, 'Pingo Doce', -25, 90.35],
  [10, 'Bolt', -37.86, 115.35],
  [6, 'Trade Republic', -505.2, 153.21],
  [6, 'COMPRA 2789 REVOLUT', -700, 658.41],
]

async function setup(opts: { closing?: number; bare?: boolean } = {}) {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const ids = await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'ActivoBank',
      kinds: ['bank'],
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order: 0,
    })
    await ctx.db.insert('stateSnapshots', {
      ownerId: ME,
      area: 'money',
      key: `balance:${accountId}:EUR`,
      value: 153.21,
      unit: 'eur',
      recordedAt: day(3) + 6 * H,
      source: 'screenshot',
    })
    await ctx.db.insert('logs', {
      ownerId: ME,
      area: 'money',
      kind: 'move',
      occurredAt: day(3),
      value: -700,
      unit: 'eur',
      text: 'Top-up by *2789',
      accountId,
      meta: { merchant: 'Top-up by *2789', raw: 'Top-up by *2789' },
    })
    const read = () =>
      ctx.db.insert('intakes', {
        ownerId: ME,
        accountId,
        storageIds: [],
        status: 'ready',
        kind: 'transactions',
        title: 'ActivoBank',
        transactions: SCREEN.map(([d, merchant, amount, after]) => ({
          occurredAt: day(d),
          merchant,
          raw: merchant,
          amount,
          currency: 'EUR',
          pending: false,
          self: false,
          balanceAfter: opts.bare ? undefined : after,
        })),
        balance: opts.bare
          ? undefined
          : { currency: 'EUR', value: opts.closing ?? 90.35, asOf: day(12) },
        files: [{ name: 'IMG_9282.png', size: 1, contentType: 'image/png' }],
      })
    return { accountId, intakeId: await read(), againId: await read() }
  })
  const confirm = async (intakeId = ids.intakeId) => {
    const review = await me.query(api.intake.review, { intakeId })
    return await me.mutation(api.intake.confirmTransactions, {
      intakeId,
      accountId: ids.accountId,
      dayStart: new Date(2026, 9, 13).getTime(),
      keepBalance: true,
      rows: (review?.rows ?? [])
        .filter((r) => r.duplicateOf === null && !r.counted)
        .map((r) => ({ index: r.index, kind: r.kind })),
    })
  }
  const balance = async () =>
    (await me.query(api.aggregate.balances, {})).accounts[0].pockets[0].value
  const kept = async (intakeId = ids.intakeId) =>
    (await t.run((ctx) => ctx.db.get(intakeId)))?.landed
  return { t, me, ...ids, confirm, balance, kept }
}

describe('the balance from the rows', () => {
  test('rows the old balance had counted are not added again', async () => {
    const { me, intakeId, confirm, balance, kept } = await setup()
    const review = await me.query(api.intake.review, { intakeId })
    expect(review?.rows.map((r) => r.counted)).toEqual([
      false,
      false,
      true,
      true,
    ])
    expect((await confirm()).written).toBe(2)
    expect(await balance()).toBe(90.35)
    expect(await kept()).toEqual({
      currency: 'EUR',
      was: 153.21,
      wasAt: day(3) + 6 * H,
      since: day(3) + 18 * H,
      had: 2,
      printed: true,
      gap: 0,
    })
  })

  test('the same file again: every row is one you already had', async () => {
    const { me, againId, confirm, balance } = await setup()
    await confirm()
    const review = await me.query(api.intake.review, { intakeId: againId })
    expect(
      review?.rows.filter((r) => r.duplicateOf === null && !r.counted),
    ).toEqual([])
    expect((await confirm(againId)).written).toBe(0)
    expect(await balance()).toBe(90.35)
  })

  test('it does not add up: the printed balance wins, the gap is kept', async () => {
    const { confirm, balance, kept } = await setup({ closing: 78.35 })
    await confirm()
    expect(await balance()).toBe(78.35)
    expect(await kept()).toMatchObject({ printed: true, had: 2, gap: -12 })
  })

  test('no printed balance: nothing is claimed, the rows are summed', async () => {
    const { confirm, balance, kept } = await setup({ bare: true })
    expect((await confirm()).written).toBe(4)
    expect(await balance()).toBe(-1114.85)
    expect(await kept()).toMatchObject({ was: 153.21, had: 0, printed: false })
  })

  /* His card stood at −€1,114.85: the four rows were in, the balance was
     not, and the screenshot that prints €90.35 had "nothing to save". */
  test('every row already in, the balance not: the file still has it to save', async () => {
    const { t, me, intakeId, balance } = await setup()
    const batchId = await t.run(async (ctx) => {
      for (const [d, merchant, amount] of SCREEN)
        await ctx.db.insert('logs', {
          ownerId: ME,
          area: 'money',
          kind: 'expense',
          occurredAt: day(d),
          value: -amount,
          unit: 'eur',
          text: merchant,
          accountId: (await ctx.db.get(intakeId))?.accountId,
          meta: { merchant, raw: merchant },
        })
      const id = await ctx.db.insert('batches', {
        ownerId: ME,
        status: 'open',
        leftOut: [],
        quietMonths: [],
        moves: [],
        extras: [],
        dismissed: [],
      })
      await ctx.db.patch(intakeId, { batchId: id })
      return id
    })
    expect(await balance()).toBe(-1114.85)
    const before = await me.query(api.intake.batchReview, { batchId })
    expect(before.accounts.map((a) => [a.fresh, a.balanceNews])).toEqual([
      [0, true],
    ])
    await me.mutation(api.intake.applyBatch, {
      batchId,
      dayStart: new Date(2026, 9, 13).getTime(),
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await balance()).toBe(90.35)
  })

  test('an account with no balance yet: the rows land, nothing is kept', async () => {
    const { t, confirm, kept } = await setup()
    await t.run(async (ctx) => {
      for (const s of await ctx.db.query('stateSnapshots').collect())
        await ctx.db.delete(s._id)
    })
    await confirm()
    expect(await kept()).toBeUndefined()
  })
})
