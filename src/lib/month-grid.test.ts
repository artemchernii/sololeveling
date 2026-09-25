import { describe, expect, test } from 'vitest'

import {
  compareMonths,
  monthDays,
  monthOf,
  monthWeeks,
  shiftMonth,
} from './month-grid'

const SEP = { year: 2026, month: 8 }

describe('month grid', () => {
  test('every day of the month, local midnights', () => {
    const days = monthDays(SEP)
    expect(days).toHaveLength(30)
    expect(new Date(days[0]).getDate()).toBe(1)
    expect(new Date(days[29]).getDate()).toBe(30)
    for (const d of days) expect(new Date(d).getHours()).toBe(0)
  })

  test('weeks run Monday to Sunday, padded with the months around it', () => {
    /* 1 Sep 2026 is a Tuesday; 30 Sep a Wednesday. */
    const weeks = monthWeeks(SEP)
    expect(weeks).toHaveLength(5)
    expect(weeks[0][0]).toBeNull()
    expect(new Date(weeks[0][1] as number).getDate()).toBe(1)
    expect(new Date(weeks[4][2] as number).getDate()).toBe(30)
    expect(weeks[4].slice(3)).toEqual([null, null, null, null])
    for (const week of weeks) expect(week).toHaveLength(7)
    expect(weeks.flat().filter((d) => d !== null)).toEqual(monthDays(SEP))
  })

  test('a month starting on a Monday has no padding before it', () => {
    /* 1 Jun 2026 is a Monday. */
    const weeks = monthWeeks({ year: 2026, month: 5 })
    expect(new Date(weeks[0][0] as number).getDate()).toBe(1)
  })

  test('stepping across a year, and comparing', () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({
      year: 2025,
      month: 11,
    })
    expect(shiftMonth(SEP, 4)).toEqual({ year: 2027, month: 0 })
    expect(compareMonths(SEP, shiftMonth(SEP, 1))).toBeLessThan(0)
    expect(compareMonths(SEP, monthOf(new Date(2026, 8, 26)))).toBe(0)
  })
})
