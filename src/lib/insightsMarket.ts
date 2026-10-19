/* Insights, band 1 THE MARKET (19 Oct, docs/specs/2026-10-19-insights.md
   I1; mockup design/treasury-mockup/insights.html). What is fetched, and
   how a fetched answer becomes a card. Pure — the fetches live in
   convex/insightsMarket.ts and are never stored (his words: "DONT SAVE IT
   TO DB"). The change over a period is two fetched prices, and both are
   on the screen beside it. */

export const PERIODS = ['1D', '1W', '1M', '1Y'] as const
export type Period = (typeof PERIODS)[number]

/** How Yahoo is asked for each period, and how far back its base close is. */
export const PERIOD_FETCH: Record<
  Period,
  { range: string; interval: string; days: number }
> = {
  '1D': { range: '1d', interval: '5m', days: 0 },
  '1W': { range: '1mo', interval: '1d', days: 7 },
  '1M': { range: '3mo', interval: '1d', days: 30 },
  '1Y': { range: '2y', interval: '1d', days: 365 },
}

/** A mark for something that is not a company: a flag, a site, a metal, a coin. */
export type Mark =
  { emoji: string } | { site: string } | { metal: string } | { coin: string }

export type MarketId =
  'sp500' | 'ndx' | 'world' | 'stoxx' | 'gold' | 'btc' | 'eurusd' | 'us10y'

/** The eight cards, in the mockup's order. `unit` is how the price reads. */
export const MARKETS: ReadonlyArray<{
  id: MarketId
  name: string
  symbol: string
  mark: Mark
  unit: 'points' | 'EUR' | 'USD' | 'rate' | 'yield'
}> = [
  {
    id: 'sp500',
    name: 'S&P 500',
    symbol: '^GSPC',
    mark: { emoji: '🇺🇸' },
    unit: 'points',
  },
  {
    id: 'ndx',
    name: 'NASDAQ 100',
    symbol: '^NDX',
    mark: { site: 'nasdaq.com' },
    unit: 'points',
  },
  {
    id: 'world',
    name: 'MSCI WORLD',
    symbol: 'IWDA.AS',
    mark: { emoji: '🌐' },
    unit: 'EUR',
  },
  {
    id: 'stoxx',
    name: 'STOXX 600',
    symbol: '^STOXX',
    mark: { emoji: '🇪🇺' },
    unit: 'points',
  },
  {
    id: 'gold',
    name: 'GOLD',
    symbol: 'GC=F',
    mark: { metal: 'GC=F' },
    unit: 'USD',
  },
  {
    id: 'btc',
    name: 'BITCOIN',
    symbol: 'BTC-EUR',
    mark: { coin: 'BTC-EUR' },
    unit: 'EUR',
  },
  {
    id: 'eurusd',
    name: 'EUR / USD',
    symbol: 'EURUSD=X',
    mark: { emoji: '💶' },
    unit: 'rate',
  },
  {
    id: 'us10y',
    name: 'US 10Y',
    symbol: '^TNX',
    mark: { site: 'treasury.gov' },
    unit: 'yield',
  },
]

/** The S&P 500's sectors, each read by its own SPDR fund (a fetched
    price, not an average of the boxes), with the biggest companies in it.
    Two rows, as the mockup draws them. */
export const SECTORS: ReadonlyArray<{
  id: string
  name: string
  emoji: string
  fund: string
  row: 0 | 1
  stocks: ReadonlyArray<string>
}> = [
  {
    id: 'tech',
    name: 'TECH',
    emoji: '💻',
    fund: 'XLK',
    row: 0,
    stocks: ['NVDA', 'AAPL', 'MSFT', 'AVGO', 'ORCL', 'PLTR'],
  },
  {
    id: 'comms',
    name: 'COMMS',
    emoji: '📡',
    fund: 'XLC',
    row: 0,
    stocks: ['GOOGL', 'META', 'NFLX'],
  },
  {
    id: 'consumer',
    name: 'CONSUMER',
    emoji: '🛒',
    fund: 'XLY',
    row: 0,
    stocks: ['AMZN', 'TSLA', 'HD'],
  },
  {
    id: 'health',
    name: 'HEALTH',
    emoji: '💊',
    fund: 'XLV',
    row: 0,
    stocks: ['LLY', 'UNH', 'JNJ', 'ABBV'],
  },
  {
    id: 'finance',
    name: 'FINANCE',
    emoji: '🏦',
    fund: 'XLF',
    row: 1,
    stocks: ['BRK-B', 'JPM', 'V', 'MA', 'BAC'],
  },
  {
    id: 'industry',
    name: 'INDUSTRY',
    emoji: '🏭',
    fund: 'XLI',
    row: 1,
    stocks: ['GE', 'CAT', 'RTX'],
  },
  {
    id: 'energy',
    name: 'ENERGY',
    emoji: '⚡',
    fund: 'XLE',
    row: 1,
    stocks: ['XOM', 'CVX'],
  },
  {
    id: 'staples',
    name: 'STAPLES',
    emoji: '🧺',
    fund: 'XLP',
    row: 1,
    stocks: ['WMT', 'COST', 'PG', 'KO'],
  },
]

