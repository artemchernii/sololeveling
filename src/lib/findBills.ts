/* Bills found in his statements (Flow, 3 Oct). He: asking about a €5.99
   Uber One is "a lot of hustle"; the mortgage, Vodafone, the gym are what
   he means by bills. So the app decides and he corrects: what passes these
   rules goes onto its day with no question, and × takes it off for good.

   The rules, on his real rows: same payee key (src/lib/payee) in two of
   the last three months, one payment a month (his gym is every two weeks
   and his Vodafone top-ups come when they come — neither is a monthly
   bill), amounts within 10%, days of the month within 3, the last one
   inside six weeks, at least €2 (a €0.54 toll twice is not a bill). Pure,
   so it is tested here; convex/recurring.ts feeds it. */

export type BillRow = {
  /** payeeKey of the row. */
  key: string
  name: string
  kind: 'expense' | 'income'
  /** Euros, positive. */
  amount: number
  /** Epoch ms. Statement rows sit at noon UTC, so the UTC date is the day. */
  t: number
  accountId?: string
  category?: string
}

export type FoundBill = {
  key: string
  name: string
  kind: 'expense' | 'income'
  /** The latest payment's amount. */
  amount: number
  /** Day of the month of the latest payment. */
  day: number
  accountId?: string
  category?: string
}

const DAY = 86_400_000
export const MIN_BILL = 2
const SAME_AMOUNT = 0.1
const SAME_DAY = 3

const monthOf = (t: number) => {
  const d = new Date(t)
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}

/** Days apart on the month's clock: the 30th and the 1st are 2 apart. */
export function dayGap(a: number, b: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, 31 - d)
}

/** Two amounts that are the same bill: within 10% of the larger. */
export function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) <= SAME_AMOUNT * Math.max(a, b)
}

/** A bill he has, or one he said is not: a payee at an amount. One payee
    can be two bills (interest and capital), so the key alone is not it. */
export type Known = { key: string; amount: number }

export function isKnown(
  known: ReadonlyArray<Known>,
  r: { key: string; amount: number },
): boolean {
  return known.some((k) => k.key === r.key && sameAmount(k.amount, r.amount))
}

/**
 * The monthly bills in `rows`, leaving out what is `known` (bills he has,
 * and ones he said are not). `now` is epoch ms.
 */
export function findBills(
  rows: ReadonlyArray<BillRow>,
  known: ReadonlyArray<Known>,
  now: number,
): Array<FoundBill> {
  const thisMonth = monthOf(now)
  const recent = rows.filter(
    (r) =>
      r.key !== '' &&
      r.amount >= MIN_BILL &&
      monthOf(r.t) > thisMonth - 3 &&
      r.t <= now,
  )
  const byKey = new Map<string, Array<BillRow>>()
  for (const r of recent) {
    const k = `${r.kind}:${r.key}`
    byKey.set(k, [...(byKey.get(k) ?? []), r])
  }

  const found: Array<FoundBill> = []
  for (const list of byKey.values()) {
    /* One payee can be two bills (salary and a bonus, interest and
       capital): group by amount, newest first. */
    const sorted = [...list].sort((a, b) => b.t - a.t)
    const groups: Array<Array<BillRow>> = []
    for (const r of sorted) {
      const g = groups.find((x) => sameAmount(x[0].amount, r.amount))
      if (g) g.push(r)
      else groups.push([r])
    }
    for (const g of groups) {
      const latest = g[0]
      if (isKnown(known, latest)) continue
      if (now - latest.t > 42 * DAY) continue
      const months = g.map((r) => monthOf(r.t))
      if (new Set(months).size < 2) continue
      if (new Set(months).size !== months.length) continue
      const day = new Date(latest.t).getUTCDate()
      if (g.some((r) => dayGap(new Date(r.t).getUTCDate(), day) > SAME_DAY)) {
        continue
      }
      found.push({
        key: latest.key,
        name: latest.name,
        kind: latest.kind,
        amount: latest.amount,
        day,
        accountId: latest.accountId,
        category: latest.category,
      })
    }
  }
  return found.sort(
    (a, b) =>
      a.day - b.day || a.key.localeCompare(b.key) || a.amount - b.amount,
  )
}

const title = (key: string) =>
  key
    .toLowerCase()
    .split(' ')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')

/**
 * What a found bill is called. His banks file some rows under their own
 * words — BPI's "Habitação e Rendas" is both halves of the mortgage,
 * "Receitas" is his salary — and a card line can come through raw
 * ("COMPRA 2789 EST SERVICO…"). Then the payee's words name it.
 */
export function billNames(
  found: ReadonlyArray<{ key: string; name: string; kind: string }>,
): Array<string> {
  return found.map((b) => {
    const shared = found.some((o) => o !== b && o.name === b.name)
    const raw = /\d{3,}/.test(b.name) || b.name === b.name.toUpperCase()
    return shared || raw || b.kind === 'income' || b.name.trim() === ''
      ? title(b.key)
      : b.name
  })
}

/** Spending that is everyday, not a bill: never offered as a likely bill. */
export const EVERYDAY = new Set([
  'groceries',
  'eating out',
  'transport',
  'shopping',
  'clothes',
  'fun',
  'other',
])

export type Likely = {
  key: string
  name: string
  amount: number
  t: number
  /** Payments to this payee in the rows given. */
  times: number
  accountId?: string
  category?: string
  /** The latest row, to make the bill from. */
  rowId: string
}

/**
 * What + BILL offers first (3 Oct: "most likely those bills are in
 * statements"): payees he paid that are not bills yet, outside everyday
 * spending, biggest first — the mortgage before a magazine.
 */
export function likelyBills(
  rows: ReadonlyArray<BillRow & { id: string }>,
  known: ReadonlyArray<Known>,
  limit = 8,
): Array<Likely> {
  const byKey = new Map<string, Likely>()
  for (const r of rows) {
    if (r.kind !== 'expense' || r.key === '' || isKnown(known, r)) continue
    if (r.amount < MIN_BILL) continue
    if (r.category === undefined || EVERYDAY.has(r.category)) continue
    const k = `${r.key}:${Math.round(r.amount)}`
    const had = [...byKey.values()].find(
      (x) => x.key === r.key && sameAmount(x.amount, r.amount),
    )
    if (had) {
      had.times++
      if (r.t > had.t) Object.assign(had, latestOf(r))
      continue
    }
    byKey.set(k, { ...latestOf(r), times: 1 })
  }
  return [...byKey.values()].sort((a, b) => b.amount - a.amount).slice(0, limit)
}

function latestOf(r: BillRow & { id: string }) {
  return {
    key: r.key,
    name: r.name,
    amount: r.amount,
    t: r.t,
    accountId: r.accountId,
    category: r.category,
    rowId: r.id,
  }
}
