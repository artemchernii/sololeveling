/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

function as(subject: string) {
  return convexTest(schema, modules).withIdentity({ tokenIdentifier: subject })
}

function at(y: number, m: number, d: number, h: number) {
  return new Date(y, m - 1, d, h).getTime()
}

const MARCH_3 = at(2026, 3, 3, 9)
const HOUR = 60 * 60 * 1000

describe('a window read finds what belongs in it', () => {
  test('an event starting inside the window', async () => {
    const t = as(ME)
    await t.mutation(api.events.create, {
      title: 'Dentist',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
    })
    const found = await t.query(api.events.listInRange, {
      from: at(2026, 3, 2, 0),
      to: at(2026, 3, 9, 0),
    })
    expect(found.map((e) => e.title)).toEqual(['Dentist'])
  })

  test('not a one-off that starts outside it', async () => {
    const t = as(ME)
    await t.mutation(api.events.create, {
      title: 'Dentist',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
    })
    const found = await t.query(api.events.listInRange, {
      from: at(2026, 4, 1, 0),
      to: at(2026, 4, 8, 0),
    })
    expect(found).toEqual([])
  })

  /* The read this whole index exists for: the row is months behind the window,
     the occurrences are not. */
  test('a series that began long before the window', async () => {
    const t = as(ME)
    await t.mutation(api.events.create, {
      title: 'Gym',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
    })
    const found = await t.query(api.events.listInRange, {
      from: at(2026, 9, 1, 0),
      to: at(2026, 9, 8, 0),
    })
    expect(found.map((e) => e.title)).toEqual(['Gym'])
  })

  test('a series inside the window is returned once, not twice', async () => {
    const t = as(ME)
    await t.mutation(api.events.create, {
      title: 'Gym',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
    })
    const found = await t.query(api.events.listInRange, {
      from: at(2026, 3, 2, 0),
      to: at(2026, 3, 9, 0),
    })
    expect(found).toHaveLength(1)
  })

  test('a past one-off is not dragged in by the series read', async () => {
    const t = as(ME)
    await t.mutation(api.events.create, {
      title: 'Old dentist',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
    })
    const found = await t.query(api.events.listInRange, {
      from: at(2026, 9, 1, 0),
      to: at(2026, 9, 8, 0),
    })
    expect(found).toEqual([])
  })
})

describe('ownership', () => {
  test('a window read never crosses to another owner', async () => {
    const mine = as(ME)
    const theirs = as(SOMEONE_ELSE)
    await theirs.mutation(api.events.create, {
      title: 'Their therapy',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
    })
    const found = await mine.query(api.events.listInRange, {
      from: at(2026, 3, 2, 0),
      to: at(2026, 3, 9, 0),
    })
    expect(found).toEqual([])
  })

  test('someone else cannot edit or delete my event', async () => {
    const mine = as(ME)
    const eventId = await mine.mutation(api.events.create, {
      title: 'Gym',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
    })
    const theirs = as(SOMEONE_ELSE)
    await expect(
      theirs.mutation(api.events.update, { eventId, title: 'Cancelled' }),
    ).rejects.toThrow()
    await expect(
      theirs.mutation(api.events.remove, { eventId }),
    ).rejects.toThrow()
  })

  test('signed out reads nothing', async () => {
    const anonymous = convexTest(schema, modules)
    await expect(
      anonymous.query(api.events.listInRange, {
        from: at(2026, 3, 2, 0),
        to: at(2026, 3, 9, 0),
      }),
    ).rejects.toThrow()
  })
})

describe('what an event refuses', () => {
  test('a title of only whitespace', async () => {
    const t = as(ME)
    await expect(
      t.mutation(api.events.create, {
        title: '   ',
        startsAt: MARCH_3,
        endsAt: MARCH_3 + HOUR,
      }),
    ).rejects.toThrow()
  })

  test('ending before it starts', async () => {
    const t = as(ME)
    await expect(
      t.mutation(api.events.create, {
        title: 'Time travel',
        startsAt: MARCH_3,
        endsAt: MARCH_3 - HOUR,
      }),
    ).rejects.toThrow()
  })

  test('being edited into ending before it starts', async () => {
    const t = as(ME)
    const eventId = await t.mutation(api.events.create, {
      title: 'Gym',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
    })
    await expect(
      t.mutation(api.events.update, { eventId, endsAt: MARCH_3 - HOUR }),
    ).rejects.toThrow()
  })

  /* A zero-length marker is a real thing to put on a day. */
  test('but allows a zero-length marker', async () => {
    const t = as(ME)
    await expect(
      t.mutation(api.events.create, {
        title: 'Rent due',
        startsAt: MARCH_3,
        endsAt: MARCH_3,
      }),
    ).resolves.toBeDefined()
  })
})
