import { describe, expect, it } from 'vitest'

import {
  OPP_ROWS,
  cheapTargetAbove,
  countryOf,
  downFromHigh,
  levelOf,
  oppOf,
  parseFred,
  parseQuote,
} from './opportunities'
import type { Quote } from './opportunities'

const SECTORS = [
  { industry: 'Drugs (Pharmaceutical)', firms: 250, forwardPe: 26 },
  { industry: 'Software (System & Application)', firms: 300, forwardPe: 31 },
]

const quote = (over: Partial<Quote> = {}): Quote => ({
  symbol: 'X',
  name: 'X',
  currency: 'USD',
  price: 70,
  high: 100,
  industry: 'Drug Manufacturers - General',
  target: { mean: 90, count: 20 },
  rating: { mean: 2, buy: 15, hold: 5, sell: 0 },
  pe: 13,
  dividend: null,
  ...over,
})
const opp = (over: Partial<Quote> = {}) => oppOf(quote(over), 'x.com', SECTORS)

describe('parseQuote', () => {
  it('reads the price, the 52-week high, the target, the counts and the P/E', () => {
    const json = {
      quoteSummary: {
        result: [
          {
            price: {
              regularMarketPrice: { raw: 342 },
              currency: 'DKK',
              shortName: 'Novo Nordisk A/S',
            },
            summaryDetail: {
              fiftyTwoWeekHigh: { raw: 712 },
              forwardPE: { raw: 13.2 },
              dividendYield: { raw: 0.031 },
            },
            financialData: {
              targetMeanPrice: { raw: 458 },
              targetLowPrice: { raw: 300 },
              targetHighPrice: { raw: 600 },
              numberOfAnalystOpinions: { raw: 32 },
              recommendationMean: { raw: 2.1 },
              recommendationKey: 'buy',
              financialCurrency: 'DKK',
            },
            recommendationTrend: {
              trend: [
                {
                  period: '0m',
                  strongBuy: 8,
                  buy: 12,
                  hold: 12,
                  sell: 1,
                  strongSell: 0,
                },
              ],
            },
            assetProfile: { industry: 'Drug Manufacturers - General' },
          },
        ],
      },
    }
    expect(parseQuote('NOVO-B.CO', json)).toEqual({
      symbol: 'NOVO-B.CO',
      name: 'Novo Nordisk A/S',
      currency: 'DKK',
      price: 342,
      high: 712,
      industry: 'Drug Manufacturers - General',
      target: { mean: 458, count: 32 },
      rating: { mean: 2.1, buy: 20, hold: 12, sell: 1 },
      pe: 13.2,
      dividend: 0.031,
    })
  })

  it('is null without a price or a 52-week high', () => {
    expect(parseQuote('X', { quoteSummary: { result: [{ price: {} }] } })).toBe(
      null,
    )
    expect(parseQuote('X', null)).toBe(null)
  })
})

describe('downFromHigh', () => {
  it('keeps 20% or more below the high, Buy or better from 5+, target above; furthest first', () => {
    const rows = [
      opp({ symbol: 'A', price: 70 }),
      opp({ symbol: 'B', price: 48, target: { mean: 60, count: 9 } }),
      opp({ symbol: 'NEAR', price: 81 }),
      opp({ symbol: 'HOLD', rating: { mean: 2.8, buy: 3, hold: 9, sell: 1 } }),
      opp({ symbol: 'FEW', target: { mean: 90, count: 4 } }),
      opp({ symbol: 'UNDER', target: { mean: 65, count: 20 } }),
      opp({ symbol: 'NONE', rating: null }),
    ]
    expect(downFromHigh(rows).map((o) => o.symbol)).toEqual(['B', 'A'])
  })

  it('shows the distances by between(): from the high, and to the target', () => {
    const o = opp({ price: 342, high: 712, target: { mean: 458, count: 32 } })
    expect(o.fromHigh).toBeCloseTo(-51.97, 2)
    expect(o.toTarget).toBeCloseTo(33.92, 2)
    expect(o.sector).toEqual({ industry: 'Drugs (Pharmaceutical)', pe: 26 })
  })

  it('is at most eight rows', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      opp({ symbol: `S${i}`, price: 50 + i }),
    )
    expect(downFromHigh(many)).toHaveLength(OPP_ROWS)
  })
})

describe('cheapTargetAbove', () => {
  it('keeps P/E under the sector and a target 15%+ above; furthest target first', () => {
    const rows = [
      opp({ symbol: 'A', price: 80, target: { mean: 95, count: 10 } }),
      opp({ symbol: 'B', price: 80, target: { mean: 110, count: 10 } }),
      opp({ symbol: 'DEAR', pe: 30 }),
      opp({ symbol: 'LOW', price: 80, target: { mean: 90, count: 10 } }),
      opp({ symbol: 'NOSECTOR', industry: 'Unknown' }),
      opp({ symbol: 'NOPE', pe: null }),
      opp({ symbol: 'LOSS', pe: -4 }),
    ]
    expect(cheapTargetAbove(rows).map((o) => o.symbol)).toEqual(['B', 'A'])
  })
})

describe('levelOf', () => {
  const D = 86_400_000
  const now = Date.UTC(2026, 9, 30)
  it('now, a year ago and the high, with the % from the high and over the year', () => {
    const l = levelOf([
      { t: now - 380 * D, v: 1 },
      { t: now - 364 * D, v: 2765 },
      { t: now - 22 * D, v: 4148 },
      { t: now, v: 3899 },
    ])
    expect(l?.yearAgo.v).toBe(2765)
    expect(l?.high).toEqual({ t: now - 22 * D, v: 4148 })
    expect(l?.fromHigh).toBeCloseTo(-6.0, 1)
    expect(l?.year).toBeCloseTo(41.0, 1)
  })
  it('is null with fewer than two closes', () => {
    expect(levelOf([{ t: now, v: 1 }])).toBe(null)
  })
})

describe('parseFred', () => {
  it('leaves out the days FRED marks "."', () => {
    expect(
      parseFred({
        observations: [
          { date: '2026-10-29', value: '3.61' },
          { date: '2026-10-30', value: '.' },
        ],
      }),
    ).toEqual([{ t: Date.parse('2026-10-29'), v: 3.61 }])
  })
})

describe('countryOf', () => {
  it('by the listing suffix, and US-listed companies from elsewhere by name', () => {
    expect(countryOf('NOVO-B.CO')).toBe('DK')
    expect(countryOf('005930.KS')).toBe('KR')
    expect(countryOf('MELI')).toBe('AR')
    expect(countryOf('ADBE')).toBe('US')
  })
})
