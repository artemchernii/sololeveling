import { describe, expect, test } from 'vitest'

import type { TimelineItem } from './timeline'
import { itemsByDay, weekDays } from './week-glance'

const item = (id: string, at: Date): TimelineItem => ({
  id,
  source: 'event',
  title: id,
  startsAt: at.getTime(),
})

describe('the seven days of THIS WEEK', () => {
  test('Monday to Sunday of the week the day is in', () => {
    const days = weekDays(new Date(2026, 8, 16, 15)) // a Wednesday
    expect(days).toHaveLength(7)
    expect(days[0].start).toBe(new Date(2026, 8, 14).getTime())
    expect(days[6].start).toBe(new Date(2026, 8, 20).getTime())
    expect(days[6].end).toBe(new Date(2026, 8, 21).getTime())
  })

  test('a Sunday belongs to the week that began six days before', () => {
    expect(weekDays(new Date(2026, 8, 20, 22))[0].start).toBe(
      new Date(2026, 8, 14).getTime(),
    )
  })

  test('each day ends where the next begins', () => {
    const days = weekDays(new Date(2026, 8, 16))
    for (let i = 0; i < 6; i++) expect(days[i].end).toBe(days[i + 1].start)
  })

  test('the Sunday the clocks change is 23 hours, and still one day', () => {
    const days = weekDays(new Date(2027, 2, 24)) // the week of 28 Mar 2027
    expect(days[6].end - days[6].start).toBe(23 * 3_600_000)
    expect(days[6].end).toBe(new Date(2027, 2, 29).getTime())
  })
})

describe('the timeline split by day', () => {
  const days = weekDays(new Date(2026, 8, 16))

  test('an item belongs to the day it starts in', () => {
    const late = item('late', new Date(2026, 8, 20, 23, 30))
    const next = item('next', new Date(2026, 8, 21, 0, 0))
    const byDay = itemsByDay([late, next], days)
    expect(byDay[6].map((i) => i.id)).toEqual(['late'])
    expect(byDay.flat().map((i) => i.id)).toEqual(['late'])
  })

  test('seven lists, in the order the items came', () => {
    const a = item('a', new Date(2026, 8, 15, 8))
    const b = item('b', new Date(2026, 8, 15, 18))
    const c = item('c', new Date(2026, 8, 16, 18))
    const byDay = itemsByDay([a, b, c], days)
    expect(byDay).toHaveLength(7)
    expect(byDay[1].map((i) => i.id)).toEqual(['a', 'b'])
    expect(byDay[2].map((i) => i.id)).toEqual(['c'])
    expect(byDay[0]).toEqual([])
  })
})
