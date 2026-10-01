import { describe, expect, test } from 'vitest'

import { addSeries, investedSeries } from './worthHistory'

const at = (d: number, h = 23) => new Date(2026, 8, d, h, 59).getTime()
const ends = [1, 2, 3, 4].map((d) => at(d))

describe('investedSeries', () => {
  test('shares held × that day’s close × that day’s rate', () => {
    const r = investedSeries(ends, [
      {
        accountId: 'tr',
        trades: [
          { side: 'buy', shares: 2, priceEur: 90, occurredAt: at(2, 10) },
          { side: 'sell', shares: 1, priceEur: 99, occurredAt: at(4, 10) },
        ],
        looks: [],
        closes: [
          { asOf: at(1, 20), price: 100 },
          { asOf: at(2, 20), price: 110 },
          /* No close on the 3rd: the 2nd's carries. */
          { asOf: at(4, 20), price: 120 },
        ],
        divide: 1,
        rates: [
          { asOf: at(1, 16), rate: 0.9 },
          { asOf: at(3, 16), rate: 0.8 },
        ],
      },
    ])
    expect(r.total).toEqual([null, 198, 176, 96])
    expect(r.accounts).toEqual([{ accountId: 'tr', values: r.total }])
    expect(r.unpriced).toEqual([0, 0, 0, 0])
  })

  test('a euro quote needs no rate; pence are a hundredth', () => {
    const buy = [
      { side: 'buy' as const, shares: 10, priceEur: 1, occurredAt: at(1, 9) },
    ]
    const r = investedSeries(ends.slice(0, 1), [
      {
        accountId: 'a',
        trades: buy,
        looks: [],
        closes: [{ asOf: at(1, 17), price: 5 }],
        divide: 1,
        rates: null,
      },
      {
        accountId: 'a',
        trades: buy,
        looks: [],
        closes: [{ asOf: at(1, 17), price: 250 }],
        divide: 100,
        rates: [{ asOf: at(1, 16), rate: 1.2 }],
      },
    ])
    expect(r.total).toEqual([80])
  })

  test('held but no close yet: left out and counted, never guessed', () => {
    const r = investedSeries(ends.slice(0, 2), [
      {
        accountId: 'a',
        trades: [
          { side: 'buy', shares: 1, priceEur: 50, occurredAt: at(1, 9) },
        ],
        looks: [],
        closes: [{ asOf: at(2, 17), price: 60 }],
        divide: 1,
        rates: null,
      },
    ])
    expect(r.total).toEqual([0, 60])
    expect(r.unpriced).toEqual([1, 0])
  })

  test('a holdings screen with no buys starts on its day', () => {
    const r = investedSeries(ends, [
      {
        accountId: 'rev',
        trades: [],
        looks: [{ shares: 3, asOf: at(3, 12) }],
        closes: [1, 2, 3, 4].map((d) => ({ asOf: at(d, 17), price: 10 })),
        divide: 1,
        rates: null,
      },
    ])
    expect(r.total).toEqual([null, null, 30, 30])
  })
})

describe('addSeries', () => {
  test('added where either is known', () => {
    expect(addSeries([null, 1, null, 2.5], [null, null, 3, 0.25])).toEqual([
      null,
      1,
      3,
      2.75,
    ])
  })
})

describe('sold out and bought again', () => {
  test('the days holding nothing are €0, not a gap', () => {
    const r = investedSeries(ends, [
      {
        accountId: 'tr',
        trades: [
          { side: 'buy', shares: 1, priceEur: 10, occurredAt: at(1, 9) },
          { side: 'sell', shares: 1, priceEur: 10, occurredAt: at(2, 9) },
          { side: 'buy', shares: 1, priceEur: 10, occurredAt: at(4, 9) },
        ],
        looks: [],
        closes: [{ asOf: at(1, 17), price: 10 }],
        divide: 1,
        rates: null,
      },
    ])
    expect(r.total).toEqual([10, 0, 0, 10])
  })
})
