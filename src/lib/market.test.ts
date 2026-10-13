import { describe, expect, test } from 'vitest'

import {
  chartRows,
  parseChart,
  parseRate,
  parseRateSeries,
  parseSearch,
} from './market'

describe('parseSearch', () => {
  test('keeps shares and funds, names them, drops the rest', () => {
    const json = {
      quotes: [
        {
          symbol: 'VWCE.DE',
          quoteType: 'ETF',
          longname: 'Vanguard FTSE All-World',
          exchDisp: 'XETRA',
        },
        {
          symbol: 'TSLA',
          quoteType: 'EQUITY',
          shortname: 'Tesla',
          exchange: 'NMS',
        },
        { symbol: 'TSLA250117C', quoteType: 'OPTION' },
        { quoteType: 'EQUITY' },
      ],
    }
    expect(parseSearch(json)).toEqual([
      {
        symbol: 'VWCE.DE',
        name: 'Vanguard FTSE All-World',
        exchange: 'XETRA',
        type: 'ETF',
      },
      { symbol: 'TSLA', name: 'Tesla', exchange: 'NMS', type: 'EQUITY' },
    ])
  })
  test('nothing from a shape it does not know', () => {
    expect(parseSearch(null)).toEqual([])
    expect(parseSearch({ quotes: 'x' })).toEqual([])
  })
})

describe('parseChart', () => {
  const chart = (meta: Record<string, unknown>) => ({
    chart: {
      result: [
        {
          meta,
          timestamp: [1789997400, 1790083800, 1790170200],
          indicators: { quote: [{ close: [375.3, null, 378.9] }] },
        },
      ],
    },
  })
  test('the latest price with its market time, and the closes', () => {
    const c = parseChart(
      chart({
        currency: 'USD',
        regularMarketPrice: 372.11,
        regularMarketTime: 1790366400,
      }),
    )
    expect(c).toEqual({
      currency: 'USD',
      price: 372.11,
      asOf: 1790366400000,
      closes: [
        { asOf: 1789997400000, price: 375.3 },
        { asOf: 1790170200000, price: 378.9 },
      ],
    })
  })
  test('no reading without a price, a time and a currency', () => {
    expect(
      parseChart(chart({ currency: 'USD', regularMarketTime: 1 })),
    ).toBeNull()
    expect(
      parseChart(chart({ regularMarketPrice: 1, regularMarketTime: 1 })),
    ).toBeNull()
    expect(parseChart({ chart: { result: [] } })).toBeNull()
  })
})

/* Candles and volume (13 Oct): the same answer carries each day's open,
   high, low and shares traded. */
describe('a day as a bar', () => {
  const answer = (quote: Record<string, Array<unknown>>, time = 1790107200) =>
    parseChart({
      chart: {
        result: [
          {
            meta: {
              currency: 'USD',
              regularMarketPrice: 379.5,
              regularMarketTime: time,
            },
            timestamp: [1789997400, 1790083800],
            indicators: { quote: [quote] },
          },
        ],
      },
    })
  const full = {
    close: [375.3, 378.9],
    open: [370, 376],
    high: [377, 380],
    low: [369.5, null],
    volume: [199_000, 0],
  }
  test('all four where Yahoo sent all four, the close alone otherwise', () => {
    expect(answer(full)?.closes).toEqual([
      {
        asOf: 1789997400000,
        price: 375.3,
        open: 370,
        high: 377,
        low: 369.5,
        volume: 199_000,
      },
      { asOf: 1790083800000, price: 378.9 },
    ])
  })
  test("the latest price takes its own day's bar, never a second row", () => {
    const c = answer({ ...full, low: [369.5, 375] })
    if (c === null) throw new Error('no reading')
    const rows = chartRows(c)
    expect(rows).toHaveLength(2)
    expect(rows[1]).toEqual({
      asOf: 1790107200000,
      price: 379.5,
      open: 376,
      high: 380,
      low: 375,
      volume: 0,
    })
  })
  test('a latest price on a day with no bar yet stands alone', () => {
    const c = answer(full, 1790107200 + 86_400)
    if (c === null) throw new Error('no reading')
    expect(chartRows(c).at(-1)).toEqual({
      asOf: (1790107200 + 86_400) * 1000,
      price: 379.5,
    })
    expect(chartRows(c)).toHaveLength(3)
  })
})

describe('parseRate', () => {
  test("euros per one, dated the ECB's day", () => {
    const r = parseRate({
      amount: 1,
      base: 'USD',
      date: '2026-09-25',
      rates: { EUR: 0.87696 },
    })
    expect(r?.rate).toBe(0.87696)
    expect(new Date(r!.asOf).toISOString().slice(0, 10)).toBe('2026-09-25')
  })
  test('nothing from a broken answer', () => {
    expect(parseRate({ rates: {} })).toBeNull()
    expect(parseRate({ rates: { EUR: 0.9 } })).toBeNull()
  })
})

describe('parseRateSeries', () => {
  test('a year of ECB days, oldest first, a bad day dropped', () => {
    expect(
      parseRateSeries({
        base: 'USD',
        rates: {
          '2026-09-22': { EUR: 0.87237 },
          '2026-09-21': { EUR: 0.87032 },
          '2026-09-23': { EUR: 'x' },
        },
      }),
    ).toEqual([
      { rate: 0.87032, asOf: Date.parse('2026-09-21T16:00:00Z') },
      { rate: 0.87237, asOf: Date.parse('2026-09-22T16:00:00Z') },
    ])
  })

  test('nothing usable: an empty list', () => {
    expect(parseRateSeries(null)).toEqual([])
    expect(parseRateSeries({ rates: 'no' })).toEqual([])
  })
})
