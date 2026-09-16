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
  const goalId = await t.mutation(api.goals.create, {
    title: `goal for ${title}`,
    area: 'business',
  })
  return await t.mutation(api.projects.create, { goalId, title })
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
    ).toEqual({ minutes: 135, sessions: 3 })
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
    ).toEqual({ minutes: 0, sessions: 0 })
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
    ).toEqual({ minutes: 0, sessions: 0 })
    expect(
      await me.query(api.aggregate.projectTime, {
        projectId: 'not-an-id',
        start: SEP,
        end: OCT,
      }),
    ).toEqual({ minutes: 0, sessions: 0 })
  })
})
