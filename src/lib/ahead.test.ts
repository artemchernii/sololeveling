import { describe, expect, it } from 'vitest'

import {
  billsEachMonth,
  buildAhead,
  payingRow,
  paysBill,
  salaryBill,
  yearAhead,
} from './ahead'
import { payeeKey } from './payee'
import type { AheadBill, AheadRow } from './ahead'

/* Local midnights in Lisbon (vitest pins TZ). */
const day = (m: number, d: number) => new Date(2026, m, d).getTime()
const TODAY = day(9, 4)

const bill = (over: Partial<AheadBill>): AheadBill => ({
  id: 'b',
  name: 'Bill',
  kind: 'expense',
  amount: 100,
  accountId: 'bank',
  cadence: 'monthly',
  day: 10,
  key: 'BILL',
  ...over,
})
const row = (over: Partial<AheadRow>): AheadRow => ({
  id: 'r',
  kind: 'expense',
  amount: 100,
  t: day(9, 1),
  key: 'BILL',
  ...over,
})

const base = {
  today: TODAY,
  days: 30,
  monthStart: day(9, 1),
  monthRows: [],
  past: [],
  free: [{ accountId: 'bank', eur: 1000 }],
}

/* His 23 Oct: BNP Paribas paid €2,674.76 of salary and €80 of commute
   pay, and the €80 was found as a bill of its own. */
describe('salaryBill · payingRow', () => {
  const bnp = { kind: 'income' as const, key: 'BNP PARIBAS' }
  const commute = bill({ ...bnp, id: 'commute', amount: 80, day: 23 })
  const salary = bill({ ...bnp, id: 'salary', amount: 2668.98, day: 25 })
  const rows = [
    row({ ...bnp, id: 'r80', amount: 80 }),
    row({ ...bnp, id: 'r2674', amount: 2674.76 }),
  ]

  it('the salary is the biggest income bill', () => {
    expect(salaryBill([commute, salary])?.id).toBe('salary')
    expect(salaryBill([salary, commute, bill({})])?.id).toBe('salary')
    expect(salaryBill([bill({})])).toBeUndefined()
  })

  it('the row nearest the bill pays it', () => {
    expect(payingRow(salary, rows)?.id).toBe('r2674')
    expect(payingRow(commute, rows)?.id).toBe('r80')
    expect(payingRow(salary, [])).toBeUndefined()
  })

  it('one that varies: the biggest row', () => {
    const varies = { ...salary, varies: true, amount: 100 }
    expect(payingRow(varies, rows)?.id).toBe('r2674')
    expect(payingRow(varies, [...rows].reverse())?.id).toBe('r2674')
  })
})

describe('paysBill', () => {
  it('matches the payee near the amount, or a row that names the bill', () => {
    expect(paysBill(bill({}), row({ amount: 112 }))).toBe(true)
    expect(paysBill(bill({}), row({ amount: 130 }))).toBe(false)
    expect(paysBill(bill({}), row({ key: 'OTHER' }))).toBe(false)
    expect(paysBill(bill({}), row({ key: 'OTHER', recurringId: 'b' }))).toBe(
      true,
    )
    expect(paysBill(bill({}), row({ kind: 'income' }))).toBe(false)
  })

  it("matches BPI's longer EDP line to the EDP bill (29 Oct)", () => {
    /* His bill as dev holds it: matchKey from August's statement. */
    const edp = bill({ key: 'EDP COMERCIAL COMERCIALIZACAO', amount: 29.11 })
    const paid = row({
      key: payeeKey('DD EDP COMERCIAL-COMERCIAL.ENERGIA S.A'),
      amount: 29.55,
    })
    expect(paysBill(edp, paid)).toBe(true)
    expect(
      paysBill(bill({ key: 'UBER' }), row({ key: 'UBER EATS', amount: 112 })),
    ).toBe(false)
  })

  it('takes any amount to the payee for one that varies', () => {
    expect(paysBill(bill({ varies: true }), row({ amount: 4.77 }))).toBe(true)
    expect(paysBill(bill({ varies: true }), row({ key: 'OTHER' }))).toBe(false)
  })
})

