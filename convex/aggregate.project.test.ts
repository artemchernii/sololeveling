/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* Logs refuse the future, so "now" is pinned. Only Date is faked: convex-test
   schedules with real timers. */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 16, 12))
})
afterEach(() => {
  vi.useRealTimers()
})

const SEP = new Date(2026, 8, 1).getTime()
const OCT = new Date(2026, 9, 1).getTime()

type Caller = ReturnType<ReturnType<typeof convexTest>['withIdentity']>

async function project(t: Caller, title: string) {
  return await t.mutation(api.projects.create, { title })
}

describe('time on a project (source 1: its session logs)', () => {
  test('sums the minutes of its sessions this month, and counts them', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const oreum = await project(me, 'Oreum')
    const other = await project(me, 'Solo Leveling')

    const log = (
      occurredAt: number,
      value: number | undefined,
      projectId = oreum,
    ) =>
      me.mutation(api.logs.create, {
        kind: 'session',
        area: 'business',
        occurredAt,
        value,
        unit: value === undefined ? undefined : 'min',
        projectId,
      })

    await log(new Date(2026, 8, 2, 9).getTime(), 90)
    await log(new Date(2026, 8, 15, 20).getTime(), 45)
    /* A session with no minutes still happened: counted, adds nothing. */
    await log(new Date(2026, 8, 16, 8).getTime(), undefined)
    /* Last month, and another project: neither. */
    await log(new Date(2026, 7, 31, 22).getTime(), 60)
    await log(new Date(2026, 8, 10, 9).getTime(), 30, other)

    expect(
      await me.query(api.aggregate.projectTime, {
        projectId: oreum,
        start: SEP,
        end: OCT,
      }),
    ).toEqual({ minutes: 135, sessions: 3, days: [] })
  })

  test('buckets minutes into the days it is asked for, and no others', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const oreum = await project(me, 'Oreum')

    const log = (occurredAt: number, value: number) =>
      me.mutation(api.logs.create, {
        kind: 'session',
        area: 'business',
        occurredAt,
        value,
        unit: 'min',
        projectId: oreum,
      })

    /* Two on the 15th, one on the 16th, one before the window opens. "Now"
       is pinned to midday on the 16th and a log may not be in the future. */
    await log(new Date(2026, 8, 15, 9).getTime(), 20)
    await log(new Date(2026, 8, 15, 21).getTime(), 25)
    await log(new Date(2026, 8, 16, 9).getTime(), 40)
    await log(new Date(2026, 8, 14, 23, 59).getTime(), 99)

    const dayStarts = [
      new Date(2026, 8, 15).getTime(),
      new Date(2026, 8, 16).getTime(),
      new Date(2026, 8, 17).getTime(),
    ]

    const out = await me.query(api.aggregate.projectTime, {
      projectId: oreum,
      start: dayStarts[0],
      end: new Date(2026, 8, 18).getTime(),
      dayStarts,
    })

    /* The 14th's 99 is outside the range entirely; a day with nothing is a
       zero, not a gap. */
    expect(out.days).toEqual([45, 40, 0])
    expect(out.minutes).toBe(85)
  })

  test('a ticked task on the project is not time spent on it', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const oreum = await project(me, 'Oreum')
    const taskId = await me.mutation(api.tasks.create, { title: 'Invoice' })
    await me.mutation(api.tasks.setProject, { taskId, projectId: oreum })
    await me.mutation(api.tasks.complete, { taskId })

    expect(
      await me.query(api.aggregate.projectTime, {
        projectId: oreum,
        start: SEP,
        end: OCT,
      }),
    ).toEqual({ minutes: 0, sessions: 0, days: [] })
  })

  test('another owner’s project reads as nothing, and a bad id does not throw', async () => {
    const t = convexTest(schema, modules)
    const me = t.withIdentity({ tokenIdentifier: ME })
    const them = t.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    const oreum = await project(me, 'Oreum')
    await me.mutation(api.logs.create, {
      kind: 'session',
      area: 'business',
      occurredAt: new Date(2026, 8, 2, 9).getTime(),
      value: 90,
      unit: 'min',
      projectId: oreum,
    })

    expect(
      await them.query(api.aggregate.projectTime, {
        projectId: oreum,
        start: SEP,
        end: OCT,
      }),
    ).toEqual({ minutes: 0, sessions: 0, days: [] })
    expect(
      await me.query(api.aggregate.projectTime, {
        projectId: 'not-an-id',
        start: SEP,
        end: OCT,
      }),
    ).toEqual({ minutes: 0, sessions: 0, days: [] })
  })
})
