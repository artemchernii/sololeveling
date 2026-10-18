import { describe, expect, it } from 'vitest'

import { regionOfCountry, tagsOf } from './tags'

describe('tagsOf', () => {
  it('a share: its stored sector and its country by region', () => {
    expect(
      tagsOf({
        kind: 'stock',
        name: 'ASML',
        sector: 'tech',
        country: 'Netherlands',
      }),
    ).toEqual({ sector: 'tech', region: 'europe' })
    expect(
      tagsOf({
        kind: 'stock',
        name: 'NVIDIA',
        sector: 'tech',
        country: 'United States',
      }),
    ).toEqual({ sector: 'tech', region: 'us' })
  })

  it('a share not read yet: MISSING on both', () => {
    expect(tagsOf({ kind: 'stock', name: 'Coca-Cola' })).toEqual({
      sector: 'missing',
      region: 'missing',
    })
  })

  it('an index fund: ETF, its region from its name', () => {
    expect(
      tagsOf({ kind: 'etf', name: 'Vanguard S&P 500 UCITS ETF (Acc)' }),
    ).toEqual({ sector: 'etf', region: 'us' })
    expect(
      tagsOf({ kind: 'etf', name: 'Vanguard FTSE All-World UCITS ETF' }),
    ).toEqual({ sector: 'etf', region: 'world' })
  })

  it('a theme fund: its theme, and no region in its name', () => {
    expect(
      tagsOf({ kind: 'etf', name: 'Global X Defence Tech UCITS ETF' }),
    ).toEqual({ sector: 'tech', region: 'etf · no region' })
    expect(
      tagsOf({ kind: 'etf', name: 'iShares Digital Security UCITS ETF USD' }),
    ).toEqual({ sector: 'cyber security', region: 'etf · no region' })
  })

  it('a coin and gold have no country', () => {
    expect(tagsOf({ kind: 'crypto', name: 'Bitcoin' })).toEqual({
      sector: 'coin',
      region: 'no country',
    })
    expect(tagsOf({ kind: 'gold', name: 'Gold' })).toEqual({
      sector: 'gold',
      region: 'no country',
    })
  })
})

describe('regionOfCountry', () => {
  it('Yahoo country words', () => {
    expect(regionOfCountry('United States')).toBe('us')
    expect(regionOfCountry('Denmark')).toBe('europe')
    expect(regionOfCountry('Japan')).toBe('asia')
    expect(regionOfCountry('Canada')).toBe('other')
  })
})
