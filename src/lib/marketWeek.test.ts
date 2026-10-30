import { describe, expect, test } from 'vitest'

import { factStories, parseWeek, weekBox } from './marketWeek'
import { resultsFacts } from './companies'
import type { Fact } from './marketRead'

const fact = (key: string, label: string, value: string): Fact => ({
  key,
  label,
  value,
  tone: null,
})
const keys = ['ecb', 'ecb-next', 'mkt-gold', 'res-AVGO', 'idea-AVGO']
const story = (over: Record<string, unknown> = {}) => ({
  kind: 'rates',
  title: 'The ECB kept its rate',
  line: 'No rise and no cut.',
  factKeys: ['ecb', 'ecb-next'],
  move: '',
  ...over,
})

describe('parseWeek', () => {
  test('keeps a story, its head and take', () => {
    const w = parseWeek(
      { weekHead: 'Rates held', weekTake: 'Two lines.', week: [story()] },
      keys,
    )
    expect(w.weekHead).toBe('Rates held')
    expect(w.week).toEqual([
      {
        kind: 'rates',
        title: 'The ECB kept its rate',
        line: 'No rise and no cut.',
        factKeys: ['ecb', 'ecb-next'],
        move: null,
      },
    ])
  })

  test('refuses an unknown kind and a key not in the facts', () => {
    const w = parseWeek(
      {
        week: [
          story({ kind: 'moon' }),
          story({ factKeys: ['ecb', 'mkt-moon'] }),
          story({ kind: 'gold', factKeys: [] }),
          story({ kind: 'none', factKeys: [] }),
        ],
      },
      keys,
    )
    expect(w.refused).toBe(3)
    expect(w.week.map((s) => s.kind)).toEqual(['none'])
  })

  test('keeps at most five stories', () => {
    const w = parseWeek(
      { week: Array.from({ length: 7 }, () => story()) },
      keys,
    )
    expect(w.week).toHaveLength(5)
    expect(w.refused).toBe(2)
  })

  test('a move must be on the board, once', () => {
    const w = parseWeek(
      {
        week: [
          story({ move: 'AVGO' }),
          story({ move: 'idea-AVGO' }),
          story({ move: 'ZZZZ' }),
          story({ move: { ticker: 'AVGO.DE' } }),
        ],
      },
      keys,
    )
    expect(w.week.map((s) => s.move)).toEqual([
      { ticker: 'AVGO' },
      null,
      null,
      null,
    ])
  })

  test('a read with no week is an empty week', () => {
    expect(parseWeek({}, keys)).toEqual({
      week: [],
      weekHead: '',
      weekTake: '',
      refused: 0,
    })
  })
})

describe('factStories', () => {
  const facts = [
    fact('ecb', 'ECB', '2.00% · SINCE 11 SEP'),
    fact('ecb-next', 'NEXT ECB', '29 OCT'),
    fact('mkt-us10y', 'US 10Y', '4.02% · ▼ 0.19 PTS'),
    fact('mkt-gold', 'GOLD', '▲ 3.9% · 1M'),
    fact('mkt-stoxx', 'STOXX 600', '▼ 0.6% · 1M'),
    fact('mkt-btc', 'BITCOIN', '▼ 4.1% · 1M'),
    fact('mkt-eurusd', 'EUR / USD', '▼ 1.2% · 1M'),
    fact('res-AVGO', 'AVGO RESULTS 28 OCT', '$2.31 · A SHARE · $2.10 EXPECTED'),
  ]

  test('rates, results and the biggest mover, with no words and no move', () => {
    const s = factStories(facts)
    expect(s.map((x) => x.kind)).toEqual(['rates', 'earn', 'mkt'])
    expect(s[0].title).toBe('ECB 2.00%')
    expect(s[0].factKeys).toEqual(['ecb', 'mkt-us10y', 'ecb-next'])
    expect(s[1].title).toBe('1 company held reported')
    expect(s[2].title).toBe('BITCOIN ▼ 4.1% in a month')
    expect(s[2].factKeys).toEqual(['mkt-btc', 'mkt-gold', 'mkt-eurusd'])
    expect(s.every((x) => x.line === '' && x.move === null)).toBe(true)
  })

  test('no facts, no stories', () => {
    expect(factStories([])).toEqual([])
  })
})

test('weekBox puts the move first', () => {
  expect(weekBox(fact('a', 'A', '▲ 3.9% · 1M'))).toEqual({
    value: '▲ 3.9%',
    note: '1M',
  })
  expect(
    weekBox(fact('e', 'E', 'CLOSE 28 OCT $184.00 · NOW $167.00 · ▼ 9.4%')),
  ).toEqual({ value: '▼ 9.4%', note: 'CLOSE 28 OCT $184.00 · NOW $167.00' })
  expect(weekBox(fact('r', 'R', '$2.31 · A SHARE · $2.10 EXPECTED'))).toEqual({
    value: '$2.31',
    note: 'A SHARE · $2.10 EXPECTED',
  })
})

test('resultsFacts: only results out, green when above expected', () => {
  const row = {
    symbol: 'AVGO',
    name: 'Broadcom',
    valueEur: 1000,
    analysts: null,
    insider: null,
  }
  expect(
    resultsFacts([
      { ...row, results: { day: '2026-10-28', actual: 2.31, expected: 2.1 } },
      {
        ...row,
        symbol: 'MSFT',
        results: { day: '2026-11-20', actual: null, expected: 1.2 },
      },
    ]),
  ).toEqual([
    {
      key: 'res-AVGO',
      label: 'AVGO RESULTS 28 OCT',
      value: '$2.31 · A SHARE · $2.10 EXPECTED',
      tone: 'good',
    },
  ])
})
