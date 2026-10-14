import { describe, expect, test } from 'vitest'

import { landedSplit } from './buysLanded'

const at = (symbol: string, buys: number, sells = 0) => ({
  symbol,
  name: symbol,
  type: 'ETF',
  buys,
  sells,
  read: ['iShares Physical Gold'],
})

describe('landedSplit', () => {
  test('every row on the thing', () => {
    expect(landedSplit([at('IGLN.L', 7, 2)], ['IGLN.L'])).toEqual({
      here: 9,
      away: [],
      all: 9,
    })
  })
  test('his 14 Oct save: all nine on another thing', () => {
    const r = landedSplit([at('SHLD.L', 9)], ['IGLN.L'])
    expect(r.here).toBe(0)
    expect(r.away.map((a) => a.symbol)).toEqual(['SHLD.L'])
  })
  test('another listing of the same thing counts as the thing', () => {
    const r = landedSplit(
      [at('IGLN.L', 2), at('SGLN.L', 3), at('SHLD.L', 1)],
      ['IGLN.L', 'SGLN.L'],
    )
    expect([r.here, r.away.length, r.all]).toEqual([5, 1, 6])
  })
  test('nothing saved', () => {
    expect(landedSplit([], ['IGLN.L'])).toEqual({ here: 0, away: [], all: 0 })
  })
})
