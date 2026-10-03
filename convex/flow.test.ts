/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* Flow (3 Oct): bills found in statements, struck out, made from a row.
   Rows sit at noon UTC, as the statement reader writes them. Amounts are
   made up — the shapes are his. */
const at = (m: number, d: number) => Date.UTC(2026, m, d, 12)

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(at(9, 4)) })
})
afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const t = convexTest(schema, modules)
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

async function world(t: ReturnType<typeof setup>['t'], owner = ME) {
  return await t.run(async (ctx) => {
    const bank = await ctx.db.insert('accounts', {
      ownerId: owner,
      name: 'Bank',
      kinds: ['bank'],
      currencies: ['EUR'],
      order: 0,
    })
    const broker = await ctx.db.insert('accounts', {
      ownerId: owner,
      name: 'Broker',
      kinds: ['broker'],
      currencies: ['EUR'],
      order: 1,
    })
    const row = (
      kind: 'expense' | 'income',
      value: number,
      when: number,
      raw: string,
      extra: {
        accountId?: Id<'accounts'>
        category?: string
        merchant?: string
      } = {},
    ) =>
      ctx.db.insert('logs', {
        ownerId: owner,
        area: 'money',
        kind,
        occurredAt: when,
        value,
        unit: 'eur',
        text: extra.merchant ?? raw,
        accountId: extra.accountId ?? bank,
        meta: {
          raw,
          merchant: extra.merchant,
          category: extra.category ?? 'home',
        },
      })
    const ids = {
      edpAug: await row('expense', 30, at(7, 25), 'DD EDP COMERCIAL 123', {
        merchant: 'EDP',
      }),
      edpSep: await row('expense', 31, at(8, 25), 'DD EDP COMERCIAL 456', {
        merchant: 'Energia e Água',
      }),
      payAug: await row(
        'income',
        2000,
        at(7, 25),
        'TRF CR SEPA+ 0000017 DE ACME',
      ),
      paySep: await row(
        'income',
        2000,
        at(8, 25),
        'TRF CR SEPA+ 0000021 DE ACME',
      ),
      /* Twice a month: not a monthly bill. */
      gym1: await row('expense', 6, at(7, 5), 'DD GYM LIGHT 1'),
      gym2: await row('expense', 6, at(7, 19), 'DD GYM LIGHT 2'),
      gym3: await row('expense', 6, at(8, 2), 'DD GYM LIGHT 3'),
      gym4: await row('expense', 6, at(8, 16), 'DD GYM LIGHT 4'),
      /* A broker's dividend twice is not a salary. */
      div1: await row('income', 3, at(7, 10), 'Cash Dividend', {
        accountId: broker,
      }),
      div2: await row('income', 3, at(8, 10), 'Cash Dividend', {
        accountId: broker,
      }),
      /* Paid once: a yearly insurance. */
      insurance: await row('expense', 220, at(8, 22), 'SEGURO HOME 77'),
      cafe: await row('expense', 4, at(8, 22), 'CAFE 1', {
        category: 'eating out',
      }),
    }
    return { bank, broker, ids }
  })
}

describe('recurring.find', () => {
  test('puts bills found in statements on their day, with no question', async () => {
    const { t, me } = setup()
    await world(t)
    expect(await me.mutation(api.recurring.find, {})).toBe(2)
    const items = await t.run((ctx) => ctx.db.query('recurring').collect())
    expect(
      items.map((i) => [i.name, i.kind, i.amount, i.day, i.matchKey]).sort(),
    ).toEqual([
      ['Acme', 'income', 2000, 25, 'ACME'],
      ['Energia e Água', 'expense', 31, 25, 'EDP COMERCIAL'],
    ])
    expect(items.every((i) => i.foundAt === at(9, 4))).toBe(true)
  })

  test('finds nothing twice', async () => {
    const { t, me } = setup()
    await world(t)
    await me.mutation(api.recurring.find, {})
    expect(await me.mutation(api.recurring.find, {})).toBe(0)
  })

  test('never finds again what he struck out', async () => {
    const { t, me } = setup()
    await world(t)
    await me.mutation(api.recurring.find, {})
    const edp = await t.run(async (ctx) =>
      (await ctx.db.query('recurring').collect()).find(
        (i) => i.kind === 'expense',
      ),
    )
    await me.mutation(api.recurring.notBill, { id: edp!._id })
    expect(await me.mutation(api.recurring.find, {})).toBe(0)
    expect(
      await me.query(api.recurring.month, {
        year: 2026,
        month: 9,
        start: at(9, 1) - 12 * 3600e3,
        end: at(10, 1) - 12 * 3600e3,
      }),
    ).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({ kind: 'income' }),
      }),
    ])
    await me.mutation(api.recurring.unrefuse, { id: edp!._id })
    expect(
      (await t.run((ctx) => ctx.db.get(edp!._id)))?.refusedAt,
    ).toBeUndefined()
  })

  test("does not look at another owner's rows", async () => {
    const { t, me } = setup()
    await world(t, SOMEONE_ELSE)
    expect(await me.mutation(api.recurring.find, {})).toBe(0)
  })

  test('refuses another owner’s bill', async () => {
    const { t, me, them } = setup()
    await world(t)
    await me.mutation(api.recurring.find, {})
    const [one] = await t.run((ctx) => ctx.db.query('recurring').collect())
    await expect(
      them.mutation(api.recurring.notBill, { id: one._id }),
    ).rejects.toThrow()
  })
})

