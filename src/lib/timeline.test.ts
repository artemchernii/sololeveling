import { describe, expect, test } from 'vitest'

import { bookedHoursLine, buildTimeline } from './timeline'
import type { Doc } from '../../convex/_generated/dataModel'

const noon = new Date(2026, 8, 8, 12).getTime()

function task(over: Partial<Doc<'tasks'>> = {}) {
  return {
    _id: 'task1',
    _creationTime: 0,
    ownerId: 'me',
    title: 'Deep work',
    priority: 0,
    status: 'open',
    ...over,
  } as Doc<'tasks'>
}

function event(over: Partial<Doc<'events'>> = {}) {
  return {
    _id: 'event1',
    _creationTime: 0,
    ownerId: 'me',
    title: 'Dentist',
    startsAt: noon,
    endsAt: noon + 3_600_000,
    ...over,
  } as Doc<'events'>
}

describe('tasks and events meet only here (PLAN.md §3b.3)', () => {
  test('an undated task is not on the timeline', () => {
    expect(buildTimeline([task()], [])).toHaveLength(0)
  })

  test('a scheduled task is', () => {
    const items = buildTimeline(
      [task({ scheduledAt: noon, durationMin: 90 })],
      [],
    )
    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('task')
  })

  test('an event’s end becomes a length — the timeline speaks in lengths', () => {
    const items = buildTimeline([], [event()])
    expect(items[0].durationMin).toBe(60)
    expect(items[0].source).toBe('event')
  })

  test('both sorted together by start, still distinguishable', () => {
    const items = buildTimeline(
      [task({ scheduledAt: noon + 7_200_000, durationMin: 60 })],
      [event()],
    )
    expect(items.map((i) => i.source)).toEqual(['event', 'task'])
  })
})

describe('the booked-hours line tells the truth', () => {
  test('nothing booked says so', () => {
    expect(bookedHoursLine([])).toContain('whole day is yours')
  })

  test('three hours reads as three', () => {
    const items = buildTimeline(
      [task({ scheduledAt: noon, durationMin: 120 })],
      [event()],
    )
    expect(bookedHoursLine(items)).toContain('3 booked hours')
  })

  test('one hour is singular', () => {
    expect(bookedHoursLine(buildTimeline([], [event()]))).toContain(
      '1 booked hour.',
    )
  })

  test('booked but untimed does not claim zero hours', () => {
    const items = buildTimeline([task({ scheduledAt: noon })], [])
    expect(bookedHoursLine(items)).toContain('untimed')
  })
})
