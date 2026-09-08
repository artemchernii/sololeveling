import { describe, expect, test } from 'vitest'

import { addWeeks, startOfWeek, weekKey, weekStartsEndingWith } from './weeks'

/* Europe/Lisbon, pinned in vitest.config.ts — which is what makes the
   clocks-change cases below mean anything. */

describe('a week starts on Monday', () => {
  test('a Wednesday belongs to the Monday before it', () => {
    expect(startOfWeek(new Date(2026, 8, 9, 15)).getDate()).toBe(7)
  })

  test('a Monday is its own week start, at midnight', () => {
    const start = startOfWeek(new Date(2026, 8, 7, 23, 59))
    expect(start.getDate()).toBe(7)
    expect(start.getHours()).toBe(0)
  })

  /* The off-by-one that a naive getDay() gives: Sunday is 0, so subtracting
     getDay() days would move it forward into the week that has not begun. */
  test('a Sunday belongs to the week that began six days earlier', () => {
    expect(startOfWeek(new Date(2026, 8, 13, 12)).getDate()).toBe(7)
  })
})

describe('week keys', () => {
  test('every day of a week has the same key', () => {
    const keys = [7, 8, 9, 10, 11, 12, 13].map((d) =>
      weekKey(new Date(2026, 8, d, 12)),
    )
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toBe('2026-09-07')
  })

  test('the next Monday is a new key', () => {
    expect(weekKey(new Date(2026, 8, 14, 12))).toBe('2026-09-14')
  })
})

describe('twelve week starts', () => {
  test('are twelve, oldest first, ending with this week', () => {
    const starts = weekStartsEndingWith(new Date(2026, 8, 9), 12)
    expect(starts).toHaveLength(12)
    expect(starts[11]).toBe(new Date(2026, 8, 7).getTime())
    expect(starts[0]).toBeLessThan(starts[11])
  })

  test('each is exactly one week after the last, in wall-clock terms', () => {
    for (const start of weekStartsEndingWith(new Date(2026, 8, 9), 12)) {
      const d = new Date(start)
      expect(d.getDay()).toBe(1)
      expect(d.getHours()).toBe(0)
    }
  })

  /* Twelve weeks back from September crosses no transition, but twelve back
     from November crosses the 25 October fall-back. Built out of milliseconds,
     the older weeks would land at 23:00 on Sunday. */
  test('still Mondays at midnight across the clocks changing', () => {
    for (const start of weekStartsEndingWith(new Date(2026, 10, 10), 12)) {
      const d = new Date(start)
      expect(d.getDay()).toBe(1)
      expect(d.getHours()).toBe(0)
    }
  })

  test('addWeeks moves whole weeks, not 168 hours', () => {
    const across = addWeeks(new Date(2026, 9, 19), 2)
    expect(across.getDay()).toBe(1)
    expect(across.getHours()).toBe(0)
  })
})
