/* The pay month (4 Oct, his pick): from one salary to the next, because
   "I get salary in the end of the month so in will always be 0 till end
   of the month". Every day here is noon UTC (noonOf), the time statement
   rows carry, so dates hold across clock changes.

   Each pay month splits what moved into salary, other money in, bills
   (rows that pay one of his bills) and day-to-day (everything else out).
   The balance is in − out of that pay month — his "monthly balance", not
   what he holds. Moves between his accounts are never rows here. */

import { dueDay, dueOn } from './bills'
import { noonOf, paysBill } from './ahead'
import type { AheadBill, AheadRow } from './ahead'

const DAY = 86_400_000

export type PayMonth = {
  /** Noon UTC of the salary day that opened it. */
  start: number
  /** Noon UTC of the next salary — landed, or expected. */
  end: number
  salary: number
  other: number
  bills: number
  dayToDay: number
}

const cents = (n: number) => Math.round(n * 100) / 100
const daysApart = (a: number, b: number) => Math.round((b - a) / DAY)

/** When this salary comes next after a day: its bill day, next month. */
function nextSalary(bill: AheadBill, after: number): number {
  const d = new Date(after)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  const day = dueDay(bill, y + Math.floor(m / 12), m % 12) ?? bill.day
  return Date.UTC(y + Math.floor(m / 12), m % 12, day, 12)
}

function split(
  rows: ReadonlyArray<AheadRow>,
  bills: ReadonlyArray<AheadBill>,
  salary: AheadBill,
  start: number,
  end: number,
) {
  let s = 0
  let o = 0
  let b = 0
  let d = 0
  const paid: Array<{ name: string; amount: number; t: number }> = []
  for (const r of rows) {
    if (r.t < start || r.t >= end) continue
    if (r.kind === 'income') {
      if (paysBill(salary, r)) s += r.amount
      else o += r.amount
      continue
    }
    const bill = bills.find((x) => x.kind === 'expense' && paysBill(x, r))
    if (bill) {
      b += r.amount
      paid.push({ name: bill.name, amount: r.amount, t: r.t })
    } else d += r.amount
  }
  return {
    month: {
      start,
      end,
      salary: cents(s),
      other: cents(o),
      bills: cents(b),
      dayToDay: cents(d),
    },
    paid,
  }
}

/**
 * The current pay month and up to five before it, from his rows and
 * bills. Null when no salary is known yet: a month cannot start on a
 * salary the app has not found.
 */
