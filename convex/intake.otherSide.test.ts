/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const day = (d: number) => new Date(2026, 9, d, 12).getTime()

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 13, 9) })
})
afterEach(() => {
  vi.useRealTimers()
})

/* His ActivoBank screenshot of 11 Oct, with his accounts as they stand:
   Revolut holds 2789, ActivoBank's own card. */
const ROWS: Array<[number, string, number]> = [
  [6, 'COMPRA 2789 TRADE REPUBLIC BERLIN DE', -505.2],
  [6, 'COMPRA 2789 REVOLUT 8134 DUBLIN IE', -700],
  [5, 'COMPRA 2789 TRANSF 22 LISBOA', -40],
]

async function setup() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const ids = await t.run(async (ctx) => {
    const account = (
      order: number,
      name: string,
      ibanTails: Array<string>,
      kinds: Array<'bank' | 'broker'> = ['bank'],
    ) =>
      ctx.db.insert('accounts', {
        ownerId: ME,
        name,
        kinds,
        currencies: ['EUR'],
        ibanTails,
        cardTails: [],
        order,
      })
    const activo = await account(0, 'ActivoBank', [
      '8741',
      '0120',
      '8894',
      '0988',
    ])
    const revolut = await account(1, 'Revolut', ['4055', '2789', '8134'])
    const tr = await account(2, 'Trade Republic', [], ['broker'])
    const bpi = await account(3, 'BPI', ['0120'])
    const intakeId = await ctx.db.insert('intakes', {
      ownerId: ME,
      accountId: activo,
      storageIds: [],
      status: 'ready',
      kind: 'transactions',
      title: 'ActivoBank',
      transactions: ROWS.map(([d, raw, amount]) => ({
        occurredAt: day(d),
        merchant: raw,
        raw,
        amount,
        currency: 'EUR',
        pending: false,
        self: true,
      })),
      files: [{ name: 'IMG_9300.png', size: 1, contentType: 'image/png' }],
    })
    return { activo, revolut, tr, bpi, intakeId }
  })
  return { t, me, ...ids }
}

describe('the other side of a card payment', () => {
  test('COMPRA 2789 TRADE REPUBLIC pairs to Trade Republic, not Revolut', async () => {
    const { t, me, activo, revolut, tr, intakeId } = await setup()
    const review = await me.query(api.intake.review, { intakeId })
    expect(review?.rows.map((r) => [r.kind, r.otherAccountId])).toEqual([
      ['move', tr],
      ['move', revolut],
      ['move', null],
    ])
    await me.mutation(api.intake.confirmTransactions, {
      intakeId,
      accountId: activo,
      dayStart: new Date(2026, 9, 13).getTime(),
      keepBalance: false,
      rows: (review?.rows ?? []).map((r) => ({
        index: r.index,
        kind: r.kind,
        otherAccountId: r.otherAccountId ?? undefined,
      })),
    })
    const logs = await t.run((ctx) => ctx.db.query('logs').collect())
    const on = (id: typeof activo) =>
      logs
        .filter((l) => l.accountId === id)
        .map((l) => l.value)
        .sort()
    expect(on(tr)).toEqual([505.2])
    expect(on(revolut)).toEqual([700])
    expect(on(activo)).toEqual([-40, -505.2, -700].sort())
  })

  test('no account the row names: no pair row, and no ending learned', async () => {
    const { t, me, activo, revolut, tr, bpi, intakeId } = await setup()
    const review = await me.query(api.intake.review, { intakeId })
    const lone = review?.rows.find((r) => r.index === 2)
    expect(lone?.otherAccountId).toBeNull()
    await me.mutation(api.intake.confirmTransactions, {
      intakeId,
      accountId: activo,
      dayStart: new Date(2026, 9, 13).getTime(),
      keepBalance: false,
      rows: [{ index: 2, kind: 'move' }],
    })
    const logs = await t.run((ctx) => ctx.db.query('logs').collect())
    expect(logs.map((l) => [l.accountId, l.value])).toEqual([[activo, -40]])
    const tails = await t.run(async (ctx) =>
      Promise.all(
        [revolut, tr, bpi].map(async (id) => (await ctx.db.get(id))?.ibanTails),
      ),
    )
    expect(tails).toEqual([['4055', '2789', '8134'], [], ['0120']])
  })

  test('a confirmed card payment never teaches the paying card to the other side', async () => {
    const { t, me, activo, tr, intakeId } = await setup()
    await me.mutation(api.intake.confirmTransactions, {
      intakeId,
      accountId: activo,
      dayStart: new Date(2026, 9, 13).getTime(),
      keepBalance: false,
      rows: [{ index: 0, kind: 'move', otherAccountId: tr }],
    })
    expect((await t.run((ctx) => ctx.db.get(tr)))?.ibanTails).toEqual([])
  })
})
