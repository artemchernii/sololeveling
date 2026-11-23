import type { LedgerTrade } from './holdings'

/* PORTFOLIO's chart (23 Nov, "go" on the mockup
   design/treasury-mockup/portfolio-chart.html): the INVESTED line of
   aggregate.worthHistory over 1W–1Y, and over a range its RETURN — the
   market's part of the move, with what was bought or sold in between
   taken out. Nothing here is stored; both ends and the net deposits are
   always shown beside the result. */

const cents = (x: number) => Math.round(x * 100) / 100

/**
 * NET DEPOSITS per day: what the trades of each day cost, buys in and
 * sells out, at their own price in euros (a sum of trade rows). A trade
 * counts on the first day end at or after it; one before the first day
 * drawn is already in its value. A reward or a split costs nothing.
 */
export function netDeposits(
  dayEnds: ReadonlyArray<number>,
  trades: ReadonlyArray<LedgerTrade>,
): Array<number> {
  const out = dayEnds.map(() => 0)
  const n = dayEnds.length
  if (n === 0) return out
  const start = n > 1 ? dayEnds[0] - (dayEnds[1] - dayEnds[0]) : -Infinity
  for (const t of trades) {
    if (t.occurredAt <= start || t.occurredAt > dayEnds[n - 1]) continue
    const i = dayEnds.findIndex((end) => t.occurredAt <= end)
    out[i] += (t.side === 'buy' ? 1 : -1) * t.shares * t.priceEur
  }
  return out.map(cents)
}

export type RangeReturn = {
  /** The first day of the range that has a value. */
  startAt: number
  start: number
  endAt: number
  end: number
  /** Bought minus sold after the first day, up to the last. */
  deposits: number
  /** end − start − deposits. */
  change: number
  /** change over start + deposits, in %. */
  pct: number
  /** Days with a value and their deposits, oldest first: the line. */
  points: Array<{ at: number; value: number; deposit: number }>
}

/**
 * RETURN over the last `days` days of the series (the last point is
 * today): from the first day in the range that has a value. A day with no
 * value carries its deposits to the next day that has one. Null when
 * fewer than two days have one.
 */
export function rangeReturn(
  dayEnds: ReadonlyArray<number>,
  invested: ReadonlyArray<number | null>,
  deposits: ReadonlyArray<number>,
  days: number,
): RangeReturn | null {
  const from = Math.max(0, dayEnds.length - 1 - days)
  const points: RangeReturn['points'] = []
  let carry = 0
  for (let i = from; i < dayEnds.length; i++) {
    const value = invested[i] ?? null
    const d = deposits[i] ?? 0
    if (value === null) {
      if (points.length > 0) carry += d
      continue
    }
    points.push({
      at: dayEnds[i],
      value,
      deposit: points.length === 0 ? 0 : cents(d + carry),
    })
    carry = 0
  }
  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  const added = cents(points.reduce((s, p) => s + p.deposit, 0))
  const change = cents(last.value - first.value - added)
  const base = first.value + added
  return {
    startAt: first.at,
    start: first.value,
    endAt: last.at,
    end: last.value,
    deposits: added,
    change,
    pct: base > 0 ? Math.round((change / base) * 1000) / 10 : 0,
    points,
  }
}
