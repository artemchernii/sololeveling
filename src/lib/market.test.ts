import { describe, expect, test } from 'vitest'

import { parseChart, parseRate, parseRateSeries, parseSearch } from './market'

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
