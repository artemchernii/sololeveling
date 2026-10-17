import { describe, expect, test } from 'vitest'

import { dayStart, nextReminder, reminderBody, reminderTitle } from './remindAt'

const MIN = 60_000

describe('nextReminder names its zone, not the server clock', () => {
  /* New York, not the test run's Lisbon: proves the zone is the one passed.
     Its clocks went back on 1 Nov 2026; 18:00 EDT is 22:00 UTC, 18:00 EST
     is 23:00 UTC. */
  const NY = 'America/New_York'
  const weekly = {
    startsAt: Date.UTC(2026, 9, 25, 22),
    rrule: 'FREQ=WEEKLY',
    remindMin: 10,
  }

  test('a weekly 18:00 stays 18:00 across the clock change', () => {
    const after = Date.UTC(2026, 9, 25, 22) - 10 * MIN
    expect(nextReminder(weekly, after, NY)).toEqual({
      startsAt: Date.UTC(2026, 10, 1, 23),
      fireAt: Date.UTC(2026, 10, 1, 23) - 10 * MIN,
    })
    expect(reminderTitle('Run', Date.UTC(2026, 10, 1, 23), NY)).toBe(
      'Run · 18:00',
    )
  })

  test('no reminder → null; a one-off whose moment passed → null', () => {
    expect(nextReminder({ startsAt: 0 }, -1)).toBeNull()
    expect(nextReminder({ startsAt: 10 * MIN, remindMin: 10 }, 0)).toBeNull()
    expect(nextReminder({ startsAt: 11 * MIN, remindMin: 10 }, 0)).toEqual({
      startsAt: 11 * MIN,
      fireAt: MIN,
    })
  })

  test('an rrule that does not parse is a one-off', () => {
    expect(
      nextReminder({ startsAt: 11 * MIN, rrule: 'nope', remindMin: 10 }, 0),
    ).toEqual({ startsAt: 11 * MIN, fireAt: MIN })
  })
})

test('the body says how soon', () => {
  expect(reminderBody(0)).toBe('Now · Calendar')
  expect(reminderBody(10)).toBe('In 10 min · Calendar')
  expect(reminderBody(60)).toBe('In 1 h · Calendar')
})

test("dayStart is the zone's midnight", () => {
  /* 00:30 in Lisbon (UTC+1 in summer) is 23:30 UTC the day before. */
  expect(dayStart(Date.UTC(2026, 9, 16, 23, 30))).toBe(
    Date.UTC(2026, 9, 16, 23),
  )
  expect(dayStart(Date.UTC(2026, 10, 2, 12))).toBe(Date.UTC(2026, 10, 2))
})
