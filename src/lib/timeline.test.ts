import { describe, expect, test } from 'vitest'

import { bookedHoursLine, buildTimeline } from './timeline'
import type { Doc } from '../../convex/_generated/dataModel'

const noon = new Date(2026, 8, 8, 12).getTime()

/* A timeline is always of a period. These tests use the day `noon` falls in. */
const day = {
  start: new Date(2026, 8, 8).getTime(),
  end: new Date(2026, 8, 9).getTime(),
}

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
    expect(buildTimeline([task()], [], day)).toHaveLength(0)
  })

  test('a scheduled task is', () => {
    const items = buildTimeline(
      [task({ scheduledAt: noon, durationMin: 90 })],
      [],
      day,
    )
    expect(items).toHaveLength(1)
    expect(items[0].source).toBe('task')
  })

  test('an event’s end becomes a length — the timeline speaks in lengths', () => {
    const items = buildTimeline([], [event()], day)
    expect(items[0].durationMin).toBe(60)
    expect(items[0].source).toBe('event')
  })

  test('both sorted together by start, still distinguishable', () => {
    const items = buildTimeline(
      [task({ scheduledAt: noon + 7_200_000, durationMin: 60 })],
      [event()],
      day,
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
      day,
    )
    expect(bookedHoursLine(items)).toContain('3 booked hours')
  })

  test('one hour is singular', () => {
    expect(bookedHoursLine(buildTimeline([], [event()], day))).toContain(
      '1 booked hour.',
    )
  })

  test('booked but untimed does not claim zero hours', () => {
    const items = buildTimeline([task({ scheduledAt: noon })], [], day)
    expect(bookedHoursLine(items)).toContain('untimed')
  })
})

describe('a timeline is of a period (PLAN.md §3b.6)', () => {
  const week = {
    start: new Date(2026, 8, 7).getTime(),
    end: new Date(2026, 8, 14).getTime(),
  }

  test('a series is many items, not the one row it is stored as', () => {
    const gym = event({
      startsAt: new Date(2026, 8, 7, 9).getTime(),
      endsAt: new Date(2026, 8, 7, 10).getTime(),
      rrule: 'FREQ=DAILY',
    })
    const items = buildTimeline([], [gym], week)
    expect(items).toHaveLength(7)
    expect(new Set(items.map((i) => i.id)).size).toBe(7)
  })

  test('an event before the window is not on it', () => {
    const past = event({
      startsAt: new Date(2026, 8, 1, 9).getTime(),
      endsAt: new Date(2026, 8, 1, 10).getTime(),
    })
    expect(buildTimeline([], [past], week)).toHaveLength(0)
  })

  test('a task scheduled outside the window is not on it either', () => {
    const later = task({
      scheduledAt: new Date(2026, 8, 20, 9).getTime(),
      durationMin: 60,
    })
    expect(buildTimeline([later], [], week)).toHaveLength(0)
  })

  test('each occurrence keeps the length of its series', () => {
    const gym = event({
      startsAt: new Date(2026, 8, 8, 9).getTime(),
      endsAt: new Date(2026, 8, 8, 10, 30).getTime(),
      rrule: 'FREQ=DAILY',
    })
    for (const item of buildTimeline([], [gym], week)) {
      expect(item.durationMin).toBe(90)
    }
  })
})
