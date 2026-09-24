import { describe, expect, test } from 'vitest'

import { endFromTime, toTimeInput } from './eventTimes'

const eight = new Date(2026, 8, 24, 8, 0).getTime()

describe('start–end', () => {
  test('an end later the same day', () => {
    expect(endFromTime(eight, '09:15')).toBe(eight + 75 * 60_000)
  })

  test('an end earlier than the start is the next day', () => {
    const late = new Date(2026, 8, 24, 23, 0).getTime()
    expect(endFromTime(late, '01:00')).toBe(late + 2 * 60 * 60_000)
  })

  test('an end equal to the start is a marker', () => {
    expect(endFromTime(eight, '08:00')).toBe(eight)
  })

  test('refuses what is not a time', () => {
    expect(endFromTime(eight, '')).toBeNull()
    expect(endFromTime(eight, '25:00')).toBeNull()
    expect(endFromTime(eight, 'soon')).toBeNull()
  })

  test('reads back as the field shows it', () => {
    expect(toTimeInput(eight + 75 * 60_000)).toBe('09:15')
  })
})
