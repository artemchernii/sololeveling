/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'
const TODAY = '2026-09-08'

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

/* These three are the rules the product is built on. None of them is visible in
   a screenshot, and each fails silently if it regresses — which is the whole
   reason they are the first tests in this codebase. */

describe('three quests a day (PLAN.md §3c.1)', () => {
  test('the fourth pick is refused', async () => {
    const t = as(ME)

    const ids: Array<Id<'tasks'>> = []
    for (const title of ['one', 'two', 'three', 'four']) {
      ids.push(await t.mutation(api.tasks.create, { title }))
    }

    for (const id of ids.slice(0, 3)) {
      await t.mutation(api.tasks.pickForToday, { taskId: id, today: TODAY })
    }

    await expect(
      t.mutation(api.tasks.pickForToday, { taskId: ids[3], today: TODAY }),
    ).rejects.toThrow('TODAY_FULL')
    /* And it arrives as data, not a stack trace, because the UI renders it. */
    await t
      .mutation(api.tasks.pickForToday, { taskId: ids[3], today: TODAY })
      .catch((e: unknown) => {
        expect((e as { data: unknown }).data).toBe('TODAY_FULL')
      })

    expect(await t.query(api.tasks.listToday, { today: TODAY })).toHaveLength(3)
  })

  test('finishing one keeps its slot: the day is still three', async () => {
    const t = as(ME)
    const ids: Array<Id<'tasks'>> = []
    for (const title of ['one', 'two', 'three', 'four']) {
      ids.push(await t.mutation(api.tasks.create, { title }))
    }
    for (const id of ids.slice(0, 3)) {
      await t.mutation(api.tasks.pickForToday, { taskId: id, today: TODAY })
    }

    await t.mutation(api.tasks.complete, { taskId: ids[0] })

    await expect(
      t.mutation(api.tasks.pickForToday, { taskId: ids[3], today: TODAY }),
    ).rejects.toThrow()
    const today = await t.query(api.tasks.listToday, { today: TODAY })
    expect(today).toHaveLength(3)
    expect(today.find((x) => x._id === ids[0])?.status).toBe('done')
    /* Done and picked is not in the backlog either way. */
    expect(await t.query(api.tasks.listBacklog, {})).toHaveLength(1)
  })

  test('dropping one frees the slot without completing it', async () => {
    const t = as(ME)
    const a = await t.mutation(api.tasks.create, { title: 'a' })
    await t.mutation(api.tasks.pickForToday, { taskId: a, today: TODAY })
    await t.mutation(api.tasks.dropFromToday, { taskId: a })

    expect(await t.query(api.tasks.listToday, { today: TODAY })).toHaveLength(0)
    expect(await t.query(api.tasks.listBacklog, {})).toHaveLength(1)
  })

  test('re-picking an already-picked task is not a fourth pick', async () => {
    const t = as(ME)
    const a = await t.mutation(api.tasks.create, { title: 'a' })
    await t.mutation(api.tasks.pickForToday, { taskId: a, today: TODAY })
    await t.mutation(api.tasks.pickForToday, { taskId: a, today: TODAY })
    expect(await t.query(api.tasks.listToday, { today: TODAY })).toHaveLength(1)
  })
})

describe('intent is not evidence (PLAN.md §3b.1)', () => {
  test('completing a workout task writes task_done and no workout', async () => {
    const t = as(ME)
    const id = await t.mutation(api.tasks.create, {
      title: 'Gym — push day',
      area: 'body',
    })

    await t.mutation(api.tasks.complete, { taskId: id })

    const logs = await t.query(api.logs.listSince, { since: 0 })
    expect(logs).toHaveLength(1)
    expect(logs[0].kind).toBe('task_done')
    expect(logs.some((l) => l.kind === 'workout')).toBe(false)
  })

  test('capture refuses to write a task_done row', async () => {
    const t = as(ME)
    await expect(
      t.mutation(api.logs.create, {
        kind: 'task_done',
        area: 'business',
        occurredAt: Date.now(),
      }),
    ).rejects.toThrow('tasks.complete')
  })

  test('completing twice does not log twice', async () => {
    const t = as(ME)
    const id = await t.mutation(api.tasks.create, { title: 'once' })
    await t.mutation(api.tasks.complete, { taskId: id })
    await t.mutation(api.tasks.complete, { taskId: id })
    expect(await t.query(api.logs.listSince, { since: 0 })).toHaveLength(1)
  })
})

