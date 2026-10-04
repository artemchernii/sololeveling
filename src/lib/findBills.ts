import { payeeKey } from './payee'
import { PHRASES, bankPhrase } from './payees'

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
  /** Its amount changes month to month (his phone top-ups): `amount` is
      the middle of `lo`–`hi`, the last two months' sums; any amount to
      the payee pays it. */
  varies?: boolean
  lo?: number
  hi?: number
  /** Paid every N weeks, counted from `anchor` (a payment's time). */
  everyWeeks?: number
  anchor?: number
  /** One payment covers some months, and only he knows how many (the
      condominium): AHEAD asks once. */
  asksMonths?: boolean
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

/** Spending that is everyday, not a bill: never offered as a likely bill. */
export const EVERYDAY = new Set([
  'groceries',
  'eating out',
  'transport',
  /* 4 Oct: fuel at the same station on the 10th and the 9th is not a
     bill ("i bought fuel/gas on BP station, added to CAR"). */
  'car',
  'shopping',
  'clothes',
  'fun',
  'other',
])

/** A bill he has, or one he said is not: a payee at an amount. One payee
    can be two bills (interest and capital), so the key alone is not it. */
export type Known = { key: string; amount: number; varies?: boolean }

export function isKnown(
  known: ReadonlyArray<Known>,
  r: { key: string; amount: number },
): boolean {
  return known.some(
    (k) => k.key === r.key && (k.varies || sameAmount(k.amount, r.amount)),
  )
}

/** A bill whose amount moves is worth showing from €10 a month: tolls of
    €0.54 and €2.25 are not one (his Via Verde, 4 Oct). */
const MIN_VARIES = 10

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
      /* PayPal is a middleman (4 Oct: "sometimes paypal is preply,
         sometimes I buy clothes online"): never a bill by itself. */
      !r.key.startsWith('PAYPAL') &&
      r.amount >= MIN_BILL &&
      /* A petrol station paid on the 9th twice is not a bill (his rows,
         3 Oct): everyday groups are offered under + BILL, never found. */
      !(r.category !== undefined && EVERYDAY.has(r.category)) &&
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

  /* Every two weeks (4 Oct: his gym, €5.98 on a fortnight's rhythm) or
     every week: three or more payments at one amount, every gap the same
     to a day. Each payment goes on its own day. */
  for (const list of byKey.values()) {
    const asc = [...list].sort((a, b) => a.t - b.t)
    const latest = asc.at(-1)
    if (!latest || latest.kind !== 'expense' || asc.length < 3) continue
    if (known.some((k) => k.key === latest.key)) continue
    if (found.some((f) => f.key === latest.key)) continue
    if (now - latest.t > 21 * DAY) continue
    if (!asc.every((r) => sameAmount(r.amount, latest.amount))) continue
    const gaps = asc.slice(1).map((r, i) => Math.round((r.t - asc[i].t) / DAY))
    const weeks = [1, 2].find((w) =>
      gaps.every((g) => Math.abs(g - 7 * w) <= 1),
    )
    if (!weeks) continue
    found.push({
      key: latest.key,
      name: latest.name,
      kind: 'expense',
      amount: latest.amount,
      day: new Date(latest.t).getUTCDate(),
      accountId: latest.accountId,
      category: latest.category,
      everyWeeks: weeks,
      anchor: latest.t,
    })
  }

  /* Paid every month, the amount moving (4 Oct: his phone, "20-30
     euros", €10 top-ups when they come). A payee with no fixed bill,
     paid in each of the last two full months, €10 or more each: the
     line takes the middle, the row says the range. */
  for (const list of byKey.values()) {
    const latest = list.reduce((a, r) => (r.t > a.t ? r : a))
    if (latest.kind !== 'expense') continue
    if (known.some((k) => k.key === latest.key)) continue
    if (found.some((f) => f.key === latest.key)) continue
    if (now - latest.t > 42 * DAY) continue
    const months = [thisMonth - 2, thisMonth - 1].map((m) =>
      list.filter((r) => monthOf(r.t) === m),
    )
    const sums = months.map(
      (rs) => Math.round(rs.reduce((n, r) => n + r.amount * 100, 0)) / 100,
    )
    if (sums.some((x) => x < MIN_VARIES - 1e-9)) continue
    /* One payment a month at one amount is the fixed rule's to judge. */
    const moves =
      months.some((rs) => rs.length > 1) ||
      !sameAmount(months[0][0].amount, months[1][0].amount)
    if (!moves) continue
    const first = months[1].reduce((a, r) => (r.t < a.t ? r : a))
    found.push({
      key: latest.key,
      name: latest.name,
      kind: 'expense',
      amount: Math.round(((sums[0] + sums[1]) / 2) * 100) / 100,
      day: new Date(first.t).getUTCDate(),
      accountId: latest.accountId,
      category: latest.category,
      varies: true,
      lo: Math.min(...sums),
      hi: Math.max(...sums),
    })
  }

  /* A bill by what it is (4 Oct: the condominium, €175, read once): a
     bank phrase that is always a bill is one from its first payment.
     How many months a payment covers ("€175 … for 5 months") cannot be
     read; AHEAD asks him once. */
  for (const r of recent) {
    const phrase = bankPhrase(r.name)
    if (!phrase?.monthly || r.kind !== 'expense') continue
    if (isKnown(known, r) || found.some((f) => f.key === r.key)) continue
    if (now - r.t > 42 * DAY) continue
    found.push({
      key: r.key,
      name: phrase.name,
      kind: 'expense',
      amount: r.amount,
      day: new Date(r.t).getUTCDate(),
      accountId: r.accountId,
      category: phrase.category,
      anchor: r.t,
      asksMonths: true,
    })
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
    /* A name the app's bank phrases gave ("Condominium") stays. */
    if (PHRASES.some((p) => p.monthly && p.name === b.name)) return b.name
    const shared = found.some((o) => o !== b && o.name === b.name)
    const raw = /\d{3,}/.test(b.name) || b.name === b.name.toUpperCase()
    /* "Energia e Água" over "DD EDP COMERCIAL…" (4 Oct): a name sharing no
       word with what the bank printed is the bank's own label. */
    const label = !payeeKey(b.name)
      .split(' ')
      .some((w) => w.length > 2 && b.key.split(' ').includes(w))
    return shared || raw || label || b.kind === 'income' || b.name.trim() === ''
      ? title(b.key.split(' ').slice(0, 2).join(' '))
      : b.name
  })
}

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
    if (r.category === undefined) continue
    if (EVERYDAY.has(r.category) && !passLike(rows, r)) continue
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

/* His transport pass (4 Oct): €40 at the Metro on 1 Sep, €40 at a
   Santander machine in the station on 28 Sep — two payees, an everyday
   group. The same amount to the cent, €20 or more, about a month apart
   is offered first, whoever took it. */
function passLike(rows: ReadonlyArray<BillRow>, r: BillRow): boolean {
  if (r.amount < 20) return false
  return rows.some(
    (o) =>
      o !== r &&
      o.kind === 'expense' &&
      Math.round(o.amount * 100) === Math.round(r.amount * 100) &&
      Math.abs(o.t - r.t) >= 20 * DAY &&
      Math.abs(o.t - r.t) <= 40 * DAY,
  )
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
