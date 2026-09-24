import { describe, expect, test } from 'vitest'

import { quickDeadline } from './goal-deadline'

describe('quickDeadline', () => {
  test('a month from today, same day', () => {
    expect(quickDeadline('month', '2026-09-24')).toBe('2026-10-24')
  })

  test('three months, across the year', () => {
    expect(quickDeadline('quarter', '2026-11-15')).toBe('2027-02-15')
  })

  test('a day the next month lacks is clamped to its end', () => {
    expect(quickDeadline('month', '2026-01-31')).toBe('2026-02-28')
    expect(quickDeadline('month', '2028-01-31')).toBe('2028-02-29')
    expect(quickDeadline('quarter', '2026-11-30')).toBe('2027-02-28')
  })

  test('year end', () => {
    expect(quickDeadline('year', '2026-09-24')).toBe('2026-12-31')
  })
})
