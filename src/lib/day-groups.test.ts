import { describe, expect, test } from 'vitest'

import { groupByDay } from './day-groups'

describe('groupByDay', () => {
  const now = new Date(2026, 8, 25, 21, 0)
  const at = (d: number, h: number) => new Date(2026, 8, d, h).getTime()

  test('today, yesterday, then dated days, newest first', () => {
    const groups = groupByDay(
      [
        { occurredAt: at(25, 20) },
        { occurredAt: at(25, 9) },
        { occurredAt: at(24, 18) },
        { occurredAt: at(13, 23) },
      ],
      now,
    )
    expect(groups.map((g) => g.label.slice(0, 5))).toEqual([
      'Today',
      'Yeste',
      groups[2].label.slice(0, 5),
    ])
    expect(groups[0].rows).toHaveLength(2)
    expect(groups[2].label).toMatch(/13/)
  })

  test('nothing in, nothing out', () => {
    expect(groupByDay([], now)).toEqual([])
  })
})
