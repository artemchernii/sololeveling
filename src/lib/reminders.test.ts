import { describe, expect, test } from 'vitest'

import { GRACE_MS, reminderText, remindersToFire } from './reminders'
import type { Doc, Id } from '../../convex/_generated/dataModel'

const eight = new Date(2026, 8, 24, 8, 0).getTime()
const MIN = 60_000

function event(extra: Partial<Doc<'events'>> = {}): Doc<'events'> {
  return {
    _id: 'e1' as Id<'events'>,
    _creationTime: 0,
    ownerId: 'me',
    title: 'Gym',
    startsAt: eight,
    endsAt: eight + 60 * MIN,
    ...extra,
  }
}

describe('which reminders fire now', () => {
  test('ten minutes before, it fires', () => {
    const due = remindersToFire([event({ remindMin: 10 })], eight - 10 * MIN)
    expect(due.map((d) => d.title)).toEqual(['Gym'])
    expect(due[0].key).toBe(`e1:${eight}`)
  })

  test('not before its moment', () => {
    expect(
      remindersToFire([event({ remindMin: 10 })], eight - 11 * MIN),
    ).toEqual([])
  })

  test('not hours late when no tab was open', () => {
    expect(
      remindersToFire(
        [event({ remindMin: 10 })],
        eight - 10 * MIN + GRACE_MS + 1,
      ),
    ).toEqual([])
  })

  test('not for an event without one', () => {
    expect(remindersToFire([event()], eight)).toEqual([])
  })

  test('each occurrence of a series, by its own key', () => {
    const tomorrow = eight + 24 * 60 * MIN
    const due = remindersToFire(
      [event({ remindMin: 0, rrule: 'FREQ=DAILY' })],
      tomorrow,
    )
    expect(due.map((d) => d.key)).toEqual([`e1:${tomorrow}`])
  })
})

describe('what it says', () => {
  test('minutes, now, hours', () => {
    const r = { key: 'k', title: 'Gym', startsAt: eight, fireAt: eight }
    expect(reminderText(r, eight - 10 * MIN)).toBe('Gym in 10 min')
    expect(reminderText(r, eight)).toBe('Gym now')
    expect(reminderText(r, eight - 60 * MIN)).toBe('Gym in 1 hour')
  })
})
