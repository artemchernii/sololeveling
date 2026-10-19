/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const at = (day: number) => new Date(2026, 9, day, 12).getTime()
const endOf = (day: number) => new Date(2026, 9, day + 1).getTime() - 1
const READ = at(5)

/* 18 Oct: balances and the cash history read only the trades after a
   reading, not every trade of the account. The numbers stay the same —
   trades at or before the reading are already in it. */
beforeEach(() => {
  vi.useFakeTimers({ now: at(10) })
})
afterEach(() => {
  vi.useRealTimers()
})

async function setup() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const revolut = await me.mutation(api.accounts.create, {
    name: 'Revolut',
    kinds: ['bank', 'broker'],
    currencies: ['EUR'],
  })
  const t212 = await me.mutation(api.accounts.create, {
    name: 'Trading 212',
    kinds: ['broker'],
    currencies: ['EUR'],
  })
  await t.run(async (ctx) => {
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId: ME,
      symbol: 'VWCE',
      name: 'Vanguard FTSE All-World',
      exchange: 'XETRA',
      currency: 'EUR',
      type: 'ETF',
    })
    const reading = (key: string, value: number) =>
      ctx.db.insert('stateSnapshots', {
        ownerId: ME,
        area: 'money',
        key,
        value,
        unit: 'eur',
        recordedAt: READ,
      })
    await reading(`balance:${revolut}:EUR`, 1000)
    await reading(`brokerCash:${revolut}:EUR`, 500)
    await reading(`balance:${t212}:EUR`, 200)
    const trade = (
      accountId: Id<'accounts'>,
      side: 'buy' | 'sell',
      shares: number,
      priceEur: number,
      occurredAt: number,
      extra: { opening?: boolean; noCash?: boolean } = {},
    ) =>
      ctx.db.insert('trades', {
        ownerId: ME,
        accountId,
        instrumentId,
        side,
        shares,
        priceEur,
        occurredAt,
        ...extra,
      })
    /* Before the reading, and at it: already in it. */
    await trade(revolut, 'buy', 10, 10, at(2))
    await trade(revolut, 'buy', 1, 7, READ)
    await trade(t212, 'buy', 3, 10, at(2))
    /* After it: these move the cash. */
    await trade(revolut, 'buy', 2, 20, at(7))
    await trade(revolut, 'sell', 1, 30, at(8))
    await trade(t212, 'buy', 1, 50, at(7))
    /* After it, with no cash side. */
    await trade(revolut, 'buy', 5, 5, at(8), { opening: true })
    await trade(revolut, 'buy', 5, 5, at(8), { noCash: true })
  })
  return { t, me, revolut, t212 }
}

test('balances: broker cash and a broker balance count only the trades after the reading', async () => {
  const { me, revolut, t212 } = await setup()
  const b = await me.query(api.aggregate.balances, {})
  const rev = b.accounts.find((a) => a.accountId === revolut)
  const t2 = b.accounts.find((a) => a.accountId === t212)
  expect(rev?.cashEur).toBe(1000)
  expect(rev?.brokerCash).toEqual({
    eur: 490,
    recordedAt: READ,
    moved: -10,
    movedRows: 2,
  })
  expect(t2?.pockets[0]).toMatchObject({
    value: 150,
    read: 200,
    moved: -50,
    movedRows: 1,
  })
  expect(b.total).toBe(1640)

  const w = await me.query(api.aggregate.worth, {})
  expect(w.cash.total).toBe(1640)
})

test('cash history: broker cash from its first reading, the same points as before', async () => {
  const { me, revolut, t212 } = await setup()
  const h = await me.query(api.aggregate.cashHistory, {
    dayEnds: [endOf(1), endOf(4), endOf(5), endOf(7), endOf(9)],
  })
  expect(h.accounts.find((a) => a.accountId === revolut)?.values).toEqual([
    null,
    null,
    1500,
    1460,
    1490,
  ])
  expect(h.accounts.find((a) => a.accountId === t212)?.values).toEqual([
    null,
    200,
    200,
    150,
    150,
  ])
  expect(h.total).toEqual([null, 200, 1700, 1610, 1640])
})

test('another user sees none of it, and no one signed in is refused', async () => {
  const { t } = await setup()
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  const b = await other.query(api.aggregate.balances, {})
  expect(b.accounts).toEqual([])
  expect(b.total).toBe(0)
  const h = await other.query(api.aggregate.cashHistory, {
    dayEnds: [endOf(5), endOf(9)],
  })
  expect(h).toEqual({ total: [null, null], accounts: [] })

  await expect(t.query(api.aggregate.balances, {})).rejects.toThrow()
  await expect(
    t.query(api.aggregate.cashHistory, { dayEnds: [endOf(9)] }),
  ).rejects.toThrow()
})
