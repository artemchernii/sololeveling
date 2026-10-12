import { describe, expect, test } from 'vitest'

import { holdingsTotal, totalWhy } from './holdingsTotal'

describe('holdingsTotal', () => {
  test('the positions and the cash reach the total', () => {
    const c = holdingsTotal([400, 380], 120, 900)
    expect(c).toMatchObject({
      state: 'same',
      positions: 2,
      positionsEur: 780,
      bothEur: 900,
      withoutCash: false,
    })
  })

  test('a position under the edge of the screen: they do not', () => {
    const c = holdingsTotal([4812.4, 2461.92], 1205.66, 8878.5)
    expect(c).toMatchObject({ state: 'differs', bothEur: 8479.98 })
    expect(totalWhy(c)).toMatch(/^A position is missing/)
  })

  test('more in the positions than the total', () => {
    const c = holdingsTotal([400, 3800], 120, 900)
    expect(c.state).toBe('differs')
    expect(totalWhy(c)).toMatch(/^A number was read wrong/)
  })

  test('a total of the positions alone, the cash beside it', () => {
    expect(holdingsTotal([1000.5, 1013.5], 12994, 2014)).toMatchObject({
      state: 'same',
      withoutCash: true,
    })
  })

  test('each line is rounded to a cent: a cent a line is room enough', () => {
    const twenty = Array.from({ length: 20 }, () => 100.01)
    expect(holdingsTotal(twenty, 10, 2010.2 + 0.2).state).toBe('same')
    expect(holdingsTotal(twenty, 10, 2010.2 + 0.3).state).toBe('differs')
    expect(holdingsTotal([100.01], null, 100.06).state).toBe('same')
    expect(holdingsTotal([100.01], null, 100.08).state).toBe('differs')
  })

  test('a total printed in whole euros is compared in euros', () => {
    expect(holdingsTotal([1000.4, 1013.3], null, 2014).state).toBe('same')
    expect(holdingsTotal([1000.4, 1011.3], null, 2014).state).toBe('differs')
  })

  test('nothing to compare: no total, no position, a worth not printed', () => {
    expect(holdingsTotal([400, 380], 120, null).state).toBe('none')
    expect(holdingsTotal([], 120, 15008).state).toBe('none')
    expect(holdingsTotal([400, undefined], 120, 900).state).toBe('none')
  })
})
