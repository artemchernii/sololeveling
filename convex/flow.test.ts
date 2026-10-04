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
      /* Every two weeks: a bill on a fortnight's rhythm. */
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
    expect(await me.mutation(api.recurring.find, {})).toBe(3)
    const items = await t.run((ctx) => ctx.db.query('recurring').collect())
    expect(
      items
        .map((i) => [i.name, i.kind, i.amount, i.day, i.matchKey, i.everyWeeks])
        .sort(),
    ).toEqual([
      ['Acme', 'income', 2000, 25, 'ACME', undefined],
      ['Edp Comercial', 'expense', 31, 25, 'EDP COMERCIAL', undefined],
      /* Every two weeks: each €6 on its own day, from 16 Sep. */
      ['Gym Light', 'expense', 6, 16, 'GYM LIGHT', 2],
    ])
    expect(items.every((i) => i.foundAt === at(9, 4))).toBe(true)
  })

  test('takes back a bill it found in an everyday group, never one he added', async () => {
    const { t, me } = setup()
    const { bank } = await world(t)
    await t.run(async (ctx) => {
      for (const foundAt of [at(9, 3), undefined]) {
        await ctx.db.insert('recurring', {
          ownerId: ME,
          name: 'Petrol',
          kind: 'expense',
          amount: 57,
          category: 'shopping',
          accountId: bank,
          cadence: 'monthly',
          day: 9,
          foundAt,
        })
      }
    })
    await me.mutation(api.recurring.find, {})
    const left = await t.run((ctx) => ctx.db.query('recurring').collect())
    expect(
      left.filter((i) => i.name === 'Petrol').map((i) => i.foundAt),
    ).toEqual([undefined])
  })

  test('opens a bill onto the payments behind it, and only his', async () => {
    const { t, me, them } = setup()
    const { ids } = await world(t)
    await me.mutation(api.recurring.find, {})
    const edp = await t.run(async (ctx) =>
      (await ctx.db.query('recurring').collect()).find(
        (i) => i.matchKey === 'EDP COMERCIAL',
      ),
    )
    const rows = await me.query(api.recurring.payments, { id: edp!._id })
    expect(rows.map((r) => r._id)).toEqual([ids.edpSep, ids.edpAug])
    await expect(
      them.query(api.recurring.payments, { id: edp!._id }),
    ).rejects.toThrow()
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
        (i) => i.matchKey === 'EDP COMERCIAL',
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
    ).not.toContainEqual(
      expect.objectContaining({
        item: expect.objectContaining({ matchKey: 'EDP COMERCIAL' }),
      }),
    )
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
    /* The gym is a bill now (one that varies), so not offered. */
    expect(list.map((l) => l.key)).toEqual(['SEGURO HOME'])
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
      [14, 'Gym Light'],
      [25, 'Acme'],
      [25, 'Edp Comercial'],
      [28, 'Gym Light'],
      [11, 'Gym Light'],
      [25, 'Gym Light'],
      [25, 'Acme'],
      [25, 'Edp Comercial'],
    ])
    /* July had no rows (not read): left out. August and September's rest
       is the money out that is no bill's payment. */
    expect(a.rest.map((r) => r.start)).toEqual([local(7, 1), local(8, 1)])
    /* The bank's rows begin on 5 August: August is partial, said so,
       and out of the range. The gym is a bill's payment, not the rest. */
    expect(a.rest.map((r) => r.partial.map((p) => p.name))).toEqual([
      ['Bank'],
      [],
    ])
    expect(a.range).toEqual({ lo: 224, hi: 224 })
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

  test('folds a pair linked from either side, from the leaving account to the arriving one', async () => {
    const { t, me } = setup()
    const { bank, broker } = await world(t)
    await t.run(async (ctx) => {
      const arrive = await ctx.db.insert('logs', {
        ownerId: ME,
        area: 'money',
        kind: 'move',
        occurredAt: at(8, 27),
        value: 400,
        unit: 'eur',
        text: 'TRF. P/O ME',
        accountId: broker,
      })
      await ctx.db.insert('logs', {
        ownerId: ME,
        area: 'money',
        kind: 'move',
        occurredAt: at(8, 28),
        value: -400,
        unit: 'eur',
        text: 'TRF SEPA+ INST',
        accountId: bank,
        meta: { otherAccountId: broker, pairOf: arrive },
      })
    })
    const m = await me.query(api.logs.movements, {
      start: local(8, 1),
      end: local(9, 1),
    })
    expect(m.items.filter((i) => i.type === 'move')).toEqual([
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

describe('aggregate.payMonth', () => {
  test('salary to salary on his rows; nothing for another owner', async () => {
    const { t, me, them } = setup()
    await world(t)
    await me.mutation(api.recurring.find, {})
    const p = await me.query(api.aggregate.payMonth, { today: local(9, 4) })
    expect(p?.current).toMatchObject({
      start: at(8, 25),
      end: at(9, 25),
      salary: 2000,
      bills: 31,
      day: 9,
    })
    expect(
      await them.query(api.aggregate.payMonth, { today: local(9, 4) }),
    ).toBeNull()
  })
})

describe('recurring.end and resume', () => {
  test('cancelled: off what is ahead, its past payment still a bill — only his', async () => {
    const { t, me, them } = setup()
    await world(t)
    await me.mutation(api.recurring.find, {})
    const edp = await t.run(async (ctx) =>
      (await ctx.db.query('recurring').collect()).find(
        (i) => i.matchKey === 'EDP COMERCIAL',
      ),
    )
    await expect(
      them.mutation(api.recurring.end, { id: edp!._id }),
    ).rejects.toThrow()
    await expect(
      them.mutation(api.recurring.resume, { id: edp!._id }),
    ).rejects.toThrow()
    await me.mutation(api.recurring.end, { id: edp!._id })
    const a = await me.query(api.aggregate.ahead, {
      today: local(9, 4),
      days: 60,
      monthStart: local(9, 1),
      past: PAST,
    })
    expect(a.events.map((e) => e.name)).not.toContain('Edp Comercial')
    expect(a.bills.map((b) => b.name)).not.toContain('Edp Comercial')
    /* September's EDP payment is still a bill's, not day-to-day. */
    const d = await me.query(api.aggregate.payMonthDetail, {
      start: at(7, 25),
      end: at(8, 25),
      prev: null,
      today: local(9, 4),
    })
    expect(d.bills.map((b) => b.billName)).toContain('Edp Comercial')
    await me.mutation(api.recurring.resume, { id: edp!._id })
    expect(
      (await t.run((ctx) => ctx.db.get(edp!._id)))?.endedAt,
    ).toBeUndefined()
  })
})

describe('recurring.fromRow, from a payment he named', () => {
  test('a PayPal payment named Preply makes a Preply bill, paid by the next one named so', async () => {
    const { t, me } = setup()
    const { bank } = await world(t)
    const [a, b] = await t.run(async (ctx) => {
      const mk = (m: number) =>
        ctx.db.insert('logs', {
          ownerId: ME,
          area: 'money',
          kind: 'expense',
          occurredAt: at(m, 29),
          value: 124,
          unit: 'eur',
          text: 'PayPal Europe',
          accountId: bank,
          meta: {
            raw: 'DD PayPal Europe 5D4J2254EVNWL LU96',
            merchant: 'PayPal Europe',
            category: 'learning',
            payee: 'Preply',
          },
        })
      return [await mk(7), await mk(8)]
    })
    const { id } = await me.mutation(api.recurring.fromRow, {
      logId: b,
      cadence: 'monthly',
    })
    const bill = await t.run((ctx) => ctx.db.get(id))
    expect(bill).toMatchObject({ name: 'Preply', matchKey: 'NAMED PREPLY' })
    const rows = await me.query(api.recurring.payments, { id })
    expect(rows.map((r) => r._id).sort()).toEqual([a, b].sort())
  })
})

describe('lent', () => {
  test('lent and paid back: in no in/out sum, paired by itself, listed — only his', async () => {
    const { t, me, them } = setup()
    const { bank } = await world(t)
    const [out, back] = await t.run(async (ctx) => {
      const mk = (kind: 'expense' | 'income', d: number, raw: string) =>
        ctx.db.insert('logs', {
          ownerId: ME,
          area: 'money',
          kind,
          occurredAt: at(8, d),
          value: 100,
          unit: 'eur',
          text: raw,
          accountId: bank,
          meta: { raw, merchant: raw, category: 'other' },
        })
      return [
        await mk('expense', 28, 'TRF MB WAY P/ IVAN PETROV'),
        await mk('income', 30, 'TRF. P/O IVAN PETROV'),
      ]
    })
    const before = await me.query(api.aggregate.moneySums, {
      start: at(8, 1),
      end: at(9, 1),
    })
    await expect(
      them.mutation(api.logs.refile, { logId: out, category: 'lent' }),
    ).rejects.toThrow()
    expect(
      await me.mutation(api.logs.refile, { logId: out, category: 'lent' }),
    ).toBe(1)
    const rows = await t.run(async (ctx) =>
      Promise.all([out, back].map((id) => ctx.db.get(id))),
    )
    expect(rows.map((r) => r?.meta?.category)).toEqual(['lent', 'lent'])
    /* A lending teaches no rule: the next transfer may be for dinner. */
    expect(
      (await t.run((ctx) => ctx.db.query('merchantRules').collect())).map(
        (r) => r.category,
      ),
    ).not.toContain('lent')
    const after = await me.query(api.aggregate.moneySums, {
      start: at(8, 1),
      end: at(9, 1),
    })
    expect(before.out.sum - after.out.sum).toBe(100)
    expect(before.in.sum - after.in.sum).toBe(100)
    const listed = await me.query(api.logs.moneyRows, {
      start: at(8, 1),
      end: at(9, 1),
    })
    expect(listed.map((r) => r._id)).not.toContain(out)
    const d = await me.query(api.aggregate.payMonthDetail, {
      start: at(8, 25),
      end: at(9, 25),
      prev: null,
      today: local(9, 4),
    })
    expect(d.lent.map((x) => [x.kind, x.row.id])).toEqual([
      ['expense', out],
      ['income', back],
    ])
    expect(d.moneyIn.map((m) => m.row.id)).not.toContain(back)
  })
})

describe('why.row and subscriptions as bills', () => {
  test('a row says why it is where it is — only his', async () => {
    const { t, me, them } = setup()
    const { ids } = await world(t)
    await me.mutation(api.recurring.find, {})
    expect(await me.query(api.why.row, { logId: ids.edpSep })).toBe(
      /* The name the row shows, not the bill's bank-ish one. */
      'Bill — pays Electricity · EDP (found in your statements): same payee, about the same amount.',
    )
    expect(await me.query(api.why.row, { logId: ids.cafe })).toContain(
      'Eating out',
    )
    expect(await them.query(api.why.row, { logId: ids.edpSep })).toBeNull()
  })

  test('filed as Subscriptions, a payment becomes a bill', async () => {
    const { t, me } = setup()
    const { ids } = await world(t)
    await me.mutation(api.logs.refile, {
      logId: ids.insurance,
      category: 'subscriptions',
    })
    const bills = await t.run((ctx) => ctx.db.query('recurring').collect())
    expect(bills).toEqual([
      expect.objectContaining({
        matchKey: 'SEGURO HOME',
        amount: 220,
        cadence: 'monthly',
        category: 'subscriptions',
      }),
    ])
  })
})

describe('recurring.setCovers', () => {
  test('one payment for five months: every five months, a fifth a month — only his', async () => {
    const { t, me, them } = setup()
    const { bank } = await world(t)
    await t.run((ctx) =>
      ctx.db.insert('logs', {
        ownerId: ME,
        area: 'money',
        kind: 'expense',
        occurredAt: at(9, 2),
        value: 175,
        unit: 'eur',
        text: 'TRF P/ COND P S PRCRT V CASTRO ALMEIDA 4',
        accountId: bank,
        meta: {
          raw: 'TRF P/ COND P S PRCRT V CASTRO ALMEIDA 4',
          category: 'home',
        },
      }),
    )
    await me.mutation(api.recurring.find, {})
    const cond = await t.run(async (ctx) =>
      (await ctx.db.query('recurring').collect()).find(
        (i) => i.name === 'Condominium',
      ),
    )
    expect(cond).toMatchObject({ asksMonths: true, amount: 175 })
    await expect(
      them.mutation(api.recurring.setCovers, { id: cond!._id, months: 5 }),
    ).rejects.toThrow()
    await expect(
      me.mutation(api.recurring.setCovers, { id: cond!._id, months: 13 }),
    ).rejects.toThrow('One to twelve months.')
    await me.mutation(api.recurring.setCovers, { id: cond!._id, months: 5 })
    const after = await t.run((ctx) => ctx.db.get(cond!._id))
    expect(after).toMatchObject({ everyMonths: 5, anchor: at(9, 2) })
    expect(after?.asksMonths).toBeUndefined()
    const a = await me.query(api.aggregate.ahead, {
      today: local(9, 4),
      days: 60,
      monthStart: local(9, 1),
      past: PAST,
    })
    expect(a.events.some((e) => e.name === 'Condominium')).toBe(false)
    expect(
      a.eachMonth.groups.find((g) => g.names.includes('Condominium'))?.sum,
    ).toBeGreaterThanOrEqual(35)
  })
})

describe('recurring.rename and aggregate.payMonthDetail', () => {
  test('his name stays: no longer NEW, never renamed by the app', async () => {
    const { t, me, them } = setup()
    await world(t)
    await me.mutation(api.recurring.find, {})
    const edp = await t.run(async (ctx) =>
      (await ctx.db.query('recurring').collect()).find(
        (i) => i.matchKey === 'EDP COMERCIAL',
      ),
    )
    await expect(
      them.mutation(api.recurring.rename, { id: edp!._id, name: 'x' }),
    ).rejects.toThrow()
    await me.mutation(api.recurring.rename, {
      id: edp!._id,
      name: 'Electricity',
    })
    await me.mutation(api.recurring.find, {})
    const after = await t.run((ctx) => ctx.db.get(edp!._id))
    expect(after?.name).toBe('Electricity')
    expect(after?.foundAt).toBeUndefined()
  })

  test('opens a pay month into its bills, groups and money in — only his', async () => {
    const { t, me, them } = setup()
    await world(t)
    await me.mutation(api.recurring.find, {})
    const args = {
      start: at(7, 25),
      end: at(8, 25),
      prev: null,
      today: local(9, 4),
    }
    const d = await me.query(api.aggregate.payMonthDetail, args)
    expect(d.bills.map((b) => b.row.amount)).toEqual([30, 6, 6])
    expect(d.moneyIn.map((m) => [m.row.amount, m.salary])).toEqual([
      [2000, true],
      [3, false],
    ])
    /* The insurance (home), the café (eating out); the gym is a bill. */
    expect(d.groups.map((g) => [g.category, g.sum])).toEqual([
      ['home', 220],
      ['eating out', 4],
    ])
    const theirs = await them.query(api.aggregate.payMonthDetail, args)
    expect(theirs).toEqual({
      bills: [],
      todo: [],
      groups: [],
      moneyIn: [],
      lent: [],
    })
  })
})

describe('logs.refile', () => {
  test('moves a payee to another group: every row of it, and the ones to come', async () => {
    const { t, me, them } = setup()
    const { bank } = await world(t)
    const [a, b] = await t.run(async (ctx) => {
      const mk = (d: number) =>
        ctx.db.insert('logs', {
          ownerId: ME,
          area: 'money',
          kind: 'expense',
          occurredAt: at(8, d),
          value: 57,
          unit: 'eur',
          text: 'COMPRA 2789 EST SERVICO VEIGA',
          accountId: bank,
          meta: {
            merchant: 'COMPRA 2789 EST SERVICO VEIGA',
            category: 'shopping',
          },
        })
      return [await mk(9), await mk(19)]
    })
    await expect(
      them.mutation(api.logs.refile, { logId: a, category: 'car' }),
    ).rejects.toThrow()
    expect(
      await me.mutation(api.logs.refile, { logId: a, category: 'car' }),
    ).toBe(2)
    const rows = await t.run(async (ctx) => [
      await ctx.db.get(a),
      await ctx.db.get(b),
    ])
    expect(rows.map((r) => r?.meta?.category)).toEqual(['car', 'car'])
    const rule = await t.run((ctx) => ctx.db.query('merchantRules').collect())
    expect(rule.map((r) => [r.key, r.category])).toEqual([
      ['compra est servico veiga', 'car'],
    ])
  })
})

describe('payees', () => {
  async function paypal(
    t: ReturnType<typeof setup>['t'],
    bank: Id<'accounts'>,
  ) {
    return await t.run(async (ctx) => {
      const mk = (d: number, raw: string, value: number) =>
        ctx.db.insert('logs', {
          ownerId: ME,
          area: 'money',
          kind: 'expense',
          occurredAt: at(8, d),
          value,
          unit: 'eur',
          text: 'PayPal Europe',
          accountId: bank,
          meta: { raw, merchant: 'PayPal Europe', category: 'subscriptions' },
        })
      return {
        a: await mk(1, 'DD PAYPAL EUROPE 5D4J2254EVNWL LU96', 121),
        b: await mk(29, 'DD PayPal Europe 5D4J2254EVNWL LU96', 124),
        other: await mk(12, 'DD PAYPAL EUROPE 7XK2P99LMQRSZ LU96', 40),
      }
    })
  }

  test('a PayPal payment is named on its own — Preply one day, a jacket the next', async () => {
    const { t, me, them } = setup()
    const { bank } = await world(t)
    const ids = await paypal(t, bank)
    await expect(
      them.mutation(api.payees.set, {
        logId: ids.a,
        name: 'x',
        domain: null,
        category: null,
        partOf: null,
      }),
    ).rejects.toThrow()
    const n = await me.mutation(api.payees.set, {
      logId: ids.a,
      name: 'Preply',
      domain: 'preply.com',
      category: 'learning',
      partOf: null,
    })
    expect(n).toBe(1)
    const rows = await t.run(async (ctx) =>
      Promise.all([ids.a, ids.b, ids.other].map((id) => ctx.db.get(id))),
    )
    expect(rows.map((r) => [r?.meta?.payee, r?.meta?.category])).toEqual([
      ['Preply', 'learning'],
      [undefined, 'subscriptions'],
      [undefined, 'subscriptions'],
    ])
    /* No payee for all of PayPal, and no merchant rule. */
    expect(await me.query(api.payees.list, {})).toEqual([])
    expect(
      await t.run((ctx) => ctx.db.query('merchantRules').collect()),
    ).toEqual([])
    /* Named and lent at once: lent stays. */
    await me.mutation(api.payees.set, {
      logId: ids.b,
      name: 'Ivan',
      domain: null,
      category: 'lent',
      partOf: null,
    })
    expect((await t.run((ctx) => ctx.db.get(ids.b)))?.meta).toMatchObject({
      payee: 'Ivan',
      category: 'lent',
    })
    /* The next one is one tap: the names he used before. */
    expect(await me.query(api.payees.paypalNames, {})).toEqual([
      { name: 'Ivan', category: 'lent' },
      { name: 'Preply', category: 'learning' },
    ])
    expect(await them.query(api.payees.paypalNames, {})).toEqual([])
  })

  test('a bill paid to a payee takes his name', async () => {
    const { t, me } = setup()
    const { bank } = await world(t)
    const loan = await t.run(async (ctx) => {
      const mk = (m: number) =>
        ctx.db.insert('logs', {
          ownerId: ME,
          area: 'money',
          kind: 'expense',
          occurredAt: at(m, 1),
          value: 700,
          unit: 'eur',
          text: 'Habitação e Rendas',
          accountId: bank,
          meta: {
            raw: 'JUROS DE EMPRESTIMO - 0065',
            merchant: 'Habitação e Rendas',
            category: 'home',
          },
        })
      await mk(7)
      return await mk(8)
    })
    await me.mutation(api.recurring.find, {})
    await me.mutation(api.payees.set, {
      logId: loan,
      name: 'Mortgage · interest',
      domain: null,
      category: 'home',
      partOf: 'Mortgage',
    })
    const bill = await t.run(async (ctx) =>
      (await ctx.db.query('recurring').collect()).find(
        (b) => b.matchKey === 'JUROS EMPRESTIMO',
      ),
    )
    expect(bill?.name).toBe('Mortgage · interest')
  })
})
