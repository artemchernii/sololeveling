import type { LedgerTrade } from './holdings'

/* PORTFOLIO's chart (23 Nov, "go" on the mockup
   design/treasury-mockup/portfolio-chart.html; 24 Nov, "Go, build it" on
   its COST BASIS version): the INVESTED line of aggregate.worthHistory
   and its COST BASIS over 1W–1Y. P/L is the one minus the other; RETURN
   is how the P/L moved over the range, so a buy — both lines up alike —
   is never a gain. Nothing here is stored. */

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

export type PlPoint = {
  at: number
  /** MARKET VALUE. */
  value: number
  /** COST BASIS. */
  cost: number
  /** Bought minus sold that day, at the trades' prices. */
  deposit: number
}

export const pl = (p: PlPoint) => cents(p.value - p.cost)
/** P/L over what was paid, in %. */
export const plPct = (p: PlPoint) =>
  p.cost > 0 ? Math.round(((p.value - p.cost) / p.cost) * 1000) / 10 : 0

export type RangeReturn = {
  points: Array<PlPoint>
  startAt: number
  start: number
  endAt: number
  end: number
  /** P/L at the end minus P/L at the start. */
  change: number
  /** change over the end's cost, in %. */
  pct: number
}

/**
 * The last `days` days of the line from the first that has a value (the
 * last point is today), and RETURN over them. A day with no value passes
 * its deposits to the next one drawn. Null below two days.
 */
export function rangeReturn(
  dayEnds: ReadonlyArray<number>,
  invested: ReadonlyArray<number | null>,
  cost: ReadonlyArray<number | null>,
  deposits: ReadonlyArray<number>,
  days: number,
): RangeReturn | null {
  const from = Math.max(0, dayEnds.length - 1 - days)
  const points: Array<PlPoint> = []
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
      cost: cost[i] ?? value,
      deposit: points.length === 0 ? 0 : cents(d + carry),
    })
    carry = 0
  }
  if (points.length < 2) return null
  const first = points[0]
  const last = points[points.length - 1]
  const change = cents(pl(last) - pl(first))
  return {
    points,
    startAt: first.at,
    start: first.value,
    endAt: last.at,
    end: last.value,
    change,
    pct: last.cost > 0 ? Math.round((change / last.cost) * 1000) / 10 : 0,
  }
}

/**
 * DAY'S CHANGE: the last day with a value against the last weekday before
 * it that has one — PREV. CLOSE is a trading day's close, so on a Monday
 * it is Friday's, never Sunday's (23 Nov). Null without both.
 */
export function dayReturn(
  dayEnds: ReadonlyArray<number>,
  invested: ReadonlyArray<number | null>,
  cost: ReadonlyArray<number | null>,
  deposits: ReadonlyArray<number>,
): RangeReturn | null {
  let last = dayEnds.length - 1
  while (last >= 0 && (invested[last] ?? null) === null) last--
  let prev = last - 1
  const weekend = (t: number) => [0, 6].includes(new Date(t).getDay())
  while (
    prev >= 0 &&
    ((invested[prev] ?? null) === null || weekend(dayEnds[prev]))
  )
    prev--
  if (prev < 0) return null
  const keep = (i: number) => i <= prev || i === last
  return rangeReturn(
    dayEnds.slice(0, last + 1),
    invested.slice(0, last + 1).map((v, i) => (keep(i) ? v : null)),
    cost.slice(0, last + 1),
    deposits.slice(0, last + 1),
    last - prev,
  )
}

/**
 * P/L HIGH, P/L LOW and P/L NOW of a range (24 Nov, his "how low we from
 * the peak", then "vs … total money we dumped in the market"): the days
 * the shares were most and least up on what they cost, and the last day.
 */
export function plHighLow(points: ReadonlyArray<PlPoint>): {
  high: PlPoint
  low: PlPoint
  now: PlPoint
} | null {
  if (points.length < 2) return null
  let high = points[0]
  let low = points[0]
  for (const p of points) {
    if (pl(p) >= pl(high)) high = p
    if (pl(p) < pl(low)) low = p
  }
  return { high, low, now: points[points.length - 1] }
}
