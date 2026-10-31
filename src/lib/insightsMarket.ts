/* Insights, band 1 THE MARKET (19 Oct, docs/specs/2026-10-19-insights.md
   I1; mockup design/treasury-mockup/insights.html). What is fetched, and
   how a fetched answer becomes a card. Pure — the fetches live in
   convex/insightsMarket.ts and are never stored (his words: "DONT SAVE IT
   TO DB"). The change over a period is two fetched prices, and both are
   on the screen beside it. */

export const PERIODS = ['1D', '1W', '1M', '3M', '1Y'] as const
export type Period = (typeof PERIODS)[number]

/** How Yahoo is asked for each period, and how far back its base close is. */
export const PERIOD_FETCH: Record<
  Period,
  { range: string; interval: string; days: number }
> = {
  '1D': { range: '1d', interval: '5m', days: 0 },
  '1W': { range: '1mo', interval: '1d', days: 7 },
  '1M': { range: '3mo', interval: '1d', days: 30 },
  '3M': { range: '6mo', interval: '1d', days: 91 },
  '1Y': { range: '2y', interval: '1d', days: 365 },
}

/** A mark for something that is not a company: a country's flag (two
    for a pair, a small tag for what of it), a drawn icon, a site, a coin.
    No letter chips (31 Oct, his "shitty ass EU letter instead of proper
    european flag"), no emoji. */
export type Mark =
  | { flag: FlagCode | [FlagCode, FlagCode]; tag?: string }
  | { icon: 'globe' | 'gold' | 'silver' }
  | { site: string }
  | { coin: string }

/** The flags the app draws (`Flag` in parts.tsx), ISO codes and EU. */
export type FlagCode =
  | 'US'
  | 'CN'
  | 'EU'
  | 'JP'
  | 'HK'
  | 'BR'
  | 'MX'
  | 'AR'
  | 'DK'
  | 'FR'
  | 'DE'
  | 'CH'
  | 'GB'
  | 'NL'
  | 'ES'
  | 'IT'
  | 'SE'
  | 'TW'
  | 'KR'
  | 'IN'
  | 'CL'
  | 'PE'

export type MarketId =
  | 'sp500'
  | 'ndx'
  | 'world'
  | 'stoxx'
  | 'nikkei'
  | 'hsi'
  | 'bvsp'
  | 'latam'
  | 'us10y'
  | 'gold'
  | 'silver'
  | 'eurusd'
  | 'btc'

type Unit = 'points' | 'EUR' | 'USD' | 'rate' | 'yield'
export type MarketGroup = 'STOCKS' | 'BONDS' | 'METALS' | 'MONEY'
const market = (
  id: MarketId,
  name: string,
  symbol: string,
  mark: Mark,
  unit: Unit,
  group: MarketGroup,
) => ({ id, name, symbol, mark, unit, group }) as const

/** The cards, grouped, in the mockup's order (market-world.html, 31 Oct:
    US, Europe, Asia and South America, bonds, gold and silver). `unit` is
    how the price reads. Yahoo has no Merval or Bund yield, so South
    America is the Bovespa and iShares Latin America 40. */
export const MARKETS = [
  market('sp500', 'S&P 500', '^GSPC', { flag: 'US' }, 'points', 'STOCKS'),
  market(
    'ndx',
    'NASDAQ 100',
    '^NDX',
    { flag: 'US', tag: 'TECH' },
    'points',
    'STOCKS',
  ),
  market('stoxx', 'STOXX 600', '^STOXX', { flag: 'EU' }, 'points', 'STOCKS'),
  market('world', 'MSCI WORLD', 'IWDA.AS', { icon: 'globe' }, 'EUR', 'STOCKS'),
  market('nikkei', 'NIKKEI 225', '^N225', { flag: 'JP' }, 'points', 'STOCKS'),
  market('hsi', 'HANG SENG', '^HSI', { flag: 'HK' }, 'points', 'STOCKS'),
  market('bvsp', 'BOVESPA', '^BVSP', { flag: 'BR' }, 'points', 'STOCKS'),
  market(
    'latam',
    'LATIN AMERICA 40',
    'ILF',
    { flag: ['BR', 'MX'] },
    'USD',
    'STOCKS',
  ),
  market(
    'us10y',
    'US 10Y',
    '^TNX',
    { flag: 'US', tag: '10Y' },
    'yield',
    'BONDS',
  ),
  market('gold', 'GOLD', 'GC=F', { icon: 'gold' }, 'USD', 'METALS'),
  market('silver', 'SILVER', 'SI=F', { icon: 'silver' }, 'USD', 'METALS'),
  market(
    'eurusd',
    'EUR / USD',
    'EURUSD=X',
    { flag: ['EU', 'US'] },
    'rate',
    'MONEY',
  ),
  market('btc', 'BITCOIN', 'BTC-EUR', { coin: 'BTC-EUR' }, 'EUR', 'MONEY'),
]

/** The S&P 500's sectors, each read by its own SPDR fund (a fetched
    price, not an average of the boxes), with the biggest companies in it:
    [id, name, line icon, fund, "STOCKS"]. Shown as rows, best first
    (market-story.html, his "this part is a bit ugly" on the boxes). */
export const SECTORS = (
  [
    ['tech', 'Tech', 'chip', 'XLK', 'NVDA AAPL MSFT AVGO ORCL PLTR'],
    ['comms', 'Comms', 'wave', 'XLC', 'GOOGL META NFLX'],
    ['consumer', 'Consumer', 'cart', 'XLY', 'AMZN TSLA HD'],
    ['health', 'Health', 'heart', 'XLV', 'LLY UNH JNJ ABBV'],
    ['finance', 'Finance', 'bank', 'XLF', 'BRK-B JPM V MA BAC'],
    ['industry', 'Industry', 'gear', 'XLI', 'GE CAT RTX'],
    ['energy', 'Energy', 'bolt', 'XLE', 'XOM CVX'],
    ['staples', 'Staples', 'basket', 'XLP', 'WMT COST PG KO'],
  ] as const
).map(([id, name, icon, fund, stocks]) => ({
  id,
  name,
  icon,
  fund,
  stocks: stocks.split(' '),
}))
export type SectorIcon = (typeof SECTORS)[number]['icon']

export const REGIONS = [
  { id: 'us', name: 'US', chip: 'US', symbol: '^GSPC' },
  { id: 'europe', name: 'Europe', chip: 'EU', symbol: '^STOXX' },
  { id: 'japan', name: 'Japan', chip: 'JP', symbol: '^N225' },
  { id: 'emerging', name: 'Emerging', chip: 'EM', symbol: 'EEM' },
  { id: 'china', name: 'China', chip: 'CN', symbol: 'MCHI' },
  { id: 'brazil', name: 'Brazil', chip: 'BR', symbol: '^BVSP' },
] as const

/** A row's bar from the zero line: its share of half the track, full at 12%. */
export const zeroBar = (change: number) =>
  Math.round(Math.min(Math.abs(change) / 12, 1) * 500) / 10

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
