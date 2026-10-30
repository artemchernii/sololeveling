import { expect, test } from 'vitest'

import {
  cellOf,
  chipsOf,
  parseScreener,
  parseTrending,
  tickerFacts,
  trendingOf,
} from './ideasBoard'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 29, 20)

test('a strip cell: the price, the close before and the change; a yield in points', () => {
  const s = {
    points: [
      { t: 1, v: 100 },
      { t: 2, v: 101 },
    ],
    previousClose: 100,
  }
  expect(cellOf('sp500', s)).toMatchObject({ price: 101, base: 100, change: 1 })
  expect(
    cellOf('us10y', { points: [{ t: 1, v: 4.1 }], previousClose: 4 }),
  ).toMatchObject({ change: 0.1 })
  expect(cellOf('vix', undefined)).toBeNull()
  expect(
    cellOf('vix', { points: [{ t: 1, v: 3 }], previousClose: null }),
  ).toBeNull()
})

test('movers: trending symbols, screeners with names and changes, null when unanswered', () => {
  expect(
    parseTrending({
      finance: {
        result: [{ quotes: [{ symbol: 'AMZN' }, { symbol: 'CAT' }] }],
      },
    }),
  ).toEqual(['AMZN', 'CAT'])
  expect(parseTrending(null)).toBeNull()
  expect(
    parseScreener({
      finance: {
        result: [
          {
            quotes: [
              {
                symbol: 'FMCC',
                shortName: 'Freddie',
                regularMarketChangePercent: 13.456,
              },
              { symbol: 'GE', regularMarketChangePercent: { raw: 4.7 } },
              { symbol: 'X' },
            ],
          },
        ],
      },
    }),
  ).toEqual([
    { symbol: 'FMCC', name: 'Freddie', change: 13.46 },
    { symbol: 'GE', name: 'GE', change: 4.7 },
  ])
  expect(parseScreener({ finance: { result: [] } })).toBeNull()
  expect(
    trendingOf(
      ['A', 'B'],
      new Map([['A', { points: [{ t: 1, v: 110 }], previousClose: 100 }]]),
    ),
  ).toEqual([{ symbol: 'A', name: 'A', change: 10 }])
})

test('a ticker: today from the close before, RSI, the 200-day average, the year high and the target', () => {
  const closes = Array.from({ length: 260 }, (_, i) => ({
    asOf: NOW - (260 - i) * DAY,
    price: 100 + i * 0.1,
  }))
  const f = tickerFacts(
    'AVGO',
    { currency: 'USD', price: 120, asOf: NOW, closes },
    { target: { mean: 150, low: 1, high: 2, count: 30 }, pe: { forward: 21 } },
    NOW,
  )!
  expect(f.day?.base).toBeCloseTo(125.9)
  expect(f.rsi).not.toBeNull()
  expect(f.sma200).not.toBeNull()
  expect(f.target).toEqual({ mean: 150, count: 30, pct: 25 })
  expect(f.pe).toBe(21)
  expect(f.points.length).toBeLessThanOrEqual(40)
  expect(chipsOf(f).map((c) => c.text)).toContain('TARGET ▲ 25%')
  expect(
    tickerFacts(
      'X',
      { currency: 'USD', price: 0, asOf: NOW, closes },
      null,
      NOW,
    ),
  ).toBeNull()
})

test('chips: overbought red, oversold green, the 200-day average when no target', () => {
  const base = {
    symbol: 'X',
    currency: 'USD',
    price: 1,
    at: 1,
    day: null,
    points: [],
    high: null,
    target: null,
    pe: null,
    dividend: null,
  }
  expect(chipsOf({ ...base, rsi: 74, sma200: { level: 1, pct: 3 } })).toEqual([
    { text: 'RSI 74 · OVERBOUGHT', tone: 'bad' },
    { text: 'SMA 200 · ABOVE', tone: 'good' },
  ])
  expect(chipsOf({ ...base, rsi: 27, sma200: null })).toEqual([
    { text: 'RSI 27 · OVERSOLD', tone: 'good' },
  ])
})
