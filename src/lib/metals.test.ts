import { describe, expect, test } from 'vitest'

import { metalHoldings, metalTicker, metalsTitle } from './metals'

const tx = (currency: string, amount: number) => ({
  occurredAt: 1,
  merchant: `Exchanged to ${currency}`,
  raw: `Exchanged to ${currency}`,
  amount,
  currency,
  pending: false,
  self: true,
})

describe('metalHoldings', () => {
  test("Revolut's commodity account: one position a metal, from its last balance", () => {
    const got = metalHoldings({
      transactions: [tx('XAU', 0.14), tx('XAG', 12.9), tx('XAG', -12.9)],
      closings: {
        XAU: { value: 0.408365, asOf: 20 },
        XAG: { value: 0, asOf: 10 },
      },
    })
    expect(got).toEqual([
      {
        name: 'Gold',
        shares: 0.408365,
        asOf: 20,
        candidate: {
          symbol: 'GC=F',
          name: 'Gold',
          exchange: 'CMX',
          type: 'FUTURE',
        },
      },
    ])
  })

  test('a statement with any row in money is not metal', () => {
    expect(
      metalHoldings({
        transactions: [tx('XAU', 0.1), tx('EUR', -20)],
        closings: { XAU: { value: 0.1, asOf: 1 } },
      }),
    ).toBeNull()
    expect(metalHoldings({ transactions: [], closings: {} })).toBeNull()
  })
})

test('metalsTitle names what the file holds', () => {
  expect(metalsTitle(['Gold', 'Silver'])).toBe('gold and silver')
  expect(metalsTitle(['Gold'])).toBe('gold')
})

describe('metalTicker', () => {
  test('knows a metal by its code or its name, without a search', () => {
    expect(metalTicker('XAU')?.candidates[0].symbol).toBe('GC=F')
    expect(metalTicker(' gold ')?.candidates[0].symbol).toBe('GC=F')
    expect(metalTicker('XAG')?.candidates[0].symbol).toBe('SI=F')
  })
  test('leaves a share alone, even one with gold in its name', () => {
    expect(metalTicker('Barrick Gold')).toBeNull()
    expect(metalTicker('iShares Physical Gold ETC')).toBeNull()
    expect(metalTicker('')).toBeNull()
  })
})