export const REGIONS: ReadonlyArray<{
  id: string
  name: string
  emoji: string
  symbol: string
}> = [
  { id: 'us', name: 'US', emoji: '🇺🇸', symbol: '^GSPC' },
  { id: 'europe', name: 'EUROPE', emoji: '🇪🇺', symbol: '^STOXX' },
  { id: 'japan', name: 'JAPAN', emoji: '🇯🇵', symbol: '^N225' },
  { id: 'emerging', name: 'EMERGING', emoji: '🌱', symbol: 'EEM' },
  { id: 'china', name: 'CHINA', emoji: '🇨🇳', symbol: 'MCHI' },
]

/** Every symbol one period asks Yahoo for, once each. */
export function allSymbols(): Array<string> {
  return [
    ...new Set([
      ...MARKETS.map((m) => m.symbol),
      ...SECTORS.flatMap((s) => [s.fund, ...s.stocks]),
      ...REGIONS.map((r) => r.symbol),
    ]),
  ]
}

export type Point = { t: number; v: number }
/** One symbol as Yahoo's spark answers it: its closes, and the close
    before the first of them. */
export type Series = { points: Array<Point>; previousClose: number | null }

/** Yahoo's batch spark answer, by symbol; a symbol it did not answer is left out. */
export function parseSpark(json: unknown): Map<string, Series> {
  const out = new Map<string, Series>()
  if (json === null || typeof json !== 'object') return out
  for (const [symbol, raw] of Object.entries(json as Record<string, unknown>)) {
    const r = raw as {
      timestamp?: Array<unknown>
      close?: Array<unknown>
      chartPreviousClose?: unknown
    } | null
    if (!r || !Array.isArray(r.timestamp) || !Array.isArray(r.close)) continue
    const points: Array<Point> = []
    r.timestamp.forEach((t, i) => {
      const c = r.close?.[i]
      if (typeof t === 'number' && typeof c === 'number' && Number.isFinite(c))
        points.push({ t: t * 1000, v: c })
    })
    if (points.length === 0) continue
    const prev = r.chartPreviousClose
    out.set(symbol, {
      points,
      previousClose: typeof prev === 'number' && prev > 0 ? prev : null,
    })
  }
  return out
}

/** A price over a period: the latest, the base it is measured against and
    that base's day (null on 1D: the previous close), the change, the line. */
export type Move = {
  price: number
  at: number
  base: number
  baseAt: number | null
  change: number
  points: Array<Point>
}

const DAY = 86_400_000
/** Points a card's line keeps: enough to draw, little to send. */
export const LINE_POINTS = 48

/**
 * The move over a period, from one symbol's closes. 1D measures against
 * the previous close; the others against the last close on or before the
 * day the period starts. A yield moves in points, everything else in
 * percent. Null when there is no base to measure against.
 */
export function moveOf(
  s: Series,
  period: Period,
  now: number,
  yieldPoints = false,
): Move | null {
  const last = s.points[s.points.length - 1] as Point | undefined
  if (!last) return null
  let from = 0
  let base: number | null
  let baseAt: number | null = null
  if (period === '1D') {
    base = s.previousClose
  } else {
    const start = now - PERIOD_FETCH[period].days * DAY
    from = -1
    s.points.forEach((p, i) => {
      if (p.t <= start) from = i
    })
    if (from < 0) return null
    base = s.points[from].v
    baseAt = s.points[from].t
  }
  if (base === null || base <= 0) return null
  const change = yieldPoints ? last.v - base : (last.v / base - 1) * 100
  return {
    price: last.v,
    at: last.t,
    base,
    baseAt,
    change: Math.round(change * 100) / 100,
    points: thin(s.points.slice(from), LINE_POINTS),
  }
}

/** At most `n` points, the first and the last always kept. */
export function thin(points: Array<Point>, n: number): Array<Point> {
  if (points.length <= n) return points
  const step = (points.length - 1) / (n - 1)
  return Array.from({ length: n }, (_, i) => points[Math.round(i * step)])
}

/** Yahoo's quote answer: each symbol's market cap, for a box's size. */
export function parseCaps(json: unknown): Map<string, number> {
  const out = new Map<string, number>()
  const rows = (json as { quoteResponse?: { result?: Array<unknown> } } | null)
    ?.quoteResponse?.result
  if (!Array.isArray(rows)) return out
  for (const r of rows as Array<Record<string, unknown>>) {
    if (typeof r.symbol === 'string' && typeof r.marketCap === 'number')
      out.set(r.symbol, r.marketCap)
  }
  return out
}

/** Where the heat colour is full: 6% over a day to a month, 30% over a year. */
export const heatCap = (period: Period) => (period === '1Y' ? 30 : 6)

/** How much of the state colour a box takes: 30% at no move, all at the cap. */
export function heatMix(change: number, period: Period): number {
  return Math.round(30 + Math.min(Math.abs(change) / heatCap(period), 1) * 70)
}
