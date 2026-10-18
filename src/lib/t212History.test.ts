import { describe, expect, it } from 'vitest'

import {
  historyFrom,
  readCashflow,
  readDividend,
  readOrder,
  readPage,
} from './t212History'

const NVDA = { ticker: 'NVDA_US_EQ', name: 'Nvidia', isin: 'US67066G1040' }
const order = (side: string, fill: object) => ({
  order: { id: 7, side, status: 'FILLED', instrument: NVDA },
  fill: {
    id: 99,
    filledAt: '2026-10-18T10:00:00Z',
    quantity: 2,
    type: 'TRADE',
    walletImpact: { currency: 'EUR', netValue: -300 },
    ...fill,
  },
})

describe("Trading 212's history", () => {
  it('a page is its items and the next path; anything else is no page', () => {
    expect(readPage({ items: [1], nextPagePath: '/x?cursor=2' })).toEqual({
      items: [1],
      next: '/x?cursor=2',
    })
    expect(readPage({ items: [], nextPagePath: null })?.next).toBeNull()
    expect(readPage('<html>')).toBeNull()
  })

  it('a filled buy is its shares at what each cost in euros, kept by its fill id', () => {
    expect(readOrder(order('BUY', {}))).toEqual({
      ref: 't212:fill:99',
      at: Date.parse('2026-10-18T10:00:00Z'),
      kind: 'buy',
      ticker: 'NVDA_US_EQ',
      name: 'Nvidia',
      isin: 'US67066G1040',
      shares: 2,
      priceEur: 150,
    })
    expect(
      readOrder(
        order('SELL', {
          walletImpact: { currency: 'EUR', netValue: 640 },
          quantity: 1,
        }),
      ),
    ).toMatchObject({ kind: 'sell', shares: 1, priceEur: 640 })
  })

  it('an order with no fill, a split or a fill in dollars is left out', () => {
    expect(readOrder({ order: { side: 'BUY', instrument: NVDA } })).toBeNull()
    expect(readOrder(order('BUY', { type: 'STOCK_SPLIT' }))).toBeNull()
    expect(
      readOrder(
        order('BUY', { walletImpact: { currency: 'USD', netValue: -300 } }),
      ),
    ).toBeNull()
  })

  it('a dividend is its euros and the shares it was paid on', () => {
    expect(
      readDividend({
        amount: 1.38,
        amountInEuro: 1.38,
        currency: 'EUR',
        instrument: {
          ticker: 'ASML_NA_EQ',
          name: 'ASML',
          isin: 'NL0010273215',
        },
        paidOn: '2026-10-18T08:00:00Z',
        quantity: 1,
        reference: 'D1',
      }),
    ).toMatchObject({
      ref: 't212:div:D1',
      kind: 'dividend',
      name: 'ASML',
      shares: 1,
      amount: 1.38,
      currency: 'EUR',
    })
    expect(readDividend({ amount: 0, paidOn: 'x', reference: 'D2' })).toBeNull()
  })

  it('money in is plus, a fee and money out are minus, a transfer between 212 accounts is left out', () => {
    const tx = (type: string, amount: number) =>
      readCashflow({
        type,
        amount,
        currency: 'EUR',
        dateTime: '2026-10-16T12:00:00Z',
        reference: `T-${type}`,
      })
    expect(tx('DEPOSIT', 500)).toMatchObject({ kind: 'deposit', amount: 500 })
    expect(tx('WITHDRAW', 200)).toMatchObject({
      kind: 'withdraw',
      amount: -200,
    })
    expect(tx('FEE', 0.45)).toMatchObject({ kind: 'fee', amount: -0.45 })
    expect(tx('INTEREST_ON_FREE_CASH', 2.04)).toMatchObject({
      kind: 'interest',
      amount: 2.04,
      ref: 't212:cash:T-INTEREST_ON_FREE_CASH',
    })
    expect(tx('TRANSFER', 100)).toBeNull()
  })

  it('reads back a day before the newest file row, then a week before the newest event', () => {
    const day = 86_400_000
    expect(historyFrom(null, null)).toBe(0)
    expect(historyFrom(10 * day, null)).toBe(9 * day)
    expect(historyFrom(10 * day, 20 * day)).toBe(13 * day)
  })
})
