import { describe, expect, test } from 'vitest'

import { factsOf, hitOf, sideOf } from './watch'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 1)

/* A year of closes rising from 100 to 200, then back to 150. */
const year = Array.from({ length: 300 }, (_, i) => ({
  asOf: T0 + i * DAY,
  price: i < 250 ? 100 + (i * 100) / 249 : 200 - ((i - 249) * 50) / 50,
}))

describe('factsOf', () => {
  test('the 52W low and high, the latest against the high, the signals', () => {
    const f = factsOf(year, null, T0 + 300 * DAY)
    expect(f).not.toBeNull()
    expect(f?.high).toBeCloseTo(200)
    expect(f?.low).toBeGreaterThanOrEqual(100)
    expect(f?.vsHigh).toBeCloseTo(-25, 0)
    expect((f?.bull ?? 0) + (f?.bear ?? 0)).toBeGreaterThan(0)
    expect(['add', 'hold', 'wait', null]).toContain(f?.call)
  })

  test('no closes, no facts', () => {
    expect(factsOf([], null, T0)).toBeNull()
  })

  test('closes out of order read the same', () => {
    const a = factsOf(year, null, T0 + 300 * DAY)
    const b = factsOf([...year].reverse(), null, T0 + 300 * DAY)
    expect(b).toEqual(a)
  })
})

describe('the alert', () => {
  test('above the price waits for a rise, below for a fall', () => {
    expect(sideOf(141.2, 150)).toBe('up')
    expect(sideOf(58.4, 55)).toBe('down')
  })

  test('rings only once the close reaches it', () => {
    expect(hitOf({ at: 150, side: 'up' }, 149.99)).toBe(false)
    expect(hitOf({ at: 150, side: 'up' }, 150)).toBe(true)
    expect(hitOf({ at: 55, side: 'down' }, 55.1)).toBe(false)
    expect(hitOf({ at: 55, side: 'down' }, 54.7)).toBe(true)
  })
})
