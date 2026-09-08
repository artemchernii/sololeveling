import { describe, expect, test } from 'vitest'

import { deadlineLabel } from './format'

const SEPT_8 = new Date(2026, 8, 8, 14, 30)

describe('a deadline says how far off it is', () => {
  test('counts whole days ahead', () => {
    expect(deadlineLabel('2026-10-01', SEPT_8)).toContain('23 days')
  })

  test('singular for one', () => {
    expect(deadlineLabel('2026-09-09', SEPT_8)).toContain('1 day')
    expect(deadlineLabel('2026-09-09', SEPT_8)).not.toContain('1 days')
  })

  test('today is today, not "0 days"', () => {
    expect(deadlineLabel('2026-09-08', SEPT_8)).toContain('today')
  })

  test('a passed deadline says so rather than counting backwards', () => {
    const label = deadlineLabel('2026-09-05', SEPT_8)
    expect(label).toContain('ended')
    expect(label).toContain('3 days ago')
  })

  test('an afternoon now does not push tomorrow into today', () => {
    /* The bug this guards: comparing raw timestamps rather than local
       midnights makes a deadline 20 hours away round to "today". */
    expect(deadlineLabel('2026-09-09', new Date(2026, 8, 8, 23, 59))).toContain(
      '1 day',
    )
  })
})
