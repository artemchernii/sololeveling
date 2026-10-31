import { describe, expect, it } from 'vitest'

import { weekCards } from './mineWeek'
import type { WeekClose } from './mineWeek'
import type { CompanyRow } from './companies'

const NOW = Date.parse('2026-10-31T12:00:00Z')
const DAY = 86_400_000

const close = (symbol: string, base: number, price: number): WeekClose => ({
  symbol,
  base,
  baseAt: NOW - 7 * DAY,
  price,
  at: NOW - 3_600_000,
  currency: 'USD',
  change: Math.round((price / base - 1) * 10_000) / 100,
})
const row = (symbol: string, over: Partial<CompanyRow> = {}): CompanyRow => ({
  symbol,
  name: symbol,
  valueEur: null,
  results: null,
  analysts: null,
  insider: null,
  ...over,
})

describe('MINE · THIS WEEK', () => {
  const held = [
    { symbol: 'GOOGL', name: 'Alphabet', valueEur: 1022 },
    { symbol: 'MSFT', name: 'Microsoft', valueEur: 1266 },
    { symbol: 'AAPL', name: 'Apple', valueEur: 900 },
    { symbol: 'NFLX', name: 'Netflix', valueEur: 1011 },
    { symbol: 'META', name: 'Meta', valueEur: 1017 },
  ]
  const closes = new Map([
    ['GOOGL', close('GOOGL', 324.89, 279.84)],
    ['MSFT', close('MSFT', 500, 515.5)],
    ['AAPL', close('AAPL', 200, 202)],
    ['NFLX', close('NFLX', 1000, 990)],
  ])
  const rows = [
    row('GOOGL', {
      results: { day: '2026-10-28', actual: 2.12, expected: 3.11 },
    }),
    row('MSFT', {
      results: { day: '2026-10-28', actual: 4.89, expected: 4.82 },
    }),
    /* Results three weeks ago and one still to come: not this week. */
    row('AAPL', {
      results: { day: '2026-11-12', actual: null, expected: 1.6 },
    }),
    row('META', {
      insider: { who: 'Olivan', side: 'SELL', usd: 669_000, day: '2026-10-27' },
    }),
  ]
  const funds = [
    {
      symbol: 'NFLX',
      fund: 'Bridgewater',
      was: 78_000,
      now: 0,
      wasPeriod: '2026-03-31',
      nowPeriod: '2026-06-30',
    },
  ]

  it('a card for a 5% move or news, biggest move first; a quiet one left out', () => {
    const cards = weekCards(held, closes, rows, funds, NOW)
    expect(cards.map((c) => c.symbol)).toEqual([
      'GOOGL',
      'MSFT',
      'NFLX',
      'META',
    ])
    expect(cards[0].reasons).toEqual([
      { kind: 'results', day: '2026-10-28', actual: 2.12, expected: 3.11 },
    ])
    expect(cards[2].reasons[0]).toMatchObject({ kind: 'fund' })
    expect(cards[3]).toMatchObject({ close: null, wasEur: null, nowEur: 1017 })
    expect(cards[3].reasons[0]).toMatchObject({ kind: 'insider', usd: 669_000 })
  })

  it('WAS is the same shares at the close a week back', () => {
    const [g] = weekCards(held, closes, rows, funds, NOW)
    expect(g.nowEur).toBe(1022)
    expect(g.wasEur).toBe(Math.round((1022 * 324.89) / 279.84))
  })

  it('a move of 5% with no news is a card too', () => {
    const cards = weekCards(
      [{ symbol: 'RDDT', name: 'Reddit', valueEur: 500 }],
      new Map([['RDDT', close('RDDT', 100, 94)]]),
      [],
      [],
      NOW,
    )
    expect(cards).toHaveLength(1)
    expect(cards[0].reasons).toEqual([])
  })

  it('results or a trade older than seven days are not news this week', () => {
    const cards = weekCards(
      [{ symbol: 'X', name: 'X', valueEur: 1 }],
      new Map(),
      [
        row('X', {
          results: { day: '2026-10-20', actual: 1, expected: 1 },
          insider: { who: 'A', side: 'BUY', usd: 1, day: '2026-10-21' },
        }),
      ],
      [],
      NOW,
    )
    expect(cards).toEqual([])
  })
})
