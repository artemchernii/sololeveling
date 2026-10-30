import { describe, expect, test } from 'vitest'

import type { BoardLine } from './ideasRead'
import type { MarketNumbers } from './marketRead'
import { boxOf, ideaFacts, ideaOf, moveWords, readMine } from './readMine'
import type { MineInput } from './readMine'

const rate = (
  id: MarketNumbers['rates'][number]['id'],
  value: number | null,
  prev: number | null = null,
): MarketNumbers['rates'][number] => ({
  id,
  reached: value !== null,
  value,
  upper: null,
  month: '2026-09',
  prev,
  prevMonth: '2026-08',
  since: null,
  next: null,
})

const base: MineInput = {
  cash: { idle: 45858, banks: 13425, broker: 32433 },
  invested: 18828,
  rates: [rate('eu-hicp', 3.8, 3.1), rate('ecb', 2)],
  markets: [{ id: 'eurusd', move: { price: 1.072, change: -3.1 } }],
  alloc: [
    { id: 'us', mine: 72, world: 70 },
    { id: 'europe', mine: 2, world: 15 },
    { id: 'gold', mine: null, world: null },
  ],
  owned: [
    { symbol: 'IGLN', name: 'Gold', paid: 1469, valueEur: 2071 },
    { symbol: 'GOOGL', name: 'Alphabet', paid: 1300, valueEur: 1180 },
  ],
}
const get = (facts: ReturnType<typeof readMine>, key: string) =>
  facts.find((f) => f.key === key)

describe('readMine', () => {
  test('cash lost to prices is cash × euro inflation, both shown', () => {
    const f = get(readMine(base), 'me-cash-lost')
    expect(f?.value).toBe('−€1,743 · 3.8% · €45,858 CASH')
    expect(f?.tone).toBe('bad')
    expect(get(readMine(base), 'me-cash-ecb')?.value).toBe(
      '+€917 · 2.0% · €45,858 CASH',
    )
  })

  test('the dollar: a stronger dollar lifts the US part in euros', () => {
    const facts = readMine(base)
    expect(get(facts, 'me-us-eur')?.value).toBe(
      '€13,556 · 72% · €18,828 INVESTED',
    )
    const d = get(facts, 'me-dollar')
    expect(d?.value).toBe('+€434 · EUR/USD ▼ 3.1% · €13,556 IN US')
    expect(d?.tone).toBe('good')
  })

  test('tax on a sale only where there is a gain', () => {
    const facts = readMine(base)
    expect(get(facts, 'me-tax-IGLN')?.value).toBe('−€169 · 28% · €602 PROFIT')
    expect(get(facts, 'me-tax-GOOGL')).toBeUndefined()
  })

  test('an area with no share, a rate not reached: no fact, never a guess', () => {
    const facts = readMine({
      ...base,
      rates: [rate('eu-hicp', null), rate('ecb', 2)],
      markets: [],
    })
    expect(get(facts, 'me-cash-lost')).toBeUndefined()
    expect(get(facts, 'me-prices')).toBeUndefined()
    expect(get(facts, 'me-dollar')).toBeUndefined()
    expect(get(facts, 'me-alloc-gold')).toBeUndefined()
    expect(get(facts, 'me-alloc-europe')?.value).toBe('2% · WORLD 15%')
  })

  test('nothing read yet: no cash facts', () => {
    const facts = readMine({ ...base, cash: null, invested: null, alloc: null })
    expect(facts.map((f) => f.key)).toEqual([
      'me-prices',
      'me-ecb',
      'me-tax-IGLN',
    ])
  })
})

const line = (b: Partial<BoardLine>): BoardLine => ({
  part: 'protect',
  ticker: 'XEON',
  name: 'Euro overnight rate',
  call: 'add',
  eur: 9000,
  area: 'none',
  why: '',
  eurWhy: '',
  numbers: [],
  ...b,
})

describe('the IDEAS move a line points at', () => {
  const board = [
    line({}),
    line({ part: 'add', ticker: 'GOOGL', name: 'Alphabet', eur: 2500 }),
    line({
      part: 'add',
      ticker: 'MSFT',
      name: 'Microsoft',
      call: 'hold',
      eur: 0,
    }),
  ]
  test('only lines with an amount are offered', () => {
    expect(ideaFacts(board).map((f) => f.key)).toEqual([
      'idea-XEON',
      'idea-GOOGL',
    ])
  })
  test('looked up on the board as it is now', () => {
    expect(ideaOf('googl', board)?.eur).toBe(2500)
    expect(ideaOf('MSFT', board)).toBeNull()
    expect(ideaOf('XEON', null)).toBeNull()
    expect(ideaOf(undefined, board)).toBeNull()
  })
  test('the button says the move in words', () => {
    expect(moveWords(board[0])).toBe('Move €9,000 to XEON')
    expect(moveWords(board[1])).toBe('Buy Alphabet for €2,500')
    expect(
      moveWords(
        line({
          part: 'new',
          ticker: 'VEUR',
          name: 'European shares',
          eur: 6000,
        }),
      ),
    ).toBe('Put €6,000 into European shares (VEUR)')
  })
  test('a fact as a box: number, then what it is', () => {
    expect(
      boxOf({
        key: 'k',
        label: 'L',
        value: '−€1,743 · 3.8% · €45,858 CASH',
        tone: null,
      }),
    ).toEqual({ label: 'L', value: '−€1,743', note: '3.8% · €45,858 CASH' })
  })
})