describe('every row is scoped to its owner (PLAN.md §3b.4)', () => {
  test('another signed-in user sees none of my tasks', async () => {
    const { mine, theirs } = twoOwners()
    await mine.mutation(api.tasks.create, { title: 'my task' })

    expect(await theirs.query(api.tasks.listBacklog, {})).toHaveLength(0)
    expect(await mine.query(api.tasks.listBacklog, {})).toHaveLength(1)
  })

  test('another user cannot complete my task', async () => {
    const { mine, theirs } = twoOwners()
    const id = await mine.mutation(api.tasks.create, { title: 'my task' })

    await expect(
      theirs.mutation(api.tasks.complete, { taskId: id }),
    ).rejects.toThrow('No such task')
    /* Still open, and no task_done written in my name. */
    expect(await mine.query(api.tasks.listBacklog, {})).toHaveLength(1)
    expect(await mine.query(api.logs.listSince, { since: 0 })).toHaveLength(0)
  })

  test('an anonymous caller gets nothing', async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.tasks.listBacklog, {})).rejects.toThrow(
      'Not signed in',
    )
  })
})

describe('a mistake is not permanent', () => {
  test('a removed task leaves the day, and its earlier evidence alone', async () => {
    const t = as(ME)
    const id = await t.mutation(api.tasks.create, { title: 'typo' })
    await t.mutation(api.tasks.complete, { taskId: id })
    await t.mutation(api.tasks.remove, { taskId: id })

    expect(await t.query(api.tasks.listBacklog, {})).toHaveLength(0)
    /* The task_done log stays: deleting the task does not un-happen the day. */
    expect(await t.query(api.logs.listSince, { since: 0 })).toHaveLength(1)
  })

  test('removing a weight log removes the state it set', async () => {
    const t = as(ME)
    const logId = await t.mutation(api.logs.create, {
      kind: 'weight',
      area: 'body',
      occurredAt: 1_700_000_000_000,
      value: 99.9,
    })
    await t.mutation(api.logs.remove, { logId })

    const state = await t.run(async (ctx) =>
      ctx.db.query('stateSnapshots').collect(),
    )
    /* Latest row wins, so a leftover snapshot would show a weight the evidence
       no longer supports. */
    expect(state).toHaveLength(0)
  })

  test('another user cannot remove my log', async () => {
    const { mine, theirs } = twoOwners()
    const logId = await mine.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: Date.now(),
      text: 'mine',
    })

    await expect(theirs.mutation(api.logs.remove, { logId })).rejects.toThrow(
      'No such log',
    )
    expect(await mine.query(api.logs.listSince, { since: 0 })).toHaveLength(1)
  })
})

describe('a weight is both an event and a state (PLAN.md §2)', () => {
  test('logging a weight also writes a stateSnapshot', async () => {
    const t = as(ME)
    await t.mutation(api.logs.create, {
      kind: 'weight',
      area: 'body',
      occurredAt: Date.now(),
      value: 75.4,
      unit: 'kg',
    })

    const state = await t.run(async (ctx) =>
      ctx.db.query('stateSnapshots').collect(),
    )
    expect(state).toHaveLength(1)
    expect(state[0]).toMatchObject({ key: 'weight', value: 75.4, unit: 'kg' })
  })
})

