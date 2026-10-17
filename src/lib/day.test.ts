import { describe, expect, it } from 'vitest'

import { dayX, inLabel, nextItem } from './day'

describe('day', () => {
  it('names the next item that has not started', () => {
    const items = [
      { id: 'a', source: 'event' as const, title: 'A', startsAt: 10 },
      { id: 'b', source: 'event' as const, title: 'B', startsAt: 30 },
    ]
    expect(nextItem(items, 20)?.title).toBe('B')
    expect(nextItem(items, 40)).toBeNull()
  })
  it('says how long until it', () => {
    expect(inLabel(130 * 60_000)).toBe('IN 2H 10M')
    expect(inLabel(4.2 * 60_000)).toBe('IN 5M')
  })
  it('places an hour on the 08 → 24 line', () => {
    expect(dayX(8)).toBe(0)
    expect(dayX(16)).toBe(50)
    expect(dayX(3)).toBe(0)
  })
})
