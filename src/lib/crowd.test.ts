import { describe, expect, it } from 'vitest'

import { parseCrowd } from './crowd'

describe('parseCrowd', () => {
  it('the top five, one per company, with the 24 hours before', () => {
    const results = [
      ['GOOG', 'Alphabet (Google)', 367, 507],
      ['RDDT', 'Reddit', 336, 55],
      ['GOOGL', 'Alphabet (Google)', 241, 207],
      ['INTC', 'Intel', 206, 17],
      ['AMZN', 'Amazon', 189, '120'],
      ['NVDA', 'NVIDIA', 150, null],
      ['TSLA', 'Tesla', 90, 80],
    ].map(([ticker, name, mentions, was]) => ({
      ticker,
      name,
      mentions,
      mentions_24h_ago: was,
    }))
    expect(parseCrowd({ results })).toEqual([
      { ticker: 'GOOG', name: 'Alphabet (Google)', mentions: 367, was: 507 },
      { ticker: 'RDDT', name: 'Reddit', mentions: 336, was: 55 },
      { ticker: 'INTC', name: 'Intel', mentions: 206, was: 17 },
      { ticker: 'AMZN', name: 'Amazon', mentions: 189, was: 120 },
      { ticker: 'NVDA', name: 'NVIDIA', mentions: 150, was: null },
    ])
  })
  it('nothing when the answer is not the list', () => {
    expect(parseCrowd(null)).toEqual([])
    expect(parseCrowd({ results: 'x' })).toEqual([])
  })
})
