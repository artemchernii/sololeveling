import { describe, expect, test } from 'vitest'

import { bucketOf, markOf, nowBy, split, toPlace } from './targets'
import type { Target } from './targets'

const HIS: Array<Target> = [
  { bucket: 'gold', min: 3000, max: 5000 },
  { bucket: 'bonds', min: 5000, max: 5000 },
  { bucket: 'crypto', min: 0, max: 2000 },
]

describe('bucketOf', () => {
  test('coins, gold, bond funds; every other fund and share is stocks', () => {
    expect(
      bucketOf({
        symbol: 'BTC-EUR',
        type: 'CRYPTOCURRENCY',
        name: 'Bitcoin EUR',
      }),
    ).toBe('crypto')
    expect(
      bucketOf({
        symbol: 'IGLN.L',
        type: 'ETF',
        name: 'iShares Physical Gold ETC',
      }),
    ).toBe('gold')
    expect(
      bucketOf({
        symbol: 'IBTE.L',
        type: 'ETF',
        name: 'iShares $ Treasury Bond 1-3yr',
      }),
    ).toBe('bonds')
    expect(
      bucketOf({
        symbol: 'AGGH.L',
        type: 'ETF',
        name: 'iShares Core Global Aggregate',
      }),
    ).toBe('bonds')
    expect(
      bucketOf({
        symbol: 'VWCE.DE',
        type: 'ETF',
        name: 'Vanguard FTSE All-World',
      }),
    ).toBe('stocks')
    expect(
      bucketOf({ symbol: 'ASML', type: 'EQUITY', name: 'ASML Holding' }),
    ).toBe('stocks')
    /* A company with "bond" in its name is a share, not a bond fund. */
    expect(
      bucketOf({ symbol: 'BOND', type: 'EQUITY', name: 'Bond Corp' }),
    ).toBe('stocks')
  })
})

test('nowBy sums valued rows by bucket and skips rows with no price', () => {
  expect(
    nowBy([
      { symbol: 'ASML', type: 'EQUITY', name: 'ASML', valueEur: 1000 },
      { symbol: 'NVDA', type: 'EQUITY', name: 'NVIDIA', valueEur: null },
      { symbol: 'IGLN.L', type: 'ETF', name: 'Physical Gold', valueEur: 300 },
    ]),
  ).toEqual({ stocks: 1000, gold: 300, bonds: 0, crypto: 0 })
})

test('markOf: to add under the min, in the range, above the max', () => {
  expect(markOf(0, HIS[1])).toEqual({ kind: 'add', eur: 5000 })
  expect(markOf(3800, HIS[0])).toEqual({ kind: 'in' })
  expect(markOf(2350, HIS[2])).toEqual({ kind: 'above', max: 2000 })
})

test('toPlace is free cash and broker cash less what is kept, never below 0', () => {
  expect(toPlace(2000, 400, 1000)).toBe(1400)
  expect(toPlace(500, 0, 1000)).toBe(0)
})

describe('split', () => {
  const now = { stocks: 27940, gold: 3800, bonds: 0, crypto: 460 }

  test('one bucket under its min takes all the cash', () => {
    expect(split(2400, now, HIS)).toEqual([
      { bucket: 'bonds', eur: 2400, misses: 5000 },
    ])
  })

  test('two under their min share it by what each misses, in whole euros', () => {
    const puts = split(2400, { ...now, gold: 2200 }, HIS)
    expect(puts).toEqual([
      { bucket: 'gold', eur: 331, misses: 800 },
      { bucket: 'bonds', eur: 2069, misses: 5000 },
    ])
    expect(puts.reduce((s, p) => s + p.eur, 0)).toBe(2400)
  })

  test('more cash than is missing: targets filled, the rest to stocks', () => {
    expect(split(6000, now, HIS)).toEqual([
      { bucket: 'bonds', eur: 5000, misses: 5000 },
      { bucket: 'stocks', eur: 1000, misses: 0 },
    ])
  })

  test('every target met, or no targets: all to stocks; no cash: nothing', () => {
    const met = { stocks: 1, gold: 3800, bonds: 5100, crypto: 2350 }
    expect(split(2400, met, HIS)).toEqual([
      { bucket: 'stocks', eur: 2400, misses: 0 },
    ])
    expect(split(2400, now, [])).toEqual([
      { bucket: 'stocks', eur: 2400, misses: 0 },
    ])
    expect(split(0, now, HIS)).toEqual([])
  })
})
