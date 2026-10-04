/* AHEAD (Flow, 3 Oct): free cash from today, three months out. Pure, so
   aggregate.ahead and its tests agree; the page only draws what this
   returns (CLAUDE.md: components read numbers, never compute them).

   What moves it, his call on 3 Oct: bills and salary on their days, and —
   by default — the rest of his spending as a range, the cheapest and the
   dearest of the last three full months, each a real sum shown beside it.
   Never an average. */

import { dueDay } from './bills'

const DAY = 86_400_000
const NOON = 12 * 3_600_000

export type AheadBill = {
  id: string
  name: string
  kind: 'expense' | 'income'
  amount: number
  accountId?: string
  category?: string
  cadence: 'monthly' | 'yearly'
  day: number
  month?: number
  key: string
  foundAt?: number
  /** Any payment to the payee pays it; the month's payments add up. */
  varies?: boolean
}

export type AheadRow = {
  id: string
  kind: 'expense' | 'income'
  amount: number
  t: number
  key: string
  recurringId?: string
}

/** A row is this bill's payment: it says so, or it is the same payee at
    near the amount (a bill that moves a little — electricity — still
    matches; 15%, looser than finding, which wants 10%). */
export function paysBill(bill: AheadBill, row: AheadRow): boolean {
  if (row.recurringId === bill.id) return true
  if (row.kind !== bill.kind || bill.key === '' || row.key !== bill.key) {
    return false
  }
  if (bill.varies) return true
  return (
    Math.abs(row.amount - bill.amount) <=
    0.15 * Math.max(row.amount, bill.amount)
  )
}

/** The local calendar date of a day that starts at `start` (local
    midnight): its noon, read in UTC, is the same date in Lisbon. */
function dateOf(start: number) {
  const d = new Date(start + NOON)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }
}

export type AheadEvent = {
  /** Noon UTC of its day (noonOf). */
  t: number
  billId: string
  name: string
  kind: 'expense' | 'income'
  amount: number
  accountId?: string
  yearly: boolean
  /** The account will not hold the amount that day. */
  short: boolean
  /** What the account holds just before it, when known. */
  held: number | null
}

export type AheadInput = {
  /** Local midnight of today. */
  today: number
  /** How many days after today. */
  days: number
  bills: ReadonlyArray<AheadBill>
  /** Money rows of this month so far. */
  monthRows: ReadonlyArray<AheadRow>
  /** Local midnight of this month's first day. */
  monthStart: number
  /** The last three full months: every money-out row of each, and whether
      the month had any rows at all (no statement read = left out, not 0). */
  past: ReadonlyArray<{
    start: number
    rows: ReadonlyArray<AheadRow>
    /** Banks whose rows only begin partway through it (4 Oct: BPI read
        from 25 Aug made August look cheap). */
    partial?: ReadonlyArray<string>
  }>
  /** Free cash now, per bank or cash account, in euros. */
  free: ReadonlyArray<{ accountId: string; eur: number }>
}

/** A day as its noon in UTC: the same date read anywhere from Lisbon to
    the Azores, and the time statement rows carry. */
export function noonOf(start: number): number {
  const { y, m, d } = dateOf(start)
  return Date.UTC(y, m, d, 12)
}

const cents = (n: number) => Math.round(n * 100) / 100

/** Bills due between two local midnights, inclusive, in day order. */
export function dueBetween(
  bills: ReadonlyArray<AheadBill>,
  from: number,
  to: number,
): Array<{ t: number; bill: AheadBill }> {
  const out = []
  for (let t = from; t <= to; t += DAY) {
    /* Steps of 24 hours from a local midnight: across a clock change one
       lands an hour off, and its noon is still the same date. */
    const { y, m, d } = dateOf(t)
    for (const bill of bills) {
      if (dueDay(bill, y, m) === d) out.push({ t: noonOf(t), bill })
    }
  }
  return out
}

