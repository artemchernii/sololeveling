import { describe, expect, test } from 'vitest'

import {
  expandEvent,
  expandEvents,
  occurrenceId,
  parseOccurrenceId,
} from './recurrence'
import type { Doc } from '../../convex/_generated/dataModel'

/* All times below are Europe/Lisbon wall clock, pinned in vitest.config.ts.
   That pin is what makes the DST case real: CI runs in UTC, where the clocks
   never change and a broken expansion would pass. */

function at(y: number, m: number, d: number, h: number, min = 0) {
  return new Date(y, m - 1, d, h, min).getTime()
}

function event(over: Partial<Doc<'events'>> = {}) {
  return {
    _id: 'event1',
    _creationTime: 0,
    ownerId: 'me',
    title: 'Gym',
    startsAt: at(2026, 3, 3, 9),
    endsAt: at(2026, 3, 3, 10),
    ...over,
  } as Doc<'events'>
}

describe('a one-off event', () => {
  test('appears when it starts inside the window', () => {
    const occurrences = expandEvent(
      event(),
      at(2026, 3, 2, 0),
      at(2026, 3, 9, 0),
    )
    expect(occurrences).toHaveLength(1)
    expect(occurrences[0].startsAt).toBe(at(2026, 3, 3, 9))
    expect(occurrences[0].endsAt).toBe(at(2026, 3, 3, 10))
  })

  test('is absent when it starts outside the window', () => {
    expect(
      expandEvent(event(), at(2026, 3, 10, 0), at(2026, 3, 17, 0)),
    ).toHaveLength(0)
  })
})