describe('recurring.fromRow and likely', () => {
  test('makes a yearly bill from a payment, everything from the row', async () => {
    const { t, me } = setup()
    const { bank, ids } = await world(t)
    const { id, created } = await me.mutation(api.recurring.fromRow, {
      logId: ids.insurance,
      cadence: 'yearly',
    })
    expect(created).toBe(true)
    const bill = await t.run((ctx) => ctx.db.get(id))
    expect(bill).toMatchObject({
      amount: 220,
      cadence: 'yearly',
      day: 22,
      month: 8,
      accountId: bank,
      matchKey: 'SEGURO HOME',
    })
    /* The same payment again is the same bill. */
    expect(
      await me.mutation(api.recurring.fromRow, {
        logId: ids.insurance,
        cadence: 'monthly',
      }),
    ).toEqual({ id, created: false })
  })

  test('offers likely bills from statements, not everyday spending', async () => {
    const { t, me } = setup()
    await world(t)
    await me.mutation(api.recurring.find, {})
    const list = await me.query(api.recurring.likely, {})
    expect(list.map((l) => l.key)).toEqual(['SEGURO HOME', 'GYM LIGHT'])
    expect(list[1].times).toBe(4)
  })

  test("refuses another owner's row", async () => {
    const { t, them } = setup()
    const { ids } = await world(t)
    await expect(
      them.mutation(api.recurring.fromRow, {
        logId: ids.insurance,
        cadence: 'yearly',
      }),
    ).rejects.toThrow()
  })
})

/* Local midnights (vitest pins Lisbon). */
const local = (m: number, d: number) => new Date(2026, m, d).getTime()
const PAST = [
  { start: local(6, 1), end: local(7, 1) },
  { start: local(7, 1), end: local(8, 1) },
  { start: local(8, 1), end: local(9, 1) },
]

describe('aggregate.ahead', () => {
  test('free cash from banks only, bills on their days, the rest as a range', async () => {
    const { t, me } = setup()
    const { bank, broker } = await world(t)
    await t.run(async (ctx) => {
      for (const [id, value] of [
        [bank, 1500],
        [broker, 9000],
      ] as const) {
        await ctx.db.insert('stateSnapshots', {
          ownerId: ME,
          area: 'money',
          key: `balance:${id}:EUR`,
          value,
          recordedAt: at(9, 4),
        })
      }
    })
    await me.mutation(api.recurring.find, {})
    const a = await me.query(api.aggregate.ahead, {
      today: local(9, 4),
      days: 60,
      monthStart: local(9, 1),
      past: PAST,
    })
    expect(a.freeTotal).toBe(1500)
    expect(a.free.map((f) => f.name)).toEqual(['Bank'])
    expect(a.events.map((e) => [new Date(e.t).getDate(), e.name])).toEqual([
      [25, 'Acme'],
      [25, 'Energia e Água'],
      [25, 'Acme'],
      [25, 'Energia e Água'],
    ])
    /* July had no rows (not read): left out. August and September's rest
       is the money out that is no bill's payment. */
    expect(a.rest.map((r) => r.start)).toEqual([local(7, 1), local(8, 1)])
    expect(a.range).toEqual({ lo: 12, hi: 236 })
    expect(a.bills.every((b) => b.isNew)).toBe(true)
  })

  test('is only his', async () => {
    const { t, them } = setup()
    await world(t)
    const a = await them.query(api.aggregate.ahead, {
      today: local(9, 4),
      days: 30,
      monthStart: local(9, 1),
      past: PAST,
    })
    expect(a.events).toEqual([])
    expect(a.range).toBeNull()
  })
})

describe('aggregate.flowMonths and logs.movements', () => {
  test('sums each month by group, moves never in it', async () => {
    const { t, me } = setup()
    const { bank, broker } = await world(t)
    await t.run(async (ctx) => {
      const out = await ctx.db.insert('logs', {
        ownerId: ME,
        area: 'money',
        kind: 'move',
        occurredAt: at(8, 26),
        value: -400,
        unit: 'eur',
        text: 'Top-up',
        accountId: bank,
        meta: { otherAccountId: broker },
      })
      await ctx.db.insert('logs', {
        ownerId: ME,
        area: 'money',
        kind: 'move',
        occurredAt: at(8, 26),
        value: 400,
        unit: 'eur',
        text: 'Top-up',
        accountId: broker,
        meta: { otherAccountId: bank, pairOf: out },
      })
    })
    const [sep] = await me.query(api.aggregate.flowMonths, {
      months: [{ start: local(8, 1), end: local(9, 1) }],
    })
    expect(sep).toMatchObject({ in: 2003, out: 267 })
    expect(sep.groups[0]).toEqual({ category: 'home', sum: 263, count: 4 })

    const m = await me.query(api.logs.movements, {
      start: local(8, 1),
      end: local(9, 1),
    })
    const moves = m.items.filter((i) => i.type === 'move')
    expect(moves).toEqual([
      expect.objectContaining({ amount: 400, from: bank, to: broker }),
    ])
  })

  test('marks a row that is a bill’s payment', async () => {
    const { t, me } = setup()
    const { ids } = await world(t)
    await me.mutation(api.recurring.find, {})
    const m = await me.query(api.logs.movements, {
      start: local(8, 1),
      end: local(9, 1),
    })
    const edp = m.items.find(
      (i) => i.type === 'row' && i.log._id === ids.edpSep,
    )
    expect(edp?.type === 'row' && edp.billId).toBeTruthy()
  })
})
