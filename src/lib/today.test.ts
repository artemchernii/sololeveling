import { describe, expect, it } from 'vitest'

import { localDateIn, localToday, nextLocalMidnight } from './today'

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

/* 25 Oct 2026: the clocks went back, the day was 25 hours long, and a
   +24h end left its last hour out of every count. Lisbon is pinned in
   vitest.config.ts. */
describe('nextLocalMidnight', () => {
  it('the 25-hour day ends at the next midnight', () => {
    const start = new Date(2026, 9, 25).getTime()
    expect(nextLocalMidnight(start)).toBe(new Date(2026, 9, 26).getTime())
    expect(nextLocalMidnight(start) - start).toBe(25 * 3_600_000)
  })

  it('the 23-hour day too', () => {
    const start = new Date(2026, 2, 29).getTime()
    expect(nextLocalMidnight(start) - start).toBe(23 * 3_600_000)
  })

  it('an ordinary day is 24 hours', () => {
    const start = new Date(2026, 9, 20).getTime()
    expect(nextLocalMidnight(start) - start).toBe(86_400_000)
  })
})
