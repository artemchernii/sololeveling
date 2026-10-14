import { describe, expect, test } from 'vitest'

import { fromName, fromYahoo, parseSector } from './sector'

describe('fromName — his funds, by the words in their names', () => {
  test.each([
    ['Vanguard FTSE Developed Asia Pacific ex Japan UCITS ETF', 'asia pacific'],
    ['iShares Digital Security UCITS ETF USD Dist', 'cyber security'],
    ['iShares Physical Gold ETC', 'gold'],
    ['Vanguard S&P 500 UCITS ETF (USD) Accumulating', 'us'],
    ['Invesco EQQQ Nasdaq-100 UCITS ETF', 'tech'],
    ['Xtrackers MSCI World Information Technology', 'tech'],
    ['Vanguard FTSE All-World UCITS ETF', 'world'],
    ['iShares Core MSCI Emerging Markets IMI', 'emerging'],
    ['iShares Core MSCI Europe UCITS ETF', 'europe'],
    ['iShares Core MSCI Japan IMI', 'japan'],
    ['L&G Cyber Security UCITS ETF', 'cyber security'],
  ])('%s → %s', (name, sector) => {
    expect(fromName(name)).toBe(sector)
  })

  test('nothing in the name → no badge', () => {
    expect(fromName('Vanguard LifeStrategy 80% Equity')).toBeUndefined()
  })

  test('USD is a currency, not the US', () => {
    expect(fromName('Some Fund USD Acc')).toBeUndefined()
  })
})

describe('fromYahoo', () => {
  test('Technology → tech, an unknown word → nothing', () => {
    expect(fromYahoo('Technology')).toBe('tech')
    expect(fromYahoo('Consumer Defensive')).toBe('consumer')
    expect(fromYahoo('Something New')).toBeUndefined()
    expect(fromYahoo(undefined)).toBeUndefined()
  })
})

describe('parseSector', () => {
  const json = {
    quotes: [
      { symbol: 'MSF.DE', quoteType: 'EQUITY' },
      { symbol: 'MSFT', quoteType: 'EQUITY', sector: 'Technology' },
    ],
  }
  test('the sector of the same symbol', () => {
    expect(parseSector(json, 'MSFT')).toBe('Technology')
  })
  test('another symbol or no quotes → nothing', () => {
    expect(parseSector(json, 'MSF.DE')).toBeUndefined()
    expect(parseSector(json, 'AAPL')).toBeUndefined()
    expect(parseSector(null, 'MSFT')).toBeUndefined()
  })
})
