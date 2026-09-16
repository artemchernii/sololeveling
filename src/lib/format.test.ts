import { describe, expect, test } from 'vitest'

import { deadlineLabel, durationLabel, whenLabel } from './format'

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

describe('whenLabel says when a log happened', () => {
  const now = new Date(2026, 8, 13, 22, 0)

  test('within a minute and a half is now', () => {
    expect(whenLabel(now.getTime() - 60_000, now)).toBe('now')
  })

  test('earlier today shows the hour', () => {
    expect(whenLabel(new Date(2026, 8, 13, 9, 5).getTime(), now)).toBe(
      'today 09:05',
    )
  })

  test('yesterday is by calendar day, not by 24 hours', () => {
    expect(whenLabel(new Date(2026, 8, 12, 23, 30).getTime(), now)).toBe(
      'yesterday 23:30',
    )
  })

  test('this week is a weekday, older is a date — always with the hour', () => {
    expect(whenLabel(new Date(2026, 8, 10, 19, 10).getTime(), now)).toMatch(
      / 19:10$/,
    )
    expect(whenLabel(new Date(2026, 7, 1, 8, 0).getTime(), now)).toMatch(
      / 08:00$/,
    )
  })
})

describe('durationLabel', () => {
  test('under an hour is minutes', () => {
    expect(durationLabel(45)).toBe('45m')
  })
  test('whole hours drop the minutes', () => {
    expect(durationLabel(120)).toBe('2h')
  })
  test('hours and minutes', () => {
    expect(durationLabel(450)).toBe('7h 30m')
  })
  test('a fraction of a minute is rounded, not shown', () => {
    expect(durationLabel(59.6)).toBe('1h')
  })
})
