import { signals } from './indicators'
import { thin } from './insightsMarket'
import type { Point, Series } from './insightsMarket'
import type { Summary } from './yahooFundamentals'

/* IDEAS, the board (29 Oct; spec docs/specs/2026-10-29-ideas-board.md,
   mockup design/treasury-mockup/ideas-board.html). What the board fetches
   when it opens, and how each answer becomes a number on screen. Pure —
   the fetches live in convex/insightsBoard.ts and are never stored (his
   words: "DONT SAVE IT TO DB"). A change is two fetched prices, both kept
   beside it; a signal is src/lib/indicators.ts on fetched closes. */

/** The market strip: eight, in the mockup's order. */
export const STRIP = [
  { id: 'sp500', name: 'S&P 500', symbol: '^GSPC', unit: 'points' },
  { id: 'nasdaq', name: 'NASDAQ', symbol: '^IXIC', unit: 'points' },
  { id: 'dow', name: 'DOW', symbol: '^DJI', unit: 'points' },
  { id: 'russell', name: 'RUSSELL', symbol: '^RUT', unit: 'points' },
  { id: 'us10y', name: '10Y', symbol: '^TNX', unit: 'yield' },
  { id: 'vix', name: 'VIX', symbol: '^VIX', unit: 'points' },
  { id: 'gold', name: 'GOLD', symbol: 'GC=F', unit: 'USD' },
  { id: 'btc', name: 'BTC', symbol: 'BTC-USD', unit: 'USD' },
] as const
export type StripId = (typeof STRIP)[number]['id']

/** A strip cell: the price now, the close before, the change, the day's line. */
export type Cell = {
  id: StripId
  price: number
  base: number
  change: number
  points: Array<Point>
}

/** Points a sparkline keeps. */
export const SPARK = 40

/** One strip cell from Yahoo's 1-day spark; a yield moves in points. */
export function cellOf(id: StripId, s: Series | undefined): Cell | null {
  const last = s?.points.at(-1)
  const base = s?.previousClose ?? null
  if (!s || !last || base === null || base <= 0) return null
  const unit = STRIP.find((x) => x.id === id)?.unit
  const change = unit === 'yield' ? last.v - base : (last.v / base - 1) * 100
  return {
    id,
    price: last.v,
    base,
    change: Math.round(change * 100) / 100,
    points: thin(s.points, SPARK),
  }
}

export type Mover = { symbol: string; name: string; change: number }
export type MoverList = 'trending' | 'gainers' | 'losers'
/** A list Yahoo did not answer is null: ❔ NO DATA on its tab. */
export type Movers = Record<MoverList, Array<Mover> | null>
export const MOVERS = 10

const obj = (x: unknown): Record<string, unknown> =>
  typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {}
