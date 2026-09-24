/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* One backend per call. Fine for one person; never two of these to test
   ownership — two convexTest() backends are two databases, so "they cannot
   see my row" would pass even if every query returned everyone's. */
function as(subject: string) {
  return convexTest(schema, modules).withIdentity({ tokenIdentifier: subject })
}

/* Two people in one database: my row is really there when they look for it,
   and my id is real when they pass it. */
function twoOwners() {
  const t = convexTest(schema, modules)
  return {
    mine: t.withIdentity({ tokenIdentifier: ME }),
    theirs: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
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
    const { mine, theirs } = twoOwners()
    await theirs.mutation(api.events.create, {
      title: 'Their therapy',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
      rrule: 'FREQ=WEEKLY;BYDAY=TU',
    })
    const window = { from: at(2026, 3, 2, 0), to: at(2026, 3, 9, 0) }

    expect(await mine.query(api.events.listInRange, window)).toEqual([])
    expect(await theirs.query(api.events.listInRange, window)).toHaveLength(1)
  })

  test('someone else cannot edit or delete my event', async () => {
    const { mine, theirs } = twoOwners()
    const eventId = await mine.mutation(api.events.create, {
      title: 'Gym',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
    })
    await expect(
      theirs.mutation(api.events.update, { eventId, title: 'Cancelled' }),
    ).rejects.toThrow('No such event')
    await expect(
      theirs.mutation(api.events.remove, { eventId }),
    ).rejects.toThrow('No such event')

    const found = await mine.query(api.events.listInRange, {
      from: at(2026, 3, 2, 0),
      to: at(2026, 3, 9, 0),
    })
    expect(found.map((e) => e.title)).toEqual(['Gym'])
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

/* R5 — an event bound to a project and a goal, with a reminder, and fields
   that can be cleared again. */
describe('binding, reminders and clearing (R5)', () => {
  async function eventWith(
    t: ReturnType<typeof as>,
    extra: Record<string, unknown> = {},
  ) {
    return await t.mutation(api.events.create, {
      title: 'Gym',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
      ...extra,
    })
  }

  async function read(t: ReturnType<typeof as>) {
    const [row] = await t.query(api.events.listInRange, {
      from: at(2026, 3, 2, 0),
      to: at(2026, 3, 9, 0),
    })
    return row
  }

  test('binds to my project and my goal, and keeps a reminder', async () => {
    const t = as(ME)
    const projectId = await t.mutation(api.projects.create, { title: 'Oreum' })
    const goalId = await t.mutation(api.goals.create, {
      title: 'Strong',
      area: 'body',
    })
    await eventWith(t, { projectId, goalId, remindMin: 10 })

    const row = await read(t)
    expect(row.projectId).toBe(projectId)
    expect(row.goalId).toBe(goalId)
    expect(row.remindMin).toBe(10)
  })

  test("refuses someone else's project", async () => {
    const { mine, theirs } = twoOwners()
    const theirProject = await theirs.mutation(api.projects.create, {
      title: 'Theirs',
    })
    await expect(
      mine.mutation(api.events.create, {
        title: 'Gym',
        startsAt: MARCH_3,
        endsAt: MARCH_3 + HOUR,
        projectId: theirProject,
      }),
    ).rejects.toThrow('No such project')
  })

  test("refuses someone else's goal, on update too", async () => {
    const { mine, theirs } = twoOwners()
    const theirGoal = await theirs.mutation(api.goals.create, {
      title: 'Theirs',
      area: 'body',
    })
    const eventId = await mine.mutation(api.events.create, {
      title: 'Gym',
      startsAt: MARCH_3,
      endsAt: MARCH_3 + HOUR,
    })
    await expect(
      mine.mutation(api.events.update, { eventId, goalId: theirGoal }),
    ).rejects.toThrow('No such goal')
  })

  test('refuses a reminder after the start or beyond a day', async () => {
    const t = as(ME)
    await expect(eventWith(t, { remindMin: -5 })).rejects.toThrow('reminder')
    await expect(eventWith(t, { remindMin: 2000 })).rejects.toThrow(
      'reminder',
    )
  })

  test('null clears a field; absent leaves it alone', async () => {
    const t = as(ME)
    const projectId = await t.mutation(api.projects.create, { title: 'Oreum' })
    const eventId = await eventWith(t, {
      projectId,
      area: 'body',
      rrule: 'FREQ=WEEKLY',
      remindMin: 10,
    })

    await t.mutation(api.events.update, { eventId, title: 'Gym, legs' })
    let row = await read(t)
    expect(row.projectId).toBe(projectId)
    expect(row.rrule).toBe('FREQ=WEEKLY')

    await t.mutation(api.events.update, {
      eventId,
      projectId: null,
      area: null,
      rrule: null,
      remindMin: null,
    })
    row = await read(t)
    expect(row.projectId).toBeUndefined()
    expect(row.area).toBeUndefined()
    expect(row.rrule).toBeUndefined()
    expect(row.remindMin).toBeUndefined()
  })

  test('a drag is a time-only update and touches nothing else', async () => {
    const t = as(ME)
    const eventId = await eventWith(t, { area: 'body', remindMin: 10 })
    const nineFifteen = MARCH_3 + HOUR / 4
    await t.mutation(api.events.update, {
      eventId,
      startsAt: nineFifteen,
      endsAt: nineFifteen + HOUR,
    })
    const row = await read(t)
    expect(row.startsAt).toBe(nineFifteen)
    expect(row.area).toBe('body')
    expect(row.remindMin).toBe(10)
  })
})
