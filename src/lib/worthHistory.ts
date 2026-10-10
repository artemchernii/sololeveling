import { reconcile } from './holdings'
import type { LedgerTrade, Observation } from './holdings'

/* What his shares were worth at the end of each day (Finances B, 1 Oct —
   the INVESTED line on :3950). Per position: the shares the files say he
   held that day (reconcile, the rule Portfolio uses today) × the last
   close on or before it × the last ECB rate on or before it. Every factor
   is a stored row; a day with no close or rate for something held leaves
   that position out and counts it, never a guess. */

export type Close = { asOf: number; price: number }
export type Rate = { asOf: number; rate: number }

export type Holding<TAccount> = {
  accountId: TAccount
  trades: ReadonlyArray<LedgerTrade>
  looks: ReadonlyArray<Observation>
  /** Oldest first. */
  closes: ReadonlyArray<Close>
  /** London quotes in pence: 100. */
  divide: number
  /** Oldest first; null for a euro quote. */
  rates: ReadonlyArray<Rate> | null
}

/** The last row on or before `at`, from a list oldest first. */
function lastBy<T extends { asOf: number }>(
  rows: ReadonlyArray<T>,
  at: number,
): T | undefined {
  let lo = 0
  let hi = rows.length - 1
  let found: T | undefined
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (rows[mid].asOf <= at) {
      found = rows[mid]
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

export function investedSeries<TAccount>(
  dayEnds: ReadonlyArray<number>,
  holdings: ReadonlyArray<Holding<TAccount>>,
): {
  /** Euros per day; null on a day nothing was held. */
  total: Array<number | null>
  accounts: Array<{ accountId: TAccount; values: Array<number | null> }>
  /** Per day, how many held positions had no close or rate to value. */
  unpriced: Array<number>
} {
  const total: Array<number | null> = dayEnds.map(() => null)
  const unpriced = dayEnds.map(() => 0)
  const byAccount = new Map<TAccount, Array<number | null>>()
  for (const h of holdings) {
    const values =
      byAccount.get(h.accountId) ??
      byAccount
        .set(
          h.accountId,
          dayEnds.map(() => null),
        )
        .get(h.accountId)!
    for (const [i, end] of dayEnds.entries()) {
      const shares = reconcile(
        h.trades.filter((t) => t.occurredAt <= end),
        h.looks.filter((o) => o.asOf <= end),
      ).shares
      if (shares <= 0) continue
      const close = lastBy(h.closes, end)
      const rate = h.rates === null ? { rate: 1 } : lastBy(h.rates, end)
      if (close === undefined || rate === undefined) {
        unpriced[i]++
        values[i] ??= 0
        total[i] ??= 0
        continue
      }
      const cents = Math.round(
        ((shares * close.price) / h.divide) * rate.rate * 100,
      )
      values[i] = Math.round((values[i] ?? 0) * 100 + cents) / 100
      total[i] = Math.round((total[i] ?? 0) * 100 + cents) / 100
    }
  }
  /* Once shares were first held, a day holding none is €0, not a gap (1
     Oct: he sold everything on 7 May and bought again in June — the chart
     drew a straight line across the 46 days instead). */
  const fromFirst = (xs: Array<number | null>) => {
    const first = xs.findIndex((x) => x !== null)
    return first < 0 ? xs : xs.map((x, i) => (i > first ? (x ?? 0) : x))
  }
  return {
    total: fromFirst(total),
    accounts: [...byAccount].map(([accountId, values]) => ({
      accountId,
      values: fromFirst(values),
    })),
    unpriced,
  }
}

/** Cash and invested, day by day, added where either is known. */
export function addSeries(
  a: ReadonlyArray<number | null>,
  b: ReadonlyArray<number | null>,
): Array<number | null> {
  return a.map((x, i) => {
    const y = b[i] ?? null
    if (x === null && y === null) return null
    return Math.round(((x ?? 0) + (y ?? 0)) * 100) / 100
  })
}

/** Per day end: was any of these positions holding shares. */
export function heldDays(
  dayEnds: ReadonlyArray<number>,
  positions: ReadonlyArray<{
    trades: ReadonlyArray<LedgerTrade>
    looks: ReadonlyArray<Observation>
  }>,
): Array<boolean> {
  return dayEnds.map((end) =>
    positions.some(
      (p) =>
        reconcile(
          p.trades.filter((t) => t.occurredAt <= end),
          p.looks.filter((o) => o.asOf <= end),
        ).shares > 0,
    ),
  )
}

/* How finely the line is priced: [days at the end looked up one by one,
   days apart before that]. The first is what the chart has drawn since 4
   Oct; each next one is coarser, for a year of more positions than one
   query may look up. */
const LOOK_STEPS: ReadonlyArray<readonly [number, number]> = [
  [31, 7],
  [14, 7],
  [7, 14],
  [7, 28],
  [1, 28],
  [1, 90],
]

/**
 * The day ends to look a close (or a rate) up at, one list per line of
 * `held`. Only days it was held (10 Oct: his stocks file brought 57
 * instruments, most sold long ago, and a year of looks for each was more
 * than Convex lets one query read — the page broke on save). The first day
 * of every held stretch is always looked up, so nothing held starts
 * unpriced; between two looks a day takes the earlier close. The finest
 * step whose looks fit `budget` is used.
 */
export function closeLooks(
  dayEnds: ReadonlyArray<number>,
  held: ReadonlyArray<ReadonlyArray<boolean>>,
  budget: number,
): Array<Array<number>> {
  const n = dayEnds.length
  let looks: Array<Array<number>> = []
  for (const [tail, step] of LOOK_STEPS) {
    looks = held.map((days) =>
      dayEnds.filter(
        (_, i) =>
          days[i] &&
          (!days[i - 1] || i >= n - tail || (n - 1 - i) % step === 0),
      ),
    )
    if (looks.reduce((sum, l) => sum + l.length, 0) <= budget) break
  }
  return looks
}
