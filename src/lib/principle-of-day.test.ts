import { describe, expect, test } from 'vitest'

import { principleIndex } from './principle-of-day'

describe('one principle a day', () => {
  test('the same one all day', () => {
    const morning = new Date(2026, 8, 15, 7, 0)
    const night = new Date(2026, 8, 15, 23, 59)
    expect(principleIndex(morning, 6)).toBe(principleIndex(night, 6))
  })

  test('a different one tomorrow', () => {
    const today = new Date(2026, 8, 15, 12, 0)
    const tomorrow = new Date(2026, 8, 16, 12, 0)
    expect(principleIndex(today, 6)).not.toBe(principleIndex(tomorrow, 6))
  })

  test('a clock change does not repeat a day', () => {
    /* Lisbon springs forward on 28 Mar 2027: local midnight moves an hour,
       which a milliseconds-per-day division turns into two days sharing one
       number. */
    const days = [27, 28, 29].map((d) =>
      principleIndex(new Date(2027, 2, d, 12, 0), 6),
    )
    expect(new Set(days).size).toBe(3)
  })

  test('always one of the six', () => {
    for (let d = 1; d <= 31; d++) {
      const i = principleIndex(new Date(2026, 9, d, 9, 0), 6)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(6)
    }
  })

  test('nothing seeded means no principle', () => {
    expect(principleIndex(new Date(), 0)).toBe(-1)
  })
})