export function buildAhead(input: AheadInput) {
  const { today, days, bills } = input
  const until = today + days * DAY
  const freeTotal = cents(input.free.reduce((n, a) => n + a.eur, 0))

  /* This month: bills whose day has come, paid (the row) or not seen. */
  const pastDue = dueBetween(bills, input.monthStart, today)
  const done = pastDue.map(({ t, bill }) => {
    const rows = input.monthRows.filter((r) => paysBill(bill, r))
    const row = rows.at(0) ?? null
    /* One that varies is paid by all of the month's payments so far. */
    const paid =
      bill.varies && rows.length
        ? cents(rows.reduce((n, r) => n + r.amount, 0))
        : row?.amount
    return { t, bill, row, paid }
  })
  const paidEarly = new Set(
    bills
      .filter((b) => input.monthRows.some((r) => paysBill(b, r)))
      .map((b) => b.id),
  )

  /* Coming: from tomorrow. One paid early this month is not due again
     this month. */
  const thisMonth = dateOf(today).m
  const coming = dueBetween(bills, today + DAY, until).filter(
    ({ t, bill }) =>
      !(new Date(t).getUTCMonth() === thisMonth && paidEarly.has(bill.id)),
  )

  /* Each account walked forward: a payment it cannot cover is marked. */
  const run = new Map(input.free.map((a) => [a.accountId, a.eur]))
  const events: Array<AheadEvent> = coming.map(({ t, bill }) => {
    const before = bill.accountId ? run.get(bill.accountId) : undefined
    if (bill.accountId && before !== undefined) {
      run.set(
        bill.accountId,
        before + (bill.kind === 'income' ? bill.amount : -bill.amount),
      )
    }
    return {
      t,
      billId: bill.id,
      name: bill.name,
      kind: bill.kind,
      amount: bill.amount,
      accountId: bill.accountId,
      yearly: bill.cadence === 'yearly',
      short:
        bill.kind === 'expense' && before !== undefined && before < bill.amount,
      held: before === undefined ? null : cents(before),
    }
  })

  /* The rest: each past month's money out that is no bill's payment. A
     month with no rows at all was not read, and is left out. */
  const rest = input.past
    .filter((p) => p.rows.length > 0)
    .map((p) => ({
      start: p.start,
      partial: [...(p.partial ?? [])],
      sum: cents(
        p.rows
          .filter(
            (r) => r.kind === 'expense' && !bills.some((b) => paysBill(b, r)),
          )
          .reduce((n, r) => n + r.amount, 0),
      ),
    }))
  /* A month a bank was only partly read is not a real month: the range
     takes whole months, and the partial ones only when there is no other. */
  const whole = rest.filter((r) => r.partial.length === 0)
  const counted = whole.length ? whole : rest
  const range =
    counted.length === 0
      ? null
      : {
          lo: Math.min(...counted.map((r) => r.sum)),
          hi: Math.max(...counted.map((r) => r.sum)),
        }

  /* A point a day. `bills` is free cash moved by bills and salary only;
     `upper` and `lower` take the rest off at the cheapest and dearest
     month's pace (a month counted as 30 days). */
  const series = []
  let moved = 0
  let k = 0
  for (let i = 0; i <= days; i++) {
    const t = noonOf(today + i * DAY)
    while (k < events.length && events[k].t <= t) {
      moved +=
        events[k].kind === 'income' ? events[k].amount : -events[k].amount
      k++
    }
    const b = freeTotal + moved
    series.push({
      t,
      bills: cents(b),
      upper: cents(range ? b - (range.lo / 30) * i : b),
      lower: cents(range ? b - (range.hi / 30) * i : b),
    })
  }

  /* The lowest point before the next salary (or in the whole stretch). */
  const salary = events.find((e) => e.kind === 'income')
  const before = series.filter((p) => !salary || p.t < salary.t)
  const low = before.reduce((a, p) => (p.lower < a.lower ? p : a), before[0])

  return {
    freeTotal,
    done: done.map(({ t, bill, row, paid }) => ({
      t,
      billId: bill.id,
      name: bill.name,
      kind: bill.kind,
      amount: paid ?? bill.amount,
      accountId: bill.accountId,
      rowId: row?.id ?? null,
    })),
    events,
    rest,
    range,
    series,
    low,
    salaryAt: salary?.t ?? null,
  }
}

/** Every bill's payments over the next twelve months, by month, and the
    once-a-year ones — "what I pay this year". */
export function yearAhead(bills: ReadonlyArray<AheadBill>, today: number) {
  const due = dueBetween(
    bills.filter((b) => b.kind === 'expense'),
    today + DAY,
    today + 365 * DAY,
  )
  const months = new Map<number, number>()
  for (const { t, bill } of due) {
    const y = new Date(t).getUTCFullYear()
    const m = new Date(t).getUTCMonth()
    months.set(y * 12 + m, (months.get(y * 12 + m) ?? 0) + bill.amount)
  }
  return {
    total: cents(due.reduce((n, e) => n + e.bill.amount, 0)),
    months: [...months.entries()].map(([month, sum]) => ({
      month,
      sum: cents(sum),
    })),
    yearly: due
      .filter((e) => e.bill.cadence === 'yearly')
      .map((e) => ({ t: e.t, name: e.bill.name, amount: e.bill.amount })),
  }
}

/**
 * His bills as one month (4 Oct: "what about mortgage" — the old box
 * held only what was filed as a subscription): every monthly bill by its
 * group, biggest group first, and the once-a-year ones as their own sum,
 * never spread over twelve months.
 */
export function billsEachMonth(bills: ReadonlyArray<AheadBill>) {
  const out = bills.filter((b) => b.kind === 'expense')
  const monthly = out.filter((b) => b.cadence === 'monthly')
  const groups = new Map<
    string,
    { category: string | null; c: number; names: Array<string> }
  >()
  for (const b of monthly) {
    const k = b.category ?? ''
    const g = groups.get(k) ?? { category: b.category ?? null, c: 0, names: [] }
    g.c += Math.round(b.amount * 100)
    g.names.push(b.name)
    groups.set(k, g)
  }
  const yearly = out.filter((b) => b.cadence === 'yearly')
  return {
    total: monthly.reduce((n, b) => n + Math.round(b.amount * 100), 0) / 100,
    groups: [...groups.values()]
      .sort((a, b) => b.c - a.c)
      .map((g) => ({ category: g.category, sum: g.c / 100, names: g.names })),
    yearly: {
      total: yearly.reduce((n, b) => n + Math.round(b.amount * 100), 0) / 100,
      count: yearly.length,
    },
  }
}
