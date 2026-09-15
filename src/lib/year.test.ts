import { describe, expect, test } from 'vitest'

import { yearOfLevel } from './year'

/* Born 14 Dec 1993. Dates are local; vitest pins TZ to Europe/Lisbon. */
describe('the year of LEVEL', () => {
  test('15 Sep 2026: level 32, 275 days in, 90 to go', () => {
    expect(yearOfLevel(new Date(2026, 8, 15, 9, 0))).toEqual({
      level: 32,
      daysIn: 275,
      daysInYear: 365,
      daysToNext: 90,
    })
  })

  test('the day before the birthday is the last day of the level', () => {
    const y = yearOfLevel(new Date(2026, 11, 13, 23, 59))
    expect(y.level).toBe(32)
    expect(y.daysToNext).toBe(1)
  })

  test('the birthday itself starts the next level, from zero', () => {
    const y = yearOfLevel(new Date(2026, 11, 14, 0, 1))
    expect(y).toEqual({
      level: 33,
      daysIn: 0,
      daysInYear: 365,
      daysToNext: 365,
    })
  })

  test('New Year does not reset it', () => {
    const y = yearOfLevel(new Date(2027, 0, 1, 12, 0))
    expect(y.level).toBe(33)
    expect(y.daysIn).toBe(18)
  })

  test('a year with 29 February in it is 366 days long', () => {
    expect(yearOfLevel(new Date(2028, 5, 1)).daysInYear).toBe(366)
  })

  test('a clock change is still one day', () => {
    /* Lisbon springs forward on 28 Mar 2027. */
    const sat = yearOfLevel(new Date(2027, 2, 27, 12))
    const sun = yearOfLevel(new Date(2027, 2, 28, 12))
    const mon = yearOfLevel(new Date(2027, 2, 29, 12))
    expect([sun.daysIn - sat.daysIn, mon.daysIn - sun.daysIn]).toEqual([1, 1])
  })

  test('the two halves always make the whole year', () => {
    for (let m = 0; m < 12; m++) {
      const y = yearOfLevel(new Date(2027, m, 10))
      expect(y.daysIn + y.daysToNext).toBe(y.daysInYear)
    }
  })
})