describe('buildAhead', () => {
  it('puts each bill on its day and moves the line by it', () => {
    const a = buildAhead({
      ...base,
      days: 40,
      bills: [
        bill({}),
        bill({
          id: 's',
          kind: 'income',
          amount: 2000,
          day: 25,
          name: 'Salary',
        }),
      ],
    })
    expect(a.events.map((e) => [new Date(e.t).getDate(), e.name])).toEqual([
      [10, 'Bill'],
      [25, 'Salary'],
      [10, 'Bill'],
    ])
    const at = (m: number, d: number) =>
      a.series.find((p) => p.t === Date.UTC(2026, m, d, 12))!
    expect(at(9, 9).bills).toBe(1000)
    expect(at(9, 10).bills).toBe(900)
    expect(at(9, 25).bills).toBe(2900)
  })

  it('marks a payment the account cannot cover that day', () => {
    const a = buildAhead({
      ...base,
      free: [{ accountId: 'bank', eur: 60 }],
      bills: [bill({})],
    })
    expect(a.events[0]).toMatchObject({ short: true, held: 60, add: 40 })
  })

  it('says nothing for an account that can pay', () => {
    const a = buildAhead({ ...base, days: 70, bills: [bill({})] })
    expect(a.events.some((e) => e.short || e.add !== null)).toBe(false)
    expect(a.later).toEqual([])
  })

  it('tags the first short payment only, and gives a later month its sum', () => {
    const a = buildAhead({
      ...base,
      days: 70,
      free: [{ accountId: 'bank', eur: 60 }],
      bills: [bill({})],
    })
    expect(a.events.map((e) => [e.short, e.add])).toEqual([
      [true, 40],
      [false, null],
      [false, null],
    ])
    expect(a.later).toEqual([
      { month: 2026 * 12 + 10, accountId: 'bank', amount: 100 },
      { month: 2026 * 12 + 11, accountId: 'bank', amount: 100 },
    ])
  })

  it('asks for nothing in a month the salary already covers', () => {
    const a = buildAhead({
      ...base,
      days: 40,
      free: [{ accountId: 'bank', eur: 60 }],
      bills: [
        bill({}),
        bill({ id: 's', kind: 'income', amount: 2000, day: 25, name: 'Pay' }),
      ],
    })
    expect(a.events.filter((e) => e.short)).toHaveLength(1)
    expect(a.later).toEqual([])
  })

  it('adds up a month where two payments are short: one tag, one sum', () => {
    const a = buildAhead({
      ...base,
      free: [{ accountId: 'bank', eur: 60 }],
      bills: [bill({}), bill({ id: 'c', day: 20, amount: 30, key: 'C' })],
    })
    expect(a.events.map((e) => [e.short, e.add])).toEqual([
      [true, 70],
      [false, null],
    ])
    expect(a.later).toEqual([])
  })

  it('shows this month’s paid bills with their row, and does not ask again', () => {
    const a = buildAhead({
      ...base,
      bills: [
        bill({ day: 1 }),
        bill({ id: 'late', day: 2, key: 'LATE' }),
        bill({ id: 'early', day: 20, key: 'EARLY' }),
      ],
      monthRows: [
        row({ id: 'r1' }),
        row({ id: 'r3', key: 'EARLY', t: day(9, 3) }),
      ],
    })
    expect(a.done.map((d) => [d.billId, d.rowId])).toEqual([
      ['b', 'r1'],
      ['late', null],
    ])
    /* Paid early this month: next due in November, not on the 20th. */
    expect(
      a.events
        .filter((e) => e.billId === 'early')
        .map((e) => new Date(e.t).getMonth()),
    ).toEqual([])
  })

  it('adds up the month’s payments of one that varies', () => {
    const a = buildAhead({
      ...base,
      bills: [bill({ day: 1, amount: 250, varies: true })],
      monthRows: [
        row({ id: 'r1', amount: 120 }),
        row({ id: 'r2', amount: 4.77, t: day(9, 3) }),
      ],
    })
    expect(a.done).toEqual([
      expect.objectContaining({ billId: 'b', amount: 124.77, rowId: 'r1' }),
    ])
    /* Not paid yet: last month's sum stands. */
    const b = buildAhead({
      ...base,
      bills: [bill({ day: 1, amount: 250, varies: true })],
    })
    expect(b.done).toEqual([
      expect.objectContaining({ amount: 250, rowId: null }),
    ])
  })

  it('leaves a month a bank was only partly read out of the range', () => {
    const spend = (m: number, amount: number) =>
      row({ key: 'SHOP', amount, t: day(m, 15) })
    const a = buildAhead({
      ...base,
      bills: [],
      past: [
        { start: day(7, 1), rows: [spend(7, 300)], partial: ['BPI'] },
        { start: day(8, 1), rows: [spend(8, 900)] },
      ],
    })
    expect(a.range).toEqual({ lo: 900, hi: 900 })
    expect(a.rest.map((r) => r.partial)).toEqual([['BPI'], []])
    /* Only partial months: they are all there is. */
    const b = buildAhead({
      ...base,
      bills: [],
      past: [{ start: day(7, 1), rows: [spend(7, 300)], partial: ['BPI'] }],
    })
    expect(b.range).toEqual({ lo: 300, hi: 300 })
  })

  it('takes the rest off as a range of real months, leaving unread months out', () => {
    const a = buildAhead({
      ...base,
      bills: [bill({})],
      past: [
        { start: day(6, 1), rows: [] },
        {
          start: day(7, 1),
          rows: [row({ key: 'X', amount: 600 }), row({ amount: 100 })],
        },
        { start: day(8, 1), rows: [row({ key: 'X', amount: 900 })] },
      ],
    })
    /* August's bill payment is not "the rest". */
    expect(a.rest.map((r) => r.sum)).toEqual([600, 900])
    expect(a.range).toEqual({ lo: 600, hi: 900 })
    const last = a.series.at(-1)!
    expect(last.upper).toBe(last.bills - 600)
    expect(last.lower).toBe(last.bills - 900)
  })

  it('has no range and a flat edge when nothing was read', () => {
    const a = buildAhead({ ...base, bills: [] })
    expect(a.range).toBeNull()
    expect(a.series.every((p) => p.upper === 1000 && p.lower === 1000)).toBe(
      true,
    )
  })

  it('finds the lowest point before the next salary', () => {
    const a = buildAhead({
      ...base,
      bills: [
        bill({ day: 20, amount: 500 }),
        bill({ id: 's', kind: 'income', amount: 2000, day: 25 }),
      ],
    })
    expect(new Date(a.low.t).getDate()).toBe(20)
    expect(a.low.bills).toBe(500)
  })
})

