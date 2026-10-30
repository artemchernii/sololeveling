import { expect, test } from 'vitest'

import { ideasSuggested } from './ideasSuggest'
import type { Board } from './ideasRead'

const line = (
  part: 'add' | 'protect' | 'new',
  ticker: string,
  eur: number,
) => ({
  part,
  ticker,
  name: ticker,
  call: 'add' as const,
  eur,
  area: 'none' as const,
  why: '',
  eurWhy: '',
  numbers: [],
})
const board: Board = {
  take: 'x',
  parts: { keep: 15_664, protect: 12_000, add: 10_194, new: 8000 },
  lines: [
    line('add', 'GOOGL', 2500),
    line('add', 'AMZN', 7694),
    line('new', 'VEUR', 8000),
  ],
  sources: [],
}

test('from the plan: the biggest ADD, PROTECT, KEEP and the held mover', () => {
  const s = ideasSuggested(
    board,
    {
      trending: [{ symbol: 'CAT', name: 'CAT', change: -9.25 }],
      gainers: null,
      losers: [{ symbol: 'GOOGL', name: 'GOOGL', change: -12.6 }],
    },
    new Set(['GOOGL', 'AMZN']),
    45_858,
  )
  expect(s.map((x) => x.label)).toEqual([
    'ADD · AMZN',
    'PROTECT · €12,000',
    'KEEP · €15,664',
    'MINE · GOOGL -12.6%',
  ])
  expect(s[0].q).toBe('Why €7,694 into AMZN now, and not all at once?')
})

test('before a read: the idle cash, PROTECT and the biggest mover', () => {
  const s = ideasSuggested(
    null,
    {
      trending: [{ symbol: 'CAT', name: 'CAT', change: -9.25 }],
      gainers: null,
      losers: null,
    },
    new Set(),
    45_858,
  )
  expect(s.map((x) => x.kind)).toEqual(['keep', 'protect', 'mover'])
  expect(s[0].q).toBe('What should I do with €45,858 of idle cash?')
})
