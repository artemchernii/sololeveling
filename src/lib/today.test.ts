import { describe, expect, it } from 'vitest'

import { localDateIn, localToday } from './today'

describe('localDateIn', () => {
  it('0 days is today', () => {
    const now = new Date(2026, 8, 20, 14, 30)
    expect(localDateIn(0, now)).toBe(localToday(now))
    expect(localDateIn(0, now)).toBe('2026-09-20')
  })

  it('1 day is tomorrow', () => {
    expect(localDateIn(1, new Date(2026, 8, 20, 14, 30))).toBe('2026-09-21')
  })

  it('rolls over the end of a month', () => {
    expect(localDateIn(1, new Date(2026, 8, 30, 23, 59))).toBe('2026-10-01')
  })

  it('rolls over the end of a year', () => {
    expect(localDateIn(1, new Date(2026, 11, 31, 9, 0))).toBe('2027-01-01')
  })

  it('handles a leap day', () => {
    expect(localDateIn(1, new Date(2028, 1, 28, 12, 0))).toBe('2028-02-29')
  })

  /* Late evening is where a UTC-based answer goes wrong: 23:30 in Lisbon on
     20 Sep is already the 20th in UTC only by an hour, and east of Greenwich
     it is the 21st. The date must be the one on the wall. */
  it('reads the local clock, not UTC', () => {
    const lateEvening = new Date(2026, 8, 20, 23, 30)
    expect(localDateIn(0, lateEvening)).toBe('2026-09-20')
    expect(localDateIn(1, lateEvening)).toBe('2026-09-21')
  })
})
