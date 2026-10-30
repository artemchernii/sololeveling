import { STRIP, cellOf, tickerFacts } from './ideasBoard'
import type { Movers, TickerFacts } from './ideasBoard'
import type { Series } from './insightsMarket'

/* The test backend's board (E2E=1): every ticker but ZZZZ is known, with
   a year of closes made from its letters, so a line has its sparkline and
   signals; the strip is eight known cells; LOSERS is not answered, so its
   tab shows ❔ NO DATA. Nothing leaves the backend. */

const DAY = 86_400_000

function seed(s: string) {
  let n = 7
  for (const c of s) n = (n * 31 + c.charCodeAt(0)) % 9973
  return n
}

function walk(symbol: string, now: number, days: number, start: number) {
  let x = seed(symbol)
  const r = () => (x = (x * 9301 + 49297) % 233280) / 233280
  const dir = (seed(symbol) % 3) - 1
  let p = start
  return Array.from({ length: days }, (_, i) => {
    p = Math.max(1, p * (1 + (r() - 0.5) * 0.03 + dir * 0.001))
    return {
      asOf: now - (days - 1 - i) * DAY,
      price: Math.round(p * 100) / 100,
    }
  })
}

export function cannedBoard(symbols: Array<string>, now: number) {
  const tickers = symbols.flatMap((symbol): Array<TickerFacts> => {
    if (symbol === 'ZZZZ') return []
    const closes = walk(symbol, now, 260, 40 + (seed(symbol) % 400))
    const last = closes[closes.length - 1]
    const f = tickerFacts(
      symbol,
      {
        currency:
          symbol.endsWith('.L') || symbol.endsWith('.AS') ? 'EUR' : 'USD',
        price: last.price,
        asOf: last.asOf,
        closes,
      },
      symbol.includes('.')
        ? null
        : {
            target: { mean: last.price * 1.18, low: 1, high: 2, count: 31 },
            pe: { forward: 21.4 },
            dividend: { yield: 0.011 },
          },
      now,
    )
    return f ? [f] : []
  })
  const strip = STRIP.map((s, i) => {
    const pts = walk(s.symbol, now, 40, 100 + i * 10).map((c) => ({
      t: c.asOf,
      v: c.price,
    }))
    const series: Series = {
      points: pts,
      previousClose: pts[0].v * (i % 2 ? 1.004 : 0.996),
    }
    return { id: s.id, cell: cellOf(s.id, series) }
  })
  const movers: Movers = {
    trending: [
      { symbol: 'AVGO', name: 'AVGO', change: -3.1 },
      { symbol: 'CAT', name: 'CAT', change: -9.25 },
      { symbol: 'TSLA', name: 'TSLA', change: 0.8 },
    ],
    gainers: [
      { symbol: 'FMCC', name: 'Freddie Mac', change: 13.46 },
      { symbol: 'NVDA', name: 'NVIDIA', change: 4.2 },
    ],
    losers: null,
  }
  return {
    fetchedAt: now,
    priceSource: 'Yahoo Finance',
    strip,
    movers,
    tickers,
  }
}

export function cannedChart(symbols: Array<string>, now: number) {
  return symbols
    .filter((s) => s !== 'ZZZZ')
    .map((symbol) => ({
      symbol,
      points: walk(symbol, now, 90, 100).map((c) => ({
        t: c.asOf,
        v: c.price,
      })),
    }))
}
