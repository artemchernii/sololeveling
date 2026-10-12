import { describe, expect, it } from 'vitest'

import {
  cashOf,
  heldAs,
  mergeChanged,
  readPositions,
  readSummary,
  tickerOf,
  whatChanged,
} from './t212'

describe('what Trading 212 answers', () => {
  it('free cash is what can be traded, what is in pies and what is held for orders', () => {
    const cash = readSummary({
      currency: 'EUR',
      cash: { availableToTrade: 1200.3, inPies: 50, reservedForOrders: 30 },
      totalValue: 5380.3,
    })
    expect(cash && cashOf(cash)).toBe(1280.3)
    expect(readSummary({ currency: 'EUR', cash: {} })).toBeNull()
    expect(readSummary('<html>')).toBeNull()
  })

  it('a position is its shares, and its euros only when the account is in euros', () => {
    const position = (walletImpact: object) => ({
      instrument: {
        ticker: 'NVDA_US_EQ',
        name: 'Nvidia',
        isin: 'US67066G1040',
      },
      quantity: 8,
      currentPrice: 176.4,
      walletImpact,
    })
    expect(
      readPositions([
        position({ currency: 'EUR', currentValue: 1200, totalCost: 900 }),
      ]),
    ).toEqual([
      {
        ticker: 'NVDA_US_EQ',
        name: 'Nvidia',
        isin: 'US67066G1040',
        shares: 8,
        valueEur: 1200,
        paidEur: 900,
      },
    ])
    expect(
      readPositions([position({ currency: 'GBP', currentValue: 1000 })]),
    ).toEqual([
      { ticker: 'NVDA_US_EQ', name: 'Nvidia', isin: 'US67066G1040', shares: 8 },
    ])
  })

  it('half a list is no list', () => {
    expect(readPositions({ items: [] })).toBeNull()
    expect(
      readPositions([{ instrument: { ticker: 'A_US_EQ' }, quantity: 1 }, {}]),
    ).toBeNull()
    expect(readPositions([])).toEqual([])
  })
})

describe('which holding a position is', () => {
  const held = [
    {
      symbol: 'VUAA.L',
      name: 'Vanguard S&P 500 UCITS ETF',
      isin: 'IE00BFMXXD54',
    },
    { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  ]
  it('the same ISIN, whatever the ticker', () => {
    expect(
      heldAs(
        { ticker: 'VUAAm_EQ', name: 'Vanguard', isin: 'IE00BFMXXD54' },
        held,
      ),
    ).toBe(0)
  })
  it('else the same ticker before its exchange', () => {
    expect(tickerOf('NVDA_US_EQ')).toBe('NVDA')
    expect(heldAs({ ticker: 'NVDA_US_EQ', name: 'Nvidia' }, held)).toBe(1)
  })
  it('none: a company the account never held', () => {
    expect(heldAs({ ticker: 'ASML_NA_EQ', name: 'ASML' }, held)).toBe(-1)
  })
})

describe('what changed', () => {
  it('more, fewer, new and sold — never one that is the same', () => {
    const was = new Map([
      ['nvda', 8],
      ['asml', 1],
      ['aapl', 4],
    ])
    const now = new Map([
      ['nvda', 10],
      ['aapl', 4],
      ['msft', 2],
    ])
    expect(whatChanged(was, now)).toEqual([
      { id: 'nvda', was: 8, now: 10 },
      { id: 'asml', was: 1, now: 0 },
      { id: 'msft', was: 0, now: 2 },
    ])
  })

  it('a block left open keeps the first look; a line back where it began leaves', () => {
    const open = [
      { id: 'nvda', was: 8, now: 10 },
      { id: 'asml', was: 1, now: 0 },
    ]
    expect(
      mergeChanged(open, [
        { id: 'nvda', was: 10, now: 12 },
        { id: 'asml', was: 0, now: 1 },
        { id: 'msft', was: 0, now: 2 },
      ]),
    ).toEqual([
      { id: 'nvda', was: 8, now: 12 },
      { id: 'msft', was: 0, now: 2 },
    ])
  })
})
