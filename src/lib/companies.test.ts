import { describe, expect, it } from 'vitest'

import {
  hasNews,
  parseAnalysts,
  parseEarnings,
  parseInsiders,
  usdShort,
} from './companies'

describe('YOUR COMPANIES parsers', () => {
  it('earnings: the latest entry for each held symbol, actual and expected', () => {
    const json = {
      earningsCalendar: [
        {
          symbol: 'GOOGL',
          date: '2026-07-23',
          epsActual: 2.3,
          epsEstimate: 2.1,
        },
        {
          symbol: 'GOOGL',
          date: '2026-10-28',
          epsActual: 2.12,
          epsEstimate: 3.1095,
        },
        {
          symbol: 'NVDA',
          date: '2026-11-19',
          epsActual: null,
          epsEstimate: 1.2,
        },
        { symbol: 'XOM', date: '2026-10-31', epsActual: 1.8, epsEstimate: 1.7 },
      ],
    }
    const m = parseEarnings(json, new Set(['GOOGL', 'NVDA']))
    expect(m.get('GOOGL')).toEqual({
      day: '2026-10-28',
      actual: 2.12,
      expected: 3.1095,
    })
    expect(m.get('NVDA')).toEqual({
      day: '2026-11-19',
      actual: null,
      expected: 1.2,
    })
    expect(m.has('XOM')).toBe(false)
    expect(parseEarnings(null, new Set(['GOOGL'])).size).toBe(0)
  })

  it('analysts: buy and hold this month and the month before', () => {
    const json = [
      {
        period: '2026-09-01',
        strongBuy: 20,
        buy: 43,
        hold: 7,
        sell: 0,
        strongSell: 0,
      },
      {
        period: '2026-10-01',
        strongBuy: 20,
        buy: 41,
        hold: 6,
        sell: 1,
        strongSell: 0,
      },
    ]
    expect(parseAnalysts(json)).toEqual({
      now: { month: '2026-10', buy: 61, hold: 6, sell: 1 },
      was: { month: '2026-09', buy: 63, hold: 7, sell: 0 },
    })
    expect(parseAnalysts({ error: 'x' })).toBeNull()
  })

  it('insiders: the biggest open-market buy or sale since the day, grants and tax left out', () => {
    const data = [
      {
        name: 'A',
        change: 489,
        transactionCode: 'C',
        transactionPrice: 0,
        transactionDate: '2026-10-25',
      },
      {
        name: 'B',
        change: -20,
        transactionCode: 'F',
        transactionPrice: 339,
        transactionDate: '2026-10-25',
      },
      {
        name: 'CFO',
        change: -12_000,
        transactionCode: 'S',
        transactionPrice: 350,
        transactionDate: '2026-10-27',
      },
      {
        name: 'CEO',
        change: 1000,
        transactionCode: 'P',
        transactionPrice: 340,
        transactionDate: '2026-10-28',
      },
      {
        name: 'Old',
        change: -90_000,
        transactionCode: 'S',
        transactionPrice: 300,
        transactionDate: '2026-09-01',
      },
    ]
    expect(parseInsiders({ data }, '2026-10-16')).toEqual({
      who: 'CFO',
      side: 'SELL',
      usd: 4_200_000,
      day: '2026-10-27',
    })
    expect(parseInsiders({ data: [] }, '2026-10-16')).toBeNull()
  })

  it('a row needs results or an insider trade; dollars read short', () => {
    const base = { symbol: 'X', name: 'X', valueEur: 1, analysts: null }
    expect(hasNews({ ...base, results: null, insider: null })).toBe(false)
    expect(
      hasNews({
        ...base,
        results: { day: '2026-10-28', actual: 1, expected: 1 },
        insider: null,
      }),
    ).toBe(true)
    expect(usdShort(4_200_000)).toBe('$4.2M')
    expect(usdShort(310_400)).toBe('$310K')
    expect(usdShort(33_000_000_000)).toBe('$33.0B')
  })
})