describe('a weekly series', () => {
  const weekly = event({ rrule: 'FREQ=WEEKLY;BYDAY=TU' })

  test('lands on every matching day in the window', () => {
    const occurrences = expandEvent(
      weekly,
      at(2026, 3, 2, 0),
      at(2026, 3, 30, 0),
    )
    expect(occurrences.map((o) => o.startsAt)).toEqual([
      at(2026, 3, 3, 9),
      at(2026, 3, 10, 9),
      at(2026, 3, 17, 9),
      at(2026, 3, 24, 9),
    ])
  })

  test('keeps the length of the original event', () => {
    const occurrences = expandEvent(
      weekly,
      at(2026, 3, 2, 0),
      at(2026, 3, 30, 0),
    )
    for (const o of occurrences) {
      expect(o.endsAt - o.startsAt).toBe(60 * 60 * 1000)
    }
  })

  test('never starts before the event itself', () => {
    const occurrences = expandEvent(
      weekly,
      at(2026, 1, 1, 0),
      at(2026, 3, 10, 0),
    )
    expect(occurrences.map((o) => o.startsAt)).toEqual([at(2026, 3, 3, 9)])
  })

  test('honours COUNT', () => {
    const capped = event({ rrule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=2' })
    expect(
      expandEvent(capped, at(2026, 3, 2, 0), at(2026, 4, 30, 0)),
    ).toHaveLength(2)
  })

  test('honours UNTIL', () => {
    const ending = event({
      rrule: 'FREQ=WEEKLY;BYDAY=TU;UNTIL=20260318T000000Z',
    })
    expect(
      expandEvent(ending, at(2026, 3, 2, 0), at(2026, 4, 30, 0)).map(
        (o) => o.startsAt,
      ),
    ).toEqual([at(2026, 3, 3, 9), at(2026, 3, 10, 9), at(2026, 3, 17, 9)])
  })
})

describe('daylight saving', () => {
  /* Lisbon springs forward on 29 March 2026. A 09:00 gym session is 09:00
     before and after — the wall clock is what the human keeps, not the offset.
     Expanding in UTC would silently move it to 08:00. */
  test('a weekly 09:00 event is still 09:00 after the clocks change', () => {
    const weekly = event({ rrule: 'FREQ=WEEKLY;BYDAY=TU' })
    const occurrences = expandEvent(
      weekly,
      at(2026, 3, 24, 0),
      at(2026, 4, 8, 0),
    )
    const hours = occurrences.map((o) => new Date(o.startsAt).getHours())
    expect(hours).toEqual([9, 9, 9])
    expect(occurrences[1].startsAt).toBe(at(2026, 3, 31, 9))
  })

  test('still an hour long across the change', () => {
    const weekly = event({ rrule: 'FREQ=WEEKLY;BYDAY=TU' })
    const occurrences = expandEvent(
      weekly,
      at(2026, 3, 24, 0),
      at(2026, 4, 8, 0),
    )
    for (const o of occurrences) {
      expect(new Date(o.endsAt).getHours()).toBe(10)
    }
  })
})

describe('occurrence identity', () => {
  test('is the event id and the instant it starts', () => {
    const occurrences = expandEvent(
      event({ rrule: 'FREQ=WEEKLY;BYDAY=TU' }),
      at(2026, 3, 2, 0),
      at(2026, 3, 16, 0),
    )
    expect(occurrences[0].id).toBe(`event1:${at(2026, 3, 3, 9)}`)
    expect(occurrenceId(occurrences[1])).toBe(`event1:${at(2026, 3, 10, 9)}`)
  })

  test('is stable across two expansions of different windows', () => {
    const weekly = event({ rrule: 'FREQ=WEEKLY;BYDAY=TU' })
    const wide = expandEvent(weekly, at(2026, 3, 2, 0), at(2026, 3, 30, 0))
    const narrow = expandEvent(weekly, at(2026, 3, 9, 0), at(2026, 3, 16, 0))
    expect(narrow.map((o) => o.id)).toEqual([wide[1].id])
  })

  test('distinguishes two series that start at the same instant', () => {
    const a = event({ _id: 'a', rrule: 'FREQ=WEEKLY;BYDAY=TU' } as never)
    const b = event({ _id: 'b', rrule: 'FREQ=WEEKLY;BYDAY=TU' } as never)
    const [first] = expandEvent(a, at(2026, 3, 2, 0), at(2026, 3, 9, 0))
    const [second] = expandEvent(b, at(2026, 3, 2, 0), at(2026, 3, 9, 0))
    expect(first.id).not.toBe(second.id)
  })
})

describe('expanding many events', () => {
  test('returns them in start order, not event order', () => {
    const later = event({
      _id: 'later',
      startsAt: at(2026, 3, 4, 9),
      endsAt: at(2026, 3, 4, 10),
    } as never)
    const earlier = event({
      _id: 'earlier',
      startsAt: at(2026, 3, 3, 9),
      endsAt: at(2026, 3, 3, 10),
    } as never)
    const occurrences = expandEvents(
      [later, earlier],
      at(2026, 3, 2, 0),
      at(2026, 3, 9, 0),
    )
    expect(occurrences.map((o) => o.eventId)).toEqual(['earlier', 'later'])
  })

  test('an unparseable rrule yields the event itself, not a crash', () => {
    const broken = event({ rrule: 'this is not an rrule' })
    const occurrences = expandEvent(
      broken,
      at(2026, 3, 2, 0),
      at(2026, 3, 9, 0),
    )
    expect(occurrences.map((o) => o.startsAt)).toEqual([at(2026, 3, 3, 9)])
  })
})

describe('reading an occurrence id back', () => {
  test('recovers the event and the instant', () => {
    const parsed = parseOccurrenceId(`event1:${at(2026, 3, 3, 9)}`)
    expect(parsed).toEqual({ eventId: 'event1', startsAt: at(2026, 3, 3, 9) })
  })

  test('round-trips whatever expansion produced', () => {
    const [occurrence] = expandEvent(
      event({ rrule: 'FREQ=WEEKLY;BYDAY=TU' }),
      at(2026, 3, 2, 0),
      at(2026, 3, 9, 0),
    )
    expect(parseOccurrenceId(occurrence.id)).toEqual({
      eventId: occurrence.eventId,
      startsAt: occurrence.startsAt,
    })
  })

  test('refuses a task id, which carries no instant', () => {
    expect(parseOccurrenceId('task1')).toBeNull()
  })

  test('refuses an id whose instant is not a number', () => {
    expect(parseOccurrenceId('event1:tuesday')).toBeNull()
  })
})
