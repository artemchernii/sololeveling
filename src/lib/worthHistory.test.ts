import { describe, expect, test } from 'vitest'

import { addSeries, closeLooks, heldDays, investedSeries } from './worthHistory'

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

describe('heldDays', () => {
  test('from the buy to the sale, across every position given', () => {
    const buy = (d: number) =>
      ({ side: 'buy', shares: 1, priceEur: 1, occurredAt: at(d, 10) }) as const
    const sell = (d: number) =>
      ({ side: 'sell', shares: 1, priceEur: 1, occurredAt: at(d, 10) }) as const
    expect(heldDays(ends, [{ trades: [buy(2), sell(3)], looks: [] }])).toEqual([
      false,
      true,
      false,
      false,
    ])
    expect(
      heldDays(ends, [
        { trades: [buy(2), sell(3)], looks: [] },
        { trades: [buy(4)], looks: [] },
      ]),
    ).toEqual([false, true, false, true])
  })
})

describe('closeLooks', () => {
  const DAY = 86_400_000
  const year = Array.from({ length: 365 }, (_, i) => i * DAY)
  const all = year.map(() => true)

  test('held all year: every day of the last month, a week apart before', () => {
    const [looks] = closeLooks(year, [all], 3200)
    expect(looks.slice(-31)).toEqual(year.slice(-31))
    expect(looks[0]).toBe(0)
    expect(looks.length).toBeLessThanOrEqual(80)
  })

  test('never held: no looks; sold long ago: none after the sale', () => {
    const sold = year.map((_, i) => i >= 10 && i < 40)
    const [never, once] = closeLooks(year, [year.map(() => false), sold], 3200)
    expect(never).toEqual([])
    /* Its first day, though no weekly look falls on it. */
    expect(once[0]).toBe(10 * DAY)
    expect(once.every((end) => end >= 10 * DAY && end < 40 * DAY)).toBe(true)
    expect(once.length).toBeLessThanOrEqual(6)
  })

  test('more positions than the budget: coarser, never over, first day kept (10 Oct, 57 instruments)', () => {
    const held = Array.from({ length: 80 }, () => all)
    const looks = closeLooks(year, held, 3200)
    expect(looks.reduce((n, l) => n + l.length, 0)).toBeLessThanOrEqual(3200)
    for (const l of looks) {
      expect(l[0]).toBe(0)
      expect(l.at(-1)).toBe(364 * DAY)
    }
  })
})
