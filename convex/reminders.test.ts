/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

/* N1b. Calendar reminders sent by the server, and a dropped file saying
   it is read. Vitest runs in Lisbon (vitest.config.ts), so `new Date(y,
   m, d, h)` is his wall clock. */

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'
const MIN = 60_000
const HOUR = 60 * MIN

function twoOwners() {
  const t = convexTest(schema, modules)
  return {
    t,
    mine: t.withIdentity({ tokenIdentifier: ME }),
    theirs: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

type Backend = ReturnType<typeof twoOwners>['t']

const at = (m: number, d: number, h: number) =>
  new Date(2026, m - 1, d, h).getTime()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 2, 12))
})
afterEach(() => {
  vi.useRealTimers()
})

async function jobOf(t: Backend, id: Id<'events'>) {
  return await t.run(async (ctx) => {
    const event = await ctx.db.get(id)
    if (!event?.remindJob) return null
    return await ctx.db.system.get(event.remindJob)
  })
}

async function notes(t: Backend) {
  return await t.run((ctx) => ctx.db.query('notifications').collect())
}

describe('a new event at 21:00 with 10 min (N1b S11)', () => {
  test('saved → one job at 20:50, for that start', async () => {
    const { t, mine } = twoOwners()
    const id = await mine.mutation(api.events.create, {
      title: 'Run',
      startsAt: at(11, 2, 21),
      endsAt: at(11, 2, 22),
      remindMin: 10,
    })
    const job = await jobOf(t, id)
    expect(job?.state.kind).toBe('pending')
    expect(job?.scheduledTime).toBe(at(11, 2, 21) - 10 * MIN)
    expect(job?.args[0]).toEqual({ eventId: id, startsAt: at(11, 2, 21) })
  })

  test('moved to 22:00 → the job at 21:50, the old one cancelled', async () => {
    const { t, mine } = twoOwners()
    const id = await mine.mutation(api.events.create, {
      title: 'Run',
      startsAt: at(11, 2, 21),
      endsAt: at(11, 2, 22),
      remindMin: 10,
    })
    const old = await jobOf(t, id)
    await mine.mutation(api.events.update, {
      eventId: id,
      startsAt: at(11, 2, 22),
      endsAt: at(11, 2, 23),
    })
    const moved = await jobOf(t, id)
    expect(moved?.scheduledTime).toBe(at(11, 2, 22) - 10 * MIN)
    const before = await t.run((ctx) => ctx.db.system.get(old!._id))
    expect(before?.state.kind).toBe('canceled')
  })

  test('reminder set to None → no job', async () => {
    const { t, mine } = twoOwners()
    const id = await mine.mutation(api.events.create, {
      title: 'Run',
      startsAt: at(11, 2, 21),
      endsAt: at(11, 2, 22),
      remindMin: 10,
    })
    const old = await jobOf(t, id)
    await mine.mutation(api.events.update, { eventId: id, remindMin: null })
    expect(await jobOf(t, id)).toBeNull()
    const before = await t.run((ctx) => ctx.db.system.get(old!._id))
    expect(before?.state.kind).toBe('canceled')
  })

  test('removed → the job cancelled', async () => {
    const { t, mine } = twoOwners()
    const id = await mine.mutation(api.events.create, {
      title: 'Run',
      startsAt: at(11, 2, 21),
      endsAt: at(11, 2, 22),
      remindMin: 10,
    })
    const old = await jobOf(t, id)
    await mine.mutation(api.events.remove, { eventId: id })
    const job = await t.run((ctx) => ctx.db.system.get(old!._id))
    expect(job?.state.kind).toBe('canceled')
  })

  test('no reminder, or its moment already past → no job', async () => {
    const { t, mine } = twoOwners()
    const none = await mine.mutation(api.events.create, {
      title: 'Read',
      startsAt: at(11, 2, 21),
      endsAt: at(11, 2, 22),
    })
    const soon = await mine.mutation(api.events.create, {
      title: 'Call',
      startsAt: Date.now() + 5 * MIN,
      endsAt: Date.now() + HOUR,
      remindMin: 10,
    })
    expect(await jobOf(t, none)).toBeNull()
    expect(await jobOf(t, soon)).toBeNull()
  })

  test('fired → a reminder row "Run · 21:00", "In 10 min · Calendar"', async () => {
    const { t, mine } = twoOwners()
    const id = await mine.mutation(api.events.create, {
      title: 'Run',
      startsAt: at(11, 2, 21),
      endsAt: at(11, 2, 22),
      remindMin: 10,
    })
    vi.setSystemTime(at(11, 2, 21) - 10 * MIN)
    await t.mutation(internal.events.remind, {
      eventId: id,
      startsAt: at(11, 2, 21),
    })
    const rows = await notes(t)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ownerId: ME,
      kind: 'reminder',
      title: 'Run · 21:00',
      body: 'In 10 min · Calendar',
      url: '/calendar',
    })
    /* A one-off event has nothing after it. */
    expect(await jobOf(t, id)).toBeNull()
  })

  test('fired after the event was removed → nothing sent', async () => {
    const { t, mine } = twoOwners()
    const id = await mine.mutation(api.events.create, {
      title: 'Run',
      startsAt: at(11, 2, 21),
      endsAt: at(11, 2, 22),
      remindMin: 10,
    })
    await mine.mutation(api.events.remove, { eventId: id })
    await t.mutation(internal.events.remind, {
      eventId: id,
      startsAt: at(11, 2, 21),
    })
    expect(await notes(t)).toHaveLength(0)
  })

  test("someone else's event cannot be moved, so its job stays", async () => {
    const { t, mine, theirs } = twoOwners()
    const id = await mine.mutation(api.events.create, {
      title: 'Run',
      startsAt: at(11, 2, 21),
      endsAt: at(11, 2, 22),
      remindMin: 10,
    })
    await expect(
      theirs.mutation(api.events.update, {
        eventId: id,
        startsAt: at(11, 3, 9),
        endsAt: at(11, 3, 10),
      }),
    ).rejects.toThrow('No such event')
    await expect(
      theirs.mutation(api.events.remove, { eventId: id }),
    ).rejects.toThrow('No such event')
    const job = await jobOf(t, id)
    expect(job?.state.kind).toBe('pending')
    expect(job?.scheduledTime).toBe(at(11, 2, 21) - 10 * MIN)
  })
})