export function payMonths(input: {
  rows: ReadonlyArray<AheadRow>
  bills: ReadonlyArray<AheadBill>
  /** Local midnight of today. */
  today: number
}) {
  const salary = input.bills
    .filter((b) => b.kind === 'income')
    .sort((a, b) => b.amount - a.amount)
    .at(0)
  if (!salary) return null
  const today = noonOf(input.today)

  /* The days the salary landed, oldest first; one a week at most. */
  const landed: Array<number> = []
  for (const r of [...input.rows].sort((a, b) => a.t - b.t)) {
    if (r.kind !== 'income' || r.t > today || !paysBill(salary, r)) continue
    const day = noonOf(r.t - 12 * 3_600_000)
    if (landed.length && day - (landed.at(-1) ?? 0) < 7 * DAY) continue
    landed.push(day)
  }
  const last = landed.at(-1)
  if (last === undefined) return null

  const expected = nextSalary(salary, last)
  const months = landed.map((start, i) =>
    split(input.rows, input.bills, salary, start, landed.at(i + 1) ?? expected),
  )
  const current = months.at(-1)
  if (!current) return null
  const prev = months.at(-2)

  /* Bills still to pay before the next salary: due from tomorrow, not
     already paid inside this pay month. */
  let billsLeft = 0
  for (const b of input.bills) {
    if (b.kind !== 'expense') continue
    for (let t = today + DAY; t < expected; t += DAY) {
      const d = new Date(t)
      if (!dueOn(b, d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) {
        continue
      }
      const paidAlready = current.paid.some(
        (p) => p.name === b.name && Math.abs(p.t - t) < 20 * DAY,
      )
      if (!paidAlready) billsLeft += b.amount
    }
  }

  /* Day-to-day against the pay month before, by the same day. */
  const day = daysApart(last, today)
  const pace = prev
    ? {
        now: current.month.dayToDay,
        last: split(
          input.rows,
          input.bills,
          salary,
          prev.month.start,
          Math.min(prev.month.start + (day + 1) * DAY, prev.month.end),
        ).month.dayToDay,
      }
    : null

  const m = current.month
  return {
    salaryName: salary.name,
    current: {
      ...m,
      day,
      length: daysApart(last, expected),
      balance: cents(m.salary + m.other - m.bills - m.dayToDay),
      billsLeft: cents(billsLeft),
      /** The 25th passed and no salary was read. */
      salaryLate: today >= expected,
      /** Day-to-day now, and the pay month before by the same day. */
      pace,
      paid: current.paid.sort((a, b) => a.t - b.t),
    },
    past: months
      .slice(0, -1)
      .slice(-5)
      .map((x) => x.month),
  }
}

/** A row as SPENDING shows it: where it came from, not only what. */
export type DetailRow = AheadRow & {
  name: string
  raw?: string
  category?: string
  accountId?: string
}

/**
 * One pay month opened (4 Oct: "Bills, daytoday I would love to see those
 * exactly values and where they come from"): the bill payments with the
 * bill each paid, the bills still due before `end` from `today`, the
 * day-to-day by group with every row and the same group's sum in the
 * month before, and the money in. The three sums are the pay month's own.
 */
export function payMonthDetail(input: {
  rows: ReadonlyArray<DetailRow>
  bills: ReadonlyArray<AheadBill>
  start: number
  end: number
  /** The pay month before, for each group's last figure. */
  prev: { start: number; end: number } | null
  /** Local midnight of today; bills due after it and before `end` are
      still to pay. */
  today: number
}) {
  const inside = (r: DetailRow, s: number, e: number) => r.t >= s && r.t < e
  const billOf = (r: DetailRow) =>
    input.bills.find((b) => b.kind === r.kind && paysBill(b, r))
  const salary = input.bills
    .filter((b) => b.kind === 'income')
    .sort((a, b) => b.amount - a.amount)
    .at(0)

  const rows = input.rows.filter((r) => inside(r, input.start, input.end))
  const paid = rows
    .filter((r) => r.kind === 'expense' && billOf(r))
    .map((r) => ({ row: r, bill: billOf(r) as AheadBill }))
    .sort((a, b) => a.row.t - b.row.t)

  const todo: Array<{ bill: AheadBill; t: number }> = []
  const from = Math.max(noonOf(input.today) + DAY, input.start)
  for (const b of input.bills) {
    if (b.kind !== 'expense') continue
    for (let t = from; t < input.end; t += DAY) {
      const d = new Date(t)
      if (!dueOn(b, d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())) {
        continue
      }
      if (!paid.some((p) => p.bill.id === b.id)) todo.push({ bill: b, t })
    }
  }
  todo.sort((a, b) => a.t - b.t)

  const lastBy = new Map<string, number>()
  if (input.prev) {
    for (const r of input.rows) {
      if (
        r.kind !== 'expense' ||
        !inside(r, input.prev.start, input.prev.end)
      ) {
        continue
      }
      if (billOf(r)) continue
      const k = r.category ?? ''
      lastBy.set(k, (lastBy.get(k) ?? 0) + Math.round(r.amount * 100))
    }
  }
  const groups = new Map<
    string,
    { category: string | null; c: number; rows: Array<DetailRow> }
  >()
  for (const r of rows) {
    if (r.kind !== 'expense' || billOf(r)) continue
    const k = r.category ?? ''
    const g = groups.get(k) ?? { category: r.category ?? null, c: 0, rows: [] }
    g.c += Math.round(r.amount * 100)
    g.rows.push(r)
    groups.set(k, g)
  }

  return {
    bills: paid,
    todo,
    groups: [...groups.entries()]
      .map(([k, g]) => ({
        category: g.category,
        sum: g.c / 100,
        last: input.prev ? (lastBy.get(k) ?? 0) / 100 : null,
        rows: g.rows.sort((a, b) => b.t - a.t),
      }))
      .sort((a, b) => b.sum - a.sum),
    moneyIn: rows
      .filter((r) => r.kind === 'income')
      .map((r) => ({ row: r, salary: salary ? paysBill(salary, r) : false }))
      .sort((a, b) => a.row.t - b.row.t),
  }
}
