import { describe, expect, test } from 'vitest'

import { billWhenRefusal, dayLabel, dueDay } from './bills'

describe('dueDay', () => {
  test('a monthly bill on its day', () => {
    expect(dueDay({ cadence: 'monthly', day: 5 }, 2026, 8)).toBe(5)
  })
  test('the 31st falls on the 30th in September, the 28th in February', () => {
    expect(dueDay({ cadence: 'monthly', day: 31 }, 2026, 8)).toBe(30)
    expect(dueDay({ cadence: 'monthly', day: 31 }, 2026, 1)).toBe(28)
  })
  test('0 is always the last day', () => {
    expect(dueDay({ cadence: 'monthly', day: 0 }, 2026, 8)).toBe(30)
    expect(dueDay({ cadence: 'monthly', day: 0 }, 2028, 1)).toBe(29)
  })
  test('a yearly bill only in its month', () => {
    const insurance = { cadence: 'yearly' as const, day: 12, month: 2 }
    expect(dueDay(insurance, 2026, 2)).toBe(12)
    expect(dueDay(insurance, 2026, 3)).toBeNull()
  })
})

describe('dayLabel', () => {
  test('ordinals, and the last day', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 30].map(dayLabel)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '30th',
    ])
    expect(dayLabel(0)).toBe('last day')
  })
})

describe('billWhenRefusal', () => {
  test('accepts the shapes a bill can have', () => {
    expect(billWhenRefusal({ cadence: 'monthly', day: 0 })).toBeNull()
    expect(billWhenRefusal({ cadence: 'monthly', day: 31 })).toBeNull()
    expect(billWhenRefusal({ cadence: 'yearly', day: 29, month: 1 })).toBeNull()
  })
  test('refuses what cannot be put on a day', () => {
    expect(billWhenRefusal({ cadence: 'monthly', day: 32 })).not.toBeNull()
    expect(billWhenRefusal({ cadence: 'monthly', day: 1.5 })).not.toBeNull()
    expect(billWhenRefusal({ cadence: 'yearly', day: 3 })).not.toBeNull()
    expect(
      billWhenRefusal({ cadence: 'yearly', day: 31, month: 3 }),
    ).not.toBeNull()
  })
})
