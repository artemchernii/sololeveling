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
    stored close of that day, or the last before it, that carries its
    euros — a buy at 15:00 takes its day's close, stored that evening. */
export function rateOn(pts: ReadonlyArray<Pt>) {
  const known = pts
    .filter((p) => p.eur !== undefined && p.v > 0)
    .sort((a, b) => a.t - b.t)
  return (t: number) => {
    let r: number | undefined
    const day = Math.floor(t / DAY)
    for (const p of known) {
      if (Math.floor(p.t / DAY) > day) break
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

export type LineId = 'avg' | 'sma50' | 'sma200' | 'rsi' | 'yr'
export type Way = 'up' | 'down' | 'flat'

/** One row of the SIGNALS tab (15 Oct, mockup indicators.html: "BAD or
    GOOD, most likely bullish or bearish"): what a line says today by
    its textbook rule. `pct` is the price against the line (RSI: its
    value; 52W: from the high), `at` where today sits on the row's
    gauge, 0–100; `level` the line's own value today. */
export type Signal = {
  id: LineId
  verdict: string
  way: Way
  pct: number
  at: number
  price: number
  level: number
}

/* A gauge of price against a line runs from −15% to +15%. */
const REACH = 15
const gauge = (v: number) => Math.max(3, Math.min(97, v))
const against = (
  id: LineId,
  price: number,
  level: number,
  words: [string, string],
): Signal => {
  const pct = ((price - level) / level) * 100
  return {
    id,
    verdict: pct >= 0 ? words[0] : words[1],
    way: pct >= 0 ? 'up' : 'down',
    pct,
    at: gauge(50 + (pct / REACH) * 50),
    price,
    level,
  }
}

/**
 * The signals of the stored closes and the average buy, newest close
 * as today. A line with too few closes for its period has no row.
 * AVG BUY: in profit above it. SMA 50 / 200: bullish above. RSI 14:
 * overbought over 70 (a sign it may turn down), oversold under 30.
 * 52W: near high in the top third of the year's range, near low in the
 * bottom third.
 */
export function signals(
  pts: ReadonlyArray<Pt>,
  avg: number | null,
): Array<Signal> {
  const last = pts.at(-1)
  if (!last) return []
  const p = last.v
  const out: Array<Signal> = []
  if (avg !== null) out.push(against('avg', p, avg, ['in profit', 'at a loss']))
  for (const [id, n] of [
    ['sma50', 50],
    ['sma200', 200],
  ] as const) {
    const level = sma(pts.slice(-n), n).at(-1)?.v
    if (level !== undefined)
      out.push(against(id, p, level, ['bullish', 'bearish']))
  }
  const r = rsi(pts, 14).at(-1)?.v
  if (r !== undefined)
    out.push({
      id: 'rsi',
      verdict: r > 70 ? 'overbought' : r < 30 ? 'oversold' : 'neutral',
      way: r > 70 ? 'down' : r < 30 ? 'up' : 'flat',
      pct: r,
      at: gauge(r),
      price: p,
      level: r,
    })
  const yr = yearRange(pts)
  if (yr && yr.high.v > yr.low.v) {
    const at = ((p - yr.low.v) / (yr.high.v - yr.low.v)) * 100
    out.push({
      id: 'yr',
      verdict:
        at >= 200 / 3 ? 'near high' : at <= 100 / 3 ? 'near low' : 'mid range',
      way: at >= 200 / 3 ? 'up' : at <= 100 / 3 ? 'down' : 'flat',
      pct: yr.fromHigh.pct,
      at: gauge(at),
      price: p,
      level: yr.high.v,
    })
  }
  return out
}

export type Call = 'add' | 'hold' | 'wait'

/**
 * The call to act on a position (15 Oct, mockup verdict.html; his "go
 * verdict … tell me overall idea what is the best to do"), from today's
 * SMA 50, SMA 200 and RSI 14 rows of `signals()` by this rule, checked
 * top to bottom:
 *
 * - WAIT: RSI 14 over 70.
 * - WAIT: price under SMA 50 and under SMA 200.
 * - ADD: price over SMA 200 and under SMA 50.
 * - ADD: price over SMA 200 and RSI 14 under 45.
 * - HOLD: every other case (between the averages: turning).
 *
 * `why` names the rows that made the call; the screen shows all three
 * beside it. The average buy is never an input. Null without all three
 * rows. Fundamentals and news join the rule in their own slices.
 */
export function verdict(
  rows: ReadonlyArray<Signal>,
): { call: Call; why: Array<LineId>; line: string } | null {
  const pct = (id: LineId) => rows.find((r) => r.id === id)?.pct
  const d50 = pct('sma50')
  const d200 = pct('sma200')
  const r = pct('rsi')
  if (d50 === undefined || d200 === undefined || r === undefined) return null
  if (r > 70)
    return {
      call: 'wait',
      why: ['rsi'],
      line: 'RSI 14 above 70: the price rose too fast in 14 days. By the textbook, a pullback often comes next.',
    }
  if (d50 < 0 && d200 < 0)
    return {
      call: 'wait',
      why: ['sma200', 'sma50'],
      line: 'Price below its 50- and 200-day averages: the trend is down. By the textbook, no new shares until the price is back above the 50-day average.',
    }
  if (d200 > 0 && d50 < 0)
    return {
      call: 'add',
      why: ['sma200', 'sma50'],
      line: 'Long trend up, and the price dipped under its 50-day average. By the textbook, a dip in an uptrend is a time to add shares.',
    }
  if (d200 > 0 && r < 45)
    return {
      call: 'add',
      why: ['sma200', 'rsi'],
      line: 'Long trend up, and the price fell fast in 14 days. By the textbook, a dip in an uptrend is a time to add shares.',
    }
  if (d200 < 0)
    return {
      call: 'hold',
      why: ['sma200', 'sma50'],
      line: 'Price above its 50-day average and below its 200-day average: the trend is turning. By the textbook, keep the shares and watch SMA 200.',
    }
  return {
    call: 'hold',
    why: ['sma200', 'sma50'],
    line: 'Price above its 50- and 200-day averages: the trend is up, with no dip. By the textbook, keep the shares; no rush to add at this price.',
  }
}
