import { describe, expect, it } from 'vitest'

import { kindOf, logoSrc } from './logo'

describe('logoSrc', () => {
  it('a coin is its own icon', () => {
    expect(logoSrc({ symbol: 'ADA-EUR', type: 'CRYPTOCURRENCY' })).toBe(
      'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/ada.svg',
    )
  })

  it('a fund is its issuer, never the US share with its letters', () => {
    expect(
      logoSrc({
        symbol: 'VUAA.L',
        type: 'ETF',
        name: 'Vanguard S&P 500 UCITS ETF',
      }),
    ).toContain('domain=vanguard.com')
    expect(
      logoSrc({
        symbol: 'SHLD.L',
        type: 'ETF',
        name: 'iShares Digital Security UCITS ETF',
      }),
    ).toContain('domain=ishares.com')
    expect(logoSrc({ symbol: 'XYZ.DE', type: 'ETF', name: 'Some Fund' })).toBe(
      null,
    )
  })

  it('a share is the company by ticker', () => {
    expect(logoSrc({ symbol: 'NVDA', type: 'EQUITY' })).toBe(
      'https://financialmodelingprep.com/image-stock/NVDA.png',
    )
  })
})

describe('kindOf', () => {
  it('stocks, ETFs, gold and crypto', () => {
    expect(kindOf({ symbol: 'NVDA', type: 'EQUITY' })).toBe('stock')
    expect(kindOf({ symbol: 'VUAA.L', type: 'ETF', name: 'Vanguard' })).toBe(
      'etf',
    )
    expect(
      kindOf({
        symbol: 'IGLN.L',
        type: 'ETF',
        name: 'iShares Physical Gold ETC',
      }),
    ).toBe('gold')
    expect(kindOf({ symbol: 'BTC-EUR', type: 'CRYPTOCURRENCY' })).toBe('crypto')
  })
})