describe('a weekly series (N1b S12)', () => {
  test('after firing, next week is scheduled, at the same wall clock', async () => {
    /* Began in summer time; the clocks went back on 25 Oct. */
    const { t, mine } = twoOwners()
    vi.setSystemTime(new Date(2026, 9, 13, 12))
    const id = await mine.mutation(api.events.create, {
      title: 'Stretch',
      startsAt: at(10, 20, 18),
      endsAt: at(10, 20, 19),
      rrule: 'FREQ=WEEKLY',
      remindMin: 10,
    })
    expect((await jobOf(t, id))?.scheduledTime).toBe(at(10, 20, 18) - 10 * MIN)

    vi.setSystemTime(at(10, 20, 18) - 10 * MIN)
    await t.mutation(internal.events.remind, {
      eventId: id,
      startsAt: at(10, 20, 18),
    })
    const next = await jobOf(t, id)
    expect(next?.state.kind).toBe('pending')
    expect(next?.scheduledTime).toBe(at(10, 27, 18) - 10 * MIN)
    expect(next?.args[0]).toEqual({ eventId: id, startsAt: at(10, 27, 18) })
    expect((await notes(t))[0].title).toBe('Stretch · 18:00')
  })

  test('a series made long ago schedules its next one, not its first', async () => {
    const { t, mine } = twoOwners()
    const id = await mine.mutation(api.events.create, {
      title: 'Class',
      startsAt: at(3, 3, 9),
      endsAt: at(3, 3, 10),
      rrule: 'FREQ=WEEKLY',
      remindMin: 30,
    })
    /* 3 March was a Tuesday; now is Monday 2 November. */
    expect((await jobOf(t, id))?.scheduledTime).toBe(at(11, 3, 9) - 30 * MIN)
  })
})

async function intake(t: Backend, fields: Record<string, unknown> = {}) {
  return await t.run((ctx) =>
    ctx.db.insert('intakes', {
      ownerId: ME,
      storageIds: [],
      status: 'reading',
      ...fields,
    }),
  )
}

const ROW = {
  occurredAt: at(10, 1, 9),
  merchant: 'Pingo Doce',
  raw: 'PINGO DOCE',
  amount: -6.7,
  currency: 'EUR',
  pending: false,
  self: false,
}

describe('a dropped file finishing (N1b S13)', () => {
  test('a statement read → file_read "Statement read" · "ActivoBank · 34 rows"', async () => {
    const { t } = twoOwners()
    const id = await intake(t)
    await t.mutation(internal.intake.finish, {
      intakeId: id,
      kind: 'transactions',
      title: 'ActivoBank statement · EUR',
      institution: 'ActivoBank',
      transactions: Array.from({ length: 34 }, () => ROW),
    })
    const rows = await notes(t)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      ownerId: ME,
      kind: 'file_read',
      title: 'Statement read',
      body: 'ActivoBank · 34 rows',
      url: '/finances',
    })
  })

  test('a failure → file_failed', async () => {
    const { t } = twoOwners()
    const id = await intake(t, { institution: 'Revolut' })
    await t.mutation(internal.intake.fail, {
      intakeId: id,
      error: 'unreadable',
    })
    const rows = await notes(t)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'file_failed',
      title: 'File not read',
      body: 'Revolut',
    })
  })

  test('a file no longer reading → nothing sent twice', async () => {
    const { t } = twoOwners()
    const id = await intake(t, { status: 'failed' })
    await t.mutation(internal.intake.fail, { intakeId: id, error: 'again' })
    expect(await notes(t)).toHaveLength(0)
  })

  test('a bulk drop says it once, when its last file finishes', async () => {
    const { t } = twoOwners()
    const batchId = await t.run((ctx) =>
      ctx.db.insert('batches', {
        ownerId: ME,
        status: 'open',
        leftOut: [],
        quietMonths: [],
        moves: [],
        extras: [],
        dismissed: [],
      }),
    )
    const a = await intake(t, { batchId })
    const b = await intake(t, { batchId })
    await t.mutation(internal.intake.finish, {
      intakeId: a,
      kind: 'transactions',
      title: 'Revolut',
      transactions: [ROW],
    })
    expect(await notes(t)).toHaveLength(0)
    await t.mutation(internal.intake.fail, { intakeId: b, error: 'x' })
    const rows = await notes(t)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'file_read',
      title: '2 files read',
      body: '1 read · 1 not read',
    })
  })
})
