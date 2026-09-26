import { describe, expect, test } from 'vitest'

import { atTime } from './past-day'

describe('atTime — a time on a past day', () => {
  const thursday = new Date(2026, 8, 24).getTime()

  test('lands on that day at that time', () => {
    const at = new Date(atTime(thursday, '18:30') as number)
    expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([24, 18, 30])
    expect(new Date(atTime(thursday, '0:05') as number).getHours()).toBe(0)
  })

  test('a time that does not parse is null, not a guess', () => {
    expect(atTime(thursday, '25:00')).toBeNull()
    expect(atTime(thursday, '12:60')).toBeNull()
    expect(atTime(thursday, 'noon')).toBeNull()
    expect(atTime(thursday, '')).toBeNull()
  })

  test('a day with a clock change still gets the time written', () => {
    /* 25 Oct 2026 is when Europe's clocks go back. */
    const change = new Date(2026, 9, 25).getTime()
    expect(new Date(atTime(change, '12:00') as number).getHours()).toBe(12)
  })
})