const num = (x: unknown): number | null => {
  const v = typeof x === 'object' && x !== null ? obj(x).raw : x
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
const firstResult = (json: unknown) => {
  const r = obj(obj(json).finance).result
  return Array.isArray(r) ? obj(r[0]) : null
}

/** Yahoo's trending list: symbols only, in its order. Null when unanswered. */
export function parseTrending(json: unknown): Array<string> | null {
  const quotes = firstResult(json)?.quotes
  if (!Array.isArray(quotes)) return null
  return quotes
    .map((q) => obj(q).symbol)
    .filter((s): s is string => typeof s === 'string' && s !== '')
    .slice(0, MOVERS)
}

/** A predefined screener (day_gainers, day_losers): symbol, name and the
    day's change in percent. Null when unanswered. */
export function parseScreener(json: unknown): Array<Mover> | null {
  const quotes = firstResult(json)?.quotes
  if (!Array.isArray(quotes)) return null
  const out: Array<Mover> = []
  for (const raw of quotes) {
    const q = obj(raw)
    const change = num(q.regularMarketChangePercent)
    if (typeof q.symbol !== 'string' || change === null) continue
    const name = q.shortName ?? q.longName
    out.push({
      symbol: q.symbol,
      name: typeof name === 'string' ? name : q.symbol,
      change: Math.round(change * 100) / 100,
    })
  }
  return out.slice(0, MOVERS)
}

/** The trending symbols with their day's change, from one 1-day spark. */
export function trendingOf(
  symbols: Array<string>,
  series: Map<string, Series>,
): Array<Mover> {
  return symbols.flatMap((symbol) => {
    const s = series.get(symbol)
    const last = s?.points.at(-1)
    const base = s?.previousClose
    if (!last || !base) return []
    const change = Math.round((last.v / base - 1) * 10_000) / 100
    return [{ symbol, name: symbol, change }]
  })
}

/** What a line of the board shows of one ticker, all fetched. */
export type TickerFacts = {
  symbol: string
  currency: string
  price: number
  at: number
  /** The close before today and the change from it. */
  day: { base: number; change: number } | null
  /** Three months of closes, thinned for the sparkline. */
  points: Array<Point>
  rsi: number | null
  /** The 200-day average and the price against it, in percent. */
  sma200: { level: number; pct: number } | null
  /** The year's high and where the price sits from it, in percent. */
  high: { level: number; pct: number } | null
  /** The analysts' mean target, how many, and its distance, in percent. */
  target: { mean: number; count: number; pct: number } | null
  pe: number | null
  /** Dividend yield, in percent. */
  dividend: number | null
}

type Closes = {
  currency: string
  price: number
  asOf: number
  closes: Array<{ asOf: number; price: number }>
}

const DAY = 86_400_000
const r2 = (n: number) => Math.round(n * 100) / 100
const pctOf = (price: number, level: number) => r2((price / level - 1) * 100)

/** One ticker's facts from a year of daily closes and its summary. */
export function tickerFacts(
  symbol: string,
  c: Closes,
  s: Summary | null,
  now: number,
): TickerFacts | null {
  if (!(c.price > 0) || c.closes.length < 2) return null
  const pts = c.closes.map((x) => ({ t: x.asOf, v: x.price }))
  /* Today's price stands as the last close for the signals. */
  const today = new Date(c.asOf).toISOString().slice(0, 10)
  const before = pts.filter(
    (p) => new Date(p.t).toISOString().slice(0, 10) < today,
  )
  const withNow = [...before, { t: c.asOf, v: c.price }]
  const prev = before.at(-1)
  const sig = signals(withNow, null)
  const rsi = sig.find((x) => x.id === 'rsi')
  const sma = sig.find((x) => x.id === 'sma200')
  const yr = sig.find((x) => x.id === 'yr')
  const t = s?.target
  const from = now - 92 * DAY
  return {
    symbol,
    currency: c.currency,
    price: c.price,
    at: c.asOf,
    day: prev ? { base: prev.v, change: pctOf(c.price, prev.v) } : null,
    points: thin(
      withNow.filter((p) => p.t >= from),
      SPARK,
    ),
    rsi: rsi ? Math.round(rsi.level) : null,
    sma200: sma ? { level: r2(sma.level), pct: r2(sma.pct) } : null,
    high: yr ? { level: r2(yr.level), pct: r2(yr.pct) } : null,
    target: t
      ? { mean: t.mean, count: t.count, pct: pctOf(t.mean, c.price) }
      : null,
    pe: s?.pe?.forward ?? s?.pe?.trailing ?? null,
    dividend: s?.dividend ? r2(s.dividend.yield * 100) : null,
  }
}

export type ChipTone = 'good' | 'bad' | 'ink' | 'lav' | 'warn'
export type Chip = { text: string; tone: ChipTone }

/** The two signal chips a line shows: RSI, then the analysts' target, or
    the 200-day average when there is none. Each says its number. */
export function chipsOf(f: TickerFacts): Array<Chip> {
  const out: Array<Chip> = []
  if (f.rsi !== null)
    out.push(
      f.rsi > 70
        ? { text: `RSI ${f.rsi} · OVERBOUGHT`, tone: 'bad' }
        : f.rsi < 30
          ? { text: `RSI ${f.rsi} · OVERSOLD`, tone: 'good' }
          : { text: `RSI ${f.rsi}`, tone: 'ink' },
    )
  if (f.target)
    out.push({
      text: `TARGET ${f.target.pct >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(f.target.pct))}%`,
      tone: 'ink',
    })
  else if (f.sma200)
    out.push(
      f.sma200.pct >= 0
        ? { text: 'SMA 200 · ABOVE', tone: 'good' }
        : { text: 'SMA 200 · BELOW', tone: 'bad' },
    )
  return out.slice(0, 2)
}

/** A ticker's facts as lines the model is given and the app prints. */
export function tickerFactLines(f: TickerFacts): Array<string> {
  const cur = f.currency === 'USD' ? '$' : f.currency === 'EUR' ? '€' : ''
  const p = (n: number) => `${cur}${r2(n)}${cur ? '' : ` ${f.currency}`}`
  return [
    `price ${p(f.price)}`,
    f.day ? `today ${sign(f.day.change)}% (close before ${p(f.day.base)})` : '',
    f.rsi !== null ? `RSI 14 ${f.rsi}` : '',
    f.sma200
      ? `200-day average ${p(f.sma200.level)} (${sign(f.sma200.pct)}%)`
      : '',
    f.high ? `52-week high ${p(f.high.level)} (${sign(f.high.pct)}%)` : '',
    f.target
      ? `analyst mean target ${p(f.target.mean)} from ${f.target.count} (${sign(f.target.pct)}%)`
      : '',
    f.pe !== null ? `P/E ${r2(f.pe)}` : '',
    f.dividend !== null ? `dividend yield ${f.dividend}%` : '',
  ].filter((x) => x !== '')
}

export const sign = (n: number) => `${n > 0 ? '+' : ''}${r2(n)}`