describe('what the week view reads (PLAN.md §4 phase 5)', () => {
  const MONDAY = new Date(2026, 8, 7, 9).getTime()
  const WEEK = 7 * 24 * 60 * 60 * 1000

  test('a task scheduled inside the week is there', async () => {
    const t = as(ME)
    const taskId = await t.mutation(api.tasks.create, { title: 'Deep work' })
    await t.mutation(api.tasks.setSchedule, {
      taskId,
      scheduledAt: MONDAY,
      durationMin: 90,
    })
    const found = await t.query(api.tasks.listScheduledInRange, {
      from: MONDAY - 9 * 60 * 60 * 1000,
      to: MONDAY + WEEK,
    })
    expect(found.map((x) => x.title)).toEqual(['Deep work'])
  })

  /* §3c.3: an undated task is a quest, and quests are not on this screen. */
  test('an undated task is absent, not filtered out later', async () => {
    const t = as(ME)
    await t.mutation(api.tasks.create, { title: 'Someday' })
    const found = await t.query(api.tasks.listScheduledInRange, {
      from: MONDAY - 9 * 60 * 60 * 1000,
      to: MONDAY + WEEK,
    })
    expect(found).toEqual([])
  })

  test('a task scheduled in another week is absent', async () => {
    const t = as(ME)
    const taskId = await t.mutation(api.tasks.create, { title: 'Later' })
    await t.mutation(api.tasks.setSchedule, {
      taskId,
      scheduledAt: MONDAY + 3 * WEEK,
    })
    const found = await t.query(api.tasks.listScheduledInRange, {
      from: MONDAY,
      to: MONDAY + WEEK,
    })
    expect(found).toEqual([])
  })

  test('never another owner’s task', async () => {
    const { mine, theirs } = twoOwners()
    const taskId = await theirs.mutation(api.tasks.create, { title: 'Theirs' })
    await theirs.mutation(api.tasks.setSchedule, {
      taskId,
      scheduledAt: MONDAY,
    })
    const window = { from: MONDAY, to: MONDAY + WEEK }

    expect(await mine.query(api.tasks.listScheduledInRange, window)).toEqual([])
    expect(
      await theirs.query(api.tasks.listScheduledInRange, window),
    ).toHaveLength(1)
  })
})

describe('a task bound to a goal without a project', () => {
  test('setGoal binds the goal and cuts the project loose', async () => {
    const t = as(ME)
    const business = await t.mutation(api.goals.create, {
      title: 'A business',
      area: 'business',
    })
    const muscle = await t.mutation(api.goals.create, {
      title: 'Gain 5 kg of muscle',
      area: 'body',
    })
    const oreum = await t.mutation(api.projects.create, {
      goalId: business,
      title: 'Oreum',
    })
    const taskId = await t.mutation(api.tasks.create, { title: 'Buy protein' })
    await t.mutation(api.tasks.setProject, { taskId, projectId: oreum })

    await t.mutation(api.tasks.setGoal, { taskId, goalId: muscle })

    const bound = (await t.query(api.tasks.listBacklog, {})).find(
      (x) => x._id === taskId,
    )
    expect(bound?.goalId).toBe(muscle)
    expect(bound?.projectId).toBeUndefined()

    await t.mutation(api.tasks.setGoal, { taskId, goalId: null })
    const loose = (await t.query(api.tasks.listBacklog, {})).find(
      (x) => x._id === taskId,
    )
    expect(loose?.goalId).toBeUndefined()
  })

  test('refuses someone else’s goal', async () => {
    const { mine, theirs } = twoOwners()
    const theirGoal = await theirs.mutation(api.goals.create, {
      title: 'Theirs',
      area: 'life',
    })
    const taskId = await mine.mutation(api.tasks.create, { title: 'Mine' })

    await expect(
      mine.mutation(api.tasks.setGoal, { taskId, goalId: theirGoal }),
    ).rejects.toThrow('No such goal')
  })
})
