import { describe, expect, it } from 'vitest'

import { FRESH_DAYS, fundWays, verdict } from './indicators'
import type { Reading, Signal } from './indicators'
import { parseNews, parseRevenue, parseSummary } from './yahooFundamentals'
import summary from './samples/yahoo-summary-AVGO.json'
import fund from './samples/yahoo-summary-VUAA.json'
import revenue from './samples/yahoo-revenue-AVGO.json'
import news from './samples/yahoo-news-AVGO.json'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 16, 8)

/* Three line rows at a price of $343.86: sma 50 and sma 200 as the
   price against them in %, rsi as its value. */
const rows = (d50: number, d200: number, r: number): Array<Signal> =>
  (
    [
      ['sma50', d50],
      ['sma200', d200],
      ['rsi', r],
    ] as const
  ).map(([id, pct]) => ({
    id,
    verdict: '',
    way: 'flat',
    pct,
    at: 50,
    price: 343.86,
    level: 0,
  }))
const ADD = rows(-4.4, 9.8, 36)
const good: Reading = {
  asOf: NOW - DAY,
  targetMean: 412.5,
  revenueGrowth: 0.22,
  ratingMean: 1.6,
}
const read = (over: Partial<Reading>) =>
  verdict(ADD, { reading: { ...good, ...over }, now: NOW })

describe('verdict with fundamentals', () => {
  it('keeps an ADD when the readings agree, and names all three', () => {
    const v = verdict(ADD, { reading: good, now: NOW })
    expect(v?.call).toBe('add')
    expect(v?.feed).toBe('used')
    expect(v?.why).toEqual(['sma200', 'sma50', 'target', 'revenue', 'rating'])
  })

  it('holds an ADD back at or above the avg target', () => {
    const v = verdict(ADD, {
      reading: { ...good, targetMean: 331 },
      now: NOW,
      say: (n) => `$${n.toFixed(2)}`,
    })
    expect(v?.call).toBe('hold')
    expect(v?.why).toEqual(['target'])
    expect(v?.line).toContain("analysts' avg target of $331.00")
    expect(read({ targetMean: 343.86 })?.call).toBe('hold')
    expect(read({ targetMean: 343.87 })?.call).toBe('add')
  })

  it('holds an ADD back when revenue shrank, not when it stayed flat', () => {
    const v = read({ revenueGrowth: -0.04 })
    expect(v?.call).toBe('hold')
    expect(v?.why).toEqual(['revenue'])
    expect(v?.line).toContain('revenue fell 4.0% on a year before')
    expect(read({ revenueGrowth: 0 })?.call).toBe('add')
  })

  it('holds an ADD back on a rating of 3.5 or worse', () => {
    expect(read({ ratingMean: 3.6 })?.why).toEqual(['rating'])
    expect(read({ ratingMean: 3.5 })?.call).toBe('hold')
    expect(read({ ratingMean: 3.49 })?.call).toBe('add')
  })

  it('checks the target first when several hold it back', () => {
    expect(read({ targetMean: 300, revenueGrowth: -0.1 })?.why).toEqual([
      'target',
    ])
  })

  it('never makes an ADD and never touches HOLD or WAIT', () => {
    const bad = { ...good, targetMean: 100, revenueGrowth: -0.5 }
    for (const r of [rows(3.8, 6.6, 67), rows(-4.3, -14.1, 37)]) {
      const lines = verdict(r)
      const both = verdict(r, { reading: bad, now: NOW })
      expect(both?.call).toBe(lines?.call)
      expect(both?.why).toEqual(lines?.why)
      expect(verdict(r, { reading: good, now: NOW })?.call).toBe(lines?.call)
    }
  })

  it('reads the lines alone past 7 days, or with no reading', () => {
    const old = { ...good, targetMean: 300 }
    const at7 = verdict(ADD, {
      reading: { ...old, asOf: NOW - FRESH_DAYS * DAY },
      now: NOW,
    })
    expect(at7?.call).toBe('hold')
    const at8 = verdict(ADD, {
      reading: { ...old, asOf: NOW - 8 * DAY },
      now: NOW,
    })
    expect(at8?.call).toBe('add')
    expect(at8?.feed).toBe('old')
    expect(at8?.why).toEqual(['sma200', 'sma50'])
    expect(verdict(ADD, { reading: null })?.feed).toBe('none')
  })

  it('names only the readings there are', () => {
    const v = verdict(ADD, {
      reading: { asOf: NOW, ratingMean: 2 },
      now: NOW,
    })
    expect(v?.why).toEqual(['sma200', 'sma50', 'rating'])
  })
})

describe('fundWays', () => {
  it('points each reading up, down or flat', () => {
    expect(fundWays(good, 343.86)).toEqual({
      target: 'up',
      revenue: 'up',
      rating: 'up',
    })
    expect(
      fundWays(
        { asOf: 0, targetMean: 300, revenueGrowth: -0.01, ratingMean: 3 },
        343.86,
      ),
    ).toEqual({ target: 'down', revenue: 'down', rating: 'flat' })
    expect(fundWays({ asOf: 0, ratingMean: 3.5 }, 1)).toEqual({
      rating: 'down',
    })
  })
})

describe('Yahoo parsers', () => {
  it("reads a company's quoteSummary", () => {
    expect(parseSummary(summary)).toEqual({
      currency: 'USD',
      industry: 'Semiconductors',
      target: { mean: 412.5, low: 310, high: 500, count: 41 },
      rating: {
        mean: 1.6,
        key: 'buy',
        strongBuy: 14,
        buy: 22,
        hold: 5,
        sell: 0,
        strongSell: 0,
      },
      revenueGrowth: 0.22,
      pe: { forward: 33.8, trailing: 88.4 },
      dividend: { yield: 0.0069, rate: 2.36, exDay: 1789948800000 },
    })
  })

  it("reads a fund's answer as no target, no rating", () => {
    expect(parseSummary(fund)).toEqual({
      currency: 'USD',
      pe: { trailing: 27.1 },
    })
    expect(parseSummary({ quoteSummary: { result: null } })).toBeNull()
    expect(parseSummary('Too Many Requests')).toBeNull()
  })

  it('picks the last quarter and the same quarter a year before', () => {
    expect(parseRevenue(revenue)).toEqual({
      now: { asOf: Date.parse('2026-07-31'), value: 29591000000 },
      was: { asOf: Date.parse('2025-07-31'), value: 15952000000 },
    })
    expect(parseRevenue({ timeseries: { result: [{}] } })).toBeNull()
  })

  it('keeps at most 8 headlines, newest first, each with its link', () => {
    const h = parseNews(news)
    expect(h).toHaveLength(8)
    expect(h[0]).toEqual({
      title: 'Should You Buy Qualcomm Stock For Its Cash?',
      publisher: 'Trefis',
      at: 1792206181000,
      link: expect.stringMatching(/^https:\/\/finance\.yahoo\.com\//),
    })
    expect(h.map((x) => x.at)).toEqual(
      [...h.map((x) => x.at)].sort((a, b) => b - a),
    )
    expect(parseNews(news, 3)).toHaveLength(3)
    expect(
      parseNews({
        news: [
          {
            title: 'x',
            publisher: 'y',
            link: 'javascript:1',
            providerPublishTime: 1,
          },
        ],
      }),
    ).toEqual([])
    expect(parseNews(null)).toEqual([])
  })
})
