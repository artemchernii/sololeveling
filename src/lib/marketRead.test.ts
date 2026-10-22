import { describe, expect, test } from 'vitest'

import {
  marketFacts,
  nextMonthWord,
  parseMarketRead,
  readCost,
  ROWS_ASK_MODEL,
} from './marketRead'
import { CANNED_MARKET_READS } from './marketReadCanned'
import type { MarketNumbers } from './marketRead'

const numbers: MarketNumbers = {
  rates: [
    {
      id: 'us-cpi',
      reached: true,
      value: 2.9,
      upper: null,
      month: '2026-09',
      prev: 3.1,
      prevMonth: '2026-08',
      since: null,
      next: null,
    },
    {
      id: 'fed',
      reached: false,
      value: null,
      upper: null,
      month: null,
      prev: null,
      prevMonth: null,
      since: null,
      next: null,
    },
    {
      id: 'ecb',
      reached: true,
      value: 2,
      upper: null,
      month: null,
      prev: null,
      prevMonth: null,
      since: '2026-09-11',
      next: '2026-10-29',
    },
  ],
  markets: [
    { id: 'sp500', move: { price: 6612, change: 2.4 } },
    { id: 'us10y', move: { price: 4.02, change: -0.19 } },
    { id: 'btc', move: null },
  ],
  sectors: [{ id: 'tech', change: 5.8 }],
  companies: [{ symbol: 'NVDA', change: -1.25 }],
  regions: [{ id: 'japan', change: null }],
}

describe('marketFacts', () => {
  test('the room as facts: rates, markets, sectors, positions; nothing not reached', () => {
    const facts = marketFacts(numbers, [
      { symbol: 'AVGO', name: 'Broadcom', valueEur: 600 },
      { symbol: 'VUAA', name: 'Vanguard S&P 500', valueEur: 1400 },
      { symbol: 'OZON', name: 'Ozon', valueEur: null },
    ])
    const by = (k: string) => facts.find((f) => f.key === k)
    expect(by('us-cpi')).toMatchObject({ label: 'US CPI SEP', value: '2.9%' })
    expect(by('us-cpi-was')).toMatchObject({
      label: 'US CPI AUG',
      value: '3.1%',
    })
    expect(by('fed')).toBeUndefined()
    expect(by('ecb')?.value).toBe('2.00% · SINCE 11 SEP')
    expect(by('ecb-next')?.value).toBe('29 OCT')
    expect(by('mkt-sp500')).toMatchObject({
      value: '▲ 2.4% · 1M',
      tone: 'good',
    })
    expect(by('mkt-us10y')?.value).toBe('4.02% · ▼ 0.19 PTS')
    expect(by('mkt-btc')).toBeUndefined()
    expect(by('co-NVDA')).toMatchObject({ value: '▼ 1.3% · 1M', tone: 'bad' })
    expect(by('reg-japan')).toBeUndefined()
    expect(by('mine')?.value).toBe('€2,000 · 2 POSITIONS')
    expect(
      facts.filter((f) => f.key.startsWith('pos-')).map((f) => f.key),
    ).toEqual(['pos-VUAA', 'pos-AVGO'])
    expect(by('pos-AVGO')?.value).toBe('€600 · 30.0%')
  })

  test('no positions: no MINE fact', () => {
    expect(marketFacts(numbers, []).some((f) => f.key === 'mine')).toBe(false)
  })
})

describe('parseMarketRead', () => {
  const keys = [
    'us-cpi',
    'us-cpi-was',
    'eu-hicp',
    'ecb',
    'ecb-next',
    'sec-tech',
    'co-NVDA',
    'co-AVGO',
    'pos-AVGO',
    'mine',
    'mkt-sp500',
  ]

  test('S6 a line naming a key not given is refused, and counted', () => {
    const r = parseMarketRead(CANNED_MARKET_READS.broken, keys)
    expect(r.ok && r.refused).toBe(1)
    expect(r.ok && r.read.lines.map((l) => l.title)).not.toContain(
      'A number from nowhere',
    )
  })

  test('kpis keep only known keys; an idea on a ticker owned is dropped', () => {
    const r = parseMarketRead(
      {
        ...CANNED_MARKET_READS.calm,
        kpis: ['mkt-sp500', 'mkt-moon'],
        ideas: [{ ...CANNED_MARKET_READS.calm.ideas[0], ticker: 'avgo' }],
      },
      keys,
    )
    expect(r.ok && r.read.kpis).toEqual(['mkt-sp500'])
    expect(r.ok && r.read.ideas).toEqual([])
  })

  test('a NO DATA line needs no fact; fewer than three lines fails', () => {
    const r = parseMarketRead(CANNED_MARKET_READS.mixed, [
      'us-cpi',
      'us-cpi-was',
      'mkt-btc',
      'mkt-sp500',
    ])
    expect(r.ok && r.read.lines.map((l) => l.kind)).toEqual([
      'inflation',
      'nodata',
      'market',
    ])
    expect(parseMarketRead(CANNED_MARKET_READS.mixed, ['us-cpi']).ok).toBe(
      false,
    )
    expect(parseMarketRead('not json', keys)).toEqual({
      ok: false,
      error: 'BROKEN SHAPE',
    })
  })
})

test('cost from usage: tokens and searches, to the tenth of a cent', () => {
  expect(readCost({ input: 61_800, output: 3_100, searches: 8 })).toBe(0.235)
  expect(readCost({ input: 0, output: 0, searches: 0 })).toBe(0)
  /* ⌘J asks Haiku 5.5: his 30K-token question, $0.06 on Sonnet */
  expect(
    readCost({ input: 30_000, output: 249, searches: 0 }, ROWS_ASK_MODEL),
  ).toBe(0.004)
  /* a prompt over 100K is priced at the long rate */
  expect(
    readCost({ input: 200_000, output: 1_000, searches: 0 }, ROWS_ASK_MODEL),
  ).toBe(0.103)
})

test('the next month starts on the 1st, December rolls to January', () => {
  expect(nextMonthWord('2026-10')).toBe('1 NOV')
  expect(nextMonthWord('2026-12')).toBe('1 JAN')
})
