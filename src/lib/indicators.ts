/* The lines a position's chart can add (15 Oct, mockup indicators.html;
   his "yes indicators, yes average price", "go: cards + 52W"). Each is
   worked out from stored closes or his own trade rows, on the
   conditions CLAUDE.md writes for them: on that one chart, off until
   pressed, its period named, never stored, never graded. */

import { between } from './priceChart'
import type { Pt } from './priceChart'
import { rounds } from './rounds'

const DAY = 86_400_000
type Close = { t: number; v: number }

/** The simple moving average: each close from the nth on, the mean of
    it and the n − 1 before. */
export function sma(pts: ReadonlyArray<Close>, n: number): Array<Close> {
  const out: Array<Close> = []
  let sum = 0
  pts.forEach((p, i) => {
    sum += p.v
    if (i >= n) sum -= pts[i - n].v
    if (i >= n - 1) out.push({ t: p.t, v: sum / n })
  })
  return out
}

/** Wilder's relative strength index, 0–100: the first n changes
    averaged plainly, each later one smoothed in at 1/n. One value a close
    from the (n + 1)th on. */
export function rsi(pts: ReadonlyArray<Close>, n = 14): Array<Close> {
  const out: Array<Close> = []
  let up = 0
  let down = 0
  for (let i = 1; i < pts.length; i++) {
    const d = pts[i].v - pts[i - 1].v
    const u = Math.max(d, 0)
    const w = Math.max(-d, 0)
    if (i <= n) {
      up += u / n
      down += w / n
    } else {
      up = (up * (n - 1) + u) / n
      down = (down * (n - 1) + w) / n
    }
    if (i >= n)
      out.push({
        t: pts[i].t,
        v: down === 0 ? 100 : 100 - 100 / (1 + up / down),
      })
  }
  return out
}

type Trade = {
  occurredAt: number
  side: 'buy' | 'sell'
  shares: number
  priceEur: number
  reward?: boolean
  split?: boolean
}

const cents = (n: number) => Math.round(n * 100) / 100

/**
 * The average buy price of the round held now (rounds(), as PAID
 * counts it): what its buys cost in euros, each to the cent, over the
 * shares they bought. Rewards and splits are not buys. `price` is the
 * same in the chart's currency, each buy at the euro rate of its own
 * day; null when a buy's day has no rate. Null when nothing is held.
 */
export function avgBuy(
  trades: ReadonlyArray<Trade>,
  rate: (t: number) => number | undefined = () => 1,
) {
  const now = rounds(trades).at(0)
  if (!now?.open) return null
  const buys = now.trades.filter(
    (t) => t.side === 'buy' && !t.reward && !t.split,
  )
  const shares = buys.reduce((s, t) => s + t.shares, 0)
  if (buys.length === 0 || shares <= 0) return null
  let eur = 0
  let there: number | null = 0
  for (const t of buys) {
    const cost = cents(t.shares * t.priceEur)
    eur += cost
    const r = rate(t.occurredAt)
    there =
      there === null || r === undefined || r <= 0 ? null : there + cost / r
  }
  return {
    eur: eur / shares,
    price: there === null ? null : there / shares,
    buys: buys.length,
    from: now.from,
  }
}

/** Euros for one unit of the chart's currency on a day: read off the
    stored close on or before it that carries its euros. */
export function rateOn(pts: ReadonlyArray<Pt>) {
  const known = pts
    .filter((p) => p.eur !== undefined && p.v > 0)
    .sort((a, b) => a.t - b.t)
  return (t: number) => {
    let r: number | undefined
    for (const p of known) {
      if (p.t > t) break
      r = p.eur! / p.v
    }
    return r
  }
}

/** The highest and lowest stored close of the 52 weeks to the latest,
    with their days, and the latest against the high as `between()`
    says it — both closes and both days go with it. */
export function yearRange(pts: ReadonlyArray<Pt>) {
  const last = pts.at(-1)
  if (!last) return null
  const from = last.t - 364 * DAY
  let high = last
  let low = last
  for (const p of pts) {
    if (p.t < from) continue
    if (p.v > high.v) high = p
    if (p.v < low.v) low = p
  }
  return { from, high, low, fromHigh: between(high, last) }
}