describe('yearAhead', () => {
  it('sums the next twelve months and lists the once-a-year ones', () => {
    const y = yearAhead(
      [
        bill({ amount: 10 }),
        bill({
          id: 'y',
          cadence: 'yearly',
          month: 0,
          day: 20,
          amount: 120,
          name: 'Car tax',
        }),
      ],
      TODAY,
    )
    expect(y.total).toBe(240)
    expect(y.yearly).toEqual([
      expect.objectContaining({ name: 'Car tax', amount: 120 }),
    ])
  })

  it('keeps a bill on the last day of a month in that month', () => {
    const y = yearAhead([bill({ day: 31, amount: 10 })], TODAY)
    expect(y.months[0]).toEqual({ month: 2026 * 12 + 9, sum: 10 })
  })
})

describe('billsEachMonth', () => {
  it('puts the mortgage beside the subscriptions, yearly ones apart, salary out', () => {
    const m = billsEachMonth([
      bill({ name: 'Interest', amount: 750, category: 'home' }),
      bill({ name: 'Capital', amount: 450, category: 'home' }),
      bill({ name: 'Claude', amount: 22, category: 'subscriptions' }),
      bill({ name: 'Car tax', amount: 120, cadence: 'yearly', month: 0 }),
      bill({ name: 'Salary', kind: 'income', amount: 2000 }),
    ])
    expect(m.total).toBe(1222)
    expect(m.groups).toEqual([
      { category: 'home', sum: 1200, names: ['Interest', 'Capital'] },
      { category: 'subscriptions', sum: 22, names: ['Claude'] },
    ])
    expect(m.yearly).toEqual({ total: 120, count: 1 })
  })
})
