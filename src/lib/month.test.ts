import { describe, expect, test } from 'vitest'

import { daysLeftInMonth, targetLine } from './month'

describe('days left in the month, counting today', () => {
  test('15 Sep has 16 left, today among them', () => {
    expect(daysLeftInMonth(new Date(2026, 8, 15, 7))).toBe(16)
  })

  test('the last day has one', () => {
    expect(daysLeftInMonth(new Date(2026, 8, 30, 23, 59))).toBe(1)
  })

  test('February knows a leap year', () => {
    expect(daysLeftInMonth(new Date(2028, 1, 1))).toBe(29)
    expect(daysLeftInMonth(new Date(2027, 1, 1))).toBe(28)
  })

  test('a clock change inside the month changes nothing', () => {
    expect(daysLeftInMonth(new Date(2027, 2, 27, 12))).toBe(5)
  })
})

describe('the words under a tile with a target', () => {
  test('short of it: how many to go, and how long is left', () => {
    expect(targetLine(5, 9, 16)).toBe('4 to go · 16 days left')
  })

  test('met, and past it, say the same calm thing', () => {
    expect(targetLine(9, 9, 16)).toBe('target met · 16 days left')
    expect(targetLine(11, 9, 3)).toBe('target met · 3 days left')
  })

  test('the last day is named', () => {
    expect(targetLine(7, 9, 1)).toBe('2 to go · last day')
  })
})
