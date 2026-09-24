import { describe, expect, test } from 'vitest'

import { wasEdited, whenLabel } from './note-meta'

const now = new Date(2026, 8, 24, 15, 0).getTime() // Thursday

describe('whenLabel', () => {
  test('near, today, yesterday, this week, older, another year', () => {
    expect(whenLabel(now - 20_000, now)).toBe('just now')
    expect(whenLabel(new Date(2026, 8, 24, 9, 5).getTime(), now)).toBe('09:05')
    expect(whenLabel(new Date(2026, 8, 23, 22, 0).getTime(), now)).toBe(
      'yesterday',
    )
    expect(whenLabel(new Date(2026, 8, 21, 10, 0).getTime(), now)).toBe('Mon')
    expect(whenLabel(new Date(2026, 8, 3, 10, 0).getTime(), now)).toBe('3 Sep')
    expect(whenLabel(new Date(2025, 8, 3, 10, 0).getTime(), now)).toBe(
      '3 Sep 2025',
    )
  })
})

describe('wasEdited', () => {
  test('not while it was being written, yes later, no when never', () => {
    expect(wasEdited(now, now + 60_000)).toBe(false)
    expect(wasEdited(now, now + 60 * 60_000)).toBe(true)
    expect(wasEdited(now, undefined)).toBe(false)
  })
})
