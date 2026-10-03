/* UPDATE ALL (3 Oct): many statements dropped at once, reviewed per
   account. These are the parts that must be right every time, so they
   are pure and tested — which months a drop covers and where a statement
   is missing, whether each account's balances agree with its rows, and
   which transfers in one file are the other side of a transfer in
   another. Spec: docs/specs/2026-10-03-bulk-update.md. */

const DAY_MS = 86_400_000
/* The same window the single-file review pairs a transfer in. */
const PAIR_WINDOW_MS = 2 * DAY_MS + 3_600_000

/** "2026-03" for a time, in local months. */
export function monthKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return monthKey(d.getTime())
}

/**
 * The months a review draws: from the drop's first month to its last, at
 * least twelve (padded back, so one September is seen against the year),
 * at most twenty-four (the latest ones).
 */
export function reviewMonths(times: ReadonlyArray<number>): Array<string> {
  if (times.length === 0) return []
  const last = monthKey(Math.max(...times))
  let first = monthKey(Math.min(...times))
  if (first > addMonths(last, -11)) first = addMonths(last, -11)
  if (first < addMonths(last, -23)) first = addMonths(last, -23)
  const out: Array<string> = []
  for (let k = first; k <= last; k = addMonths(k, 1)) out.push(k)
  return out
}

export type MonthState = 'none' | 'had' | 'add' | 'hole'

/**
 * Each month of one account: rows this drop brings (`add`), rows it
 * already had (`had`), or — between the first and last month that has
 * anything — nothing at all (`hole`: a statement is missing), unless he
 * said that month was quiet.
 */
export function coverage(
  months: ReadonlyArray<string>,
  had: ReadonlyArray<number>,
  adds: ReadonlyArray<number>,
  quiet: ReadonlyArray<string> = [],
): Array<{ month: string; state: MonthState }> {
  const hadM = new Set(had.map(monthKey))
  const addM = new Set(adds.map(monthKey))
  const known = months.filter((m) => hadM.has(m) || addM.has(m))
  const first = known.at(0)
  const last = known.at(-1)
  return months.map((month) => ({
    month,
    state: addM.has(month)
      ? 'add'
      : hadM.has(month)
        ? 'had'
        : first !== undefined &&
            last !== undefined &&
            month > first &&
            month < last &&
            !quiet.includes(month)
          ? 'hole'
          : 'none',
  }))
}

function dayKey(t: number): string {
  const d = new Date(t)
  return `${monthKey(t)}-${String(d.getDate()).padStart(2, '0')}`
}

export type Gap = { from: number; to: number; gap: number }

/**
 * A balance is an observation, rows are the ledger (A.5): each balance
 * plus the rows on the days after it, up to and including the next
 * balance's day, should be that next balance. Where it is not, the gap and
 * the two days it sits between — "€100 missing between 3 and 10 Sep".
 * Amounts signed: money out is negative.
 */
export function balanceGaps(
  balances: ReadonlyArray<{ asOf: number; value: number }>,
  rows: ReadonlyArray<{ occurredAt: number; amount: number }>,
): Array<Gap> {
  const sorted = [...balances].sort((a, b) => a.asOf - b.asOf)
  const out: Array<Gap> = []
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]
    const b = sorted[i]
    const from = dayKey(a.asOf)
    const to = dayKey(b.asOf)
    if (from === to) continue
    let cents = Math.round(a.value * 100)
    for (const r of rows) {
      const k = dayKey(r.occurredAt)
      if (k > from && k <= to) cents += Math.round(r.amount * 100)
    }
    const gap = Math.round(b.value * 100) - cents
    if (gap !== 0) out.push({ from: a.asOf, to: b.asOf, gap: gap / 100 })
  }
  return out
}

export type OwnRow<TKey> = {
  key: TKey
  accountId: string
  amount: number
  occurredAt: number
  /** Where the review thinks it went or came from, if it can tell. */
  otherAccountId: string | null
}

/**
 * Transfers inside one drop: a row of his own money in one account and
 * the opposite row in another, within two days — each used once. A row
 * whose other account the review named pairs only with that account; one
 * it could not name pairs with any of his others. What is left with no
 * other account named is a move with one side: he is asked where it went.
 */
export function pairAcross<TKey>(rows: ReadonlyArray<OwnRow<TKey>>): {
  pairs: Array<[TKey, TKey]>
  oneSide: Array<TKey>
} {
  const used = new Set<number>()
  const pairs: Array<[TKey, TKey]> = []
  const order = rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.occurredAt - b.r.occurredAt)
  for (const { r, i } of order) {
    if (used.has(i)) continue
    let best = -1
    let bestDt = Infinity
    for (const { r: s, i: j } of order) {
      if (j === i || used.has(j) || s.accountId === r.accountId) continue
      if (Math.round((r.amount + s.amount) * 100) !== 0) continue
      const dt = Math.abs(r.occurredAt - s.occurredAt)
      if (dt > PAIR_WINDOW_MS) continue
      if (r.otherAccountId !== null && r.otherAccountId !== s.accountId)
        continue
      if (s.otherAccountId !== null && s.otherAccountId !== r.accountId)
        continue
      if (dt < bestDt) {
        best = j
        bestDt = dt
      }
    }
    if (best >= 0) {
      used.add(i)
      used.add(best)
      const [out, into] = r.amount < 0 ? [i, best] : [best, i]
      pairs.push([rows[out].key, rows[into].key])
    }
  }
  const oneSide = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r, i }) => !used.has(i) && r.otherAccountId === null)
    .map(({ r }) => r.key)
  return { pairs, oneSide }
}

/**
 * The order a batch is applied in: each account's statements oldest
 * first, so every balance lands on its day and a transfer's second side
 * finds its first already written.
 */
export function applyOrder<T extends { to: number | null }>(
  files: ReadonlyArray<T>,
): Array<T> {
  return [...files].sort((a, b) => (a.to ?? Infinity) - (b.to ?? Infinity))
}
