import { describe, expect, it } from 'vitest'

import { payMonthDetail, payMonths } from './payMonth'
import type { AheadBill, AheadRow } from './ahead'

/* Rows at noon UTC; today a Lisbon midnight (vitest pins the zone). */
const at = (m: number, d: number) => Date.UTC(2026, m - 1, d, 12)
const today = (m: number, d: number) => new Date(2026, m - 1, d).getTime()

const bill = (over: Partial<AheadBill>): AheadBill => ({
  id: 'b',
  name: 'Bill',
  kind: 'expense',
  amount: 100,
  cadence: 'monthly',
  day: 1,
  key: 'BILL',
  ...over,
})
const SALARY = bill({
  id: 's',
  name: 'Salary',
  kind: 'income',
  amount: 2500,
  day: 25,
  key: 'ACME',
})
const LOAN = bill({ id: 'l', name: 'Loan', amount: 1200, day: 1, key: 'LOAN' })
const PHONE = bill({
  id: 'p',
  name: 'Phone',
  amount: 10,
  day: 10,
  key: 'PHONE',
})

let n = 0
const row = (
  m: number,
  d: number,
  key: string,
  amount: number,
  kind: 'expense' | 'income' = 'expense',
): AheadRow => ({
  id: `r${++n}`,
  kind,
  amount,
  t: at(m, d),
  key,
})

const rows = [
  row(7, 25, 'ACME', 2480, 'income'),
  row(8, 1, 'LOAN', 1200),
  row(8, 3, 'CAFE', 50),
  row(8, 10, 'PHONE', 10),
  row(8, 25, 'ACME', 2500, 'income'),
  row(8, 30, 'CAFE', 40),
  row(9, 1, 'LOAN', 1200),
  row(9, 2, 'CAFE', 30),
  row(9, 14, 'REFUND', 140, 'income'),
  row(9, 25, 'ACME', 2520, 'income'),
  row(9, 28, 'CAFE', 100),
  row(10, 1, 'LOAN', 1200),
  row(10, 2, 'CAFE', 20),
]

describe('payMonths', () => {
  it('runs from salary to salary, split into salary, other in, bills and day-to-day', () => {
    const p = payMonths({
      rows,
      bills: [SALARY, LOAN, PHONE],
      today: today(10, 4),
    })!
    expect(
      p.past.map((m) => [
        new Date(m.start).getUTCDate(),
        m.salary,
        m.other,
        m.bills,
        m.dayToDay,
      ]),
    ).toEqual([
      [25, 2480, 0, 1210, 50],
      [25, 2500, 140, 1200, 70],
    ])
    expect(p.current).toMatchObject({
      start: at(9, 25),
      end: at(10, 25),
      day: 9,
      length: 30,
      salary: 2520,
      bills: 1200,
      dayToDay: 120,
      balance: 1200,
      salaryLate: false,
    })
  })

  it('says which bills are still to pay before the next salary', () => {
    const p = payMonths({
      rows,
      bills: [SALARY, LOAN, PHONE],
      today: today(10, 4),
    })!
    /* The loan is paid (1 Oct); the phone on the 10th is still to come. */
    expect(p.current.billsLeft).toBe(10)
    expect(p.current.paid.map((x) => x.name)).toEqual(['Loan'])
  })

  it('compares day-to-day with the pay month before, by the same day', () => {
    const p = payMonths({
      rows,
      bills: [SALARY, LOAN, PHONE],
      today: today(10, 4),
    })!
    /* 25 Aug + 9 days: the €40 on 30 Aug and the €30 on 2 Sep. */
    expect(p.current.pace).toEqual({ now: 120, last: 70 })
  })

  it('stays open, and says so, when the salary is late', () => {
    const p = payMonths({ rows, bills: [SALARY, LOAN], today: today(10, 27) })!
    expect(p.current.salaryLate).toBe(true)
    expect(p.current.start).toBe(at(9, 25))
  })

  it('is nothing until a salary is known and has landed', () => {
    expect(payMonths({ rows, bills: [LOAN], today: today(10, 4) })).toBeNull()
    expect(
      payMonths({ rows: [], bills: [SALARY], today: today(10, 4) }),
    ).toBeNull()
  })
})

describe('payMonthDetail', () => {
  const detail = rows.map((r) => ({
    ...r,
    name: r.key,
    category: r.key === 'CAFE' ? 'eating out' : undefined,
  }))
  const open = () =>
    payMonthDetail({
      rows: detail,
      bills: [SALARY, LOAN, PHONE],
      start: at(9, 25),
      end: at(10, 25),
      prev: { start: at(8, 25), end: at(9, 25) },
      today: today(10, 4),
    })

  it('opens the pay month into its bills, what is still to pay, groups and money in', () => {
    const d = open()
    expect(d.bills.map((b) => [b.bill.name, b.row.amount])).toEqual([
      ['Loan', 1200],
    ])
    expect(
      d.todo.map((x) => [x.bill.name, new Date(x.t).getUTCDate()]),
    ).toEqual([['Phone', 10]])
    expect(d.groups).toEqual([
      expect.objectContaining({ category: 'eating out', sum: 120, last: 70 }),
    ])
    expect(d.groups[0].rows.map((r) => r.amount)).toEqual([20, 100])
    expect(d.moneyIn.map((m) => [m.row.amount, m.salary])).toEqual([
      [2520, true],
    ])
  })

  it('adds up to the pay month it opens', () => {
    const d = open()
    const p = payMonths({
      rows,
      bills: [SALARY, LOAN, PHONE],
      today: today(10, 4),
    })!
    expect(d.bills.reduce((sum, b) => sum + b.row.amount, 0)).toBe(
      p.current.bills,
    )
    expect(d.groups.reduce((sum, g) => sum + g.sum, 0)).toBe(p.current.dayToDay)
  })
})
