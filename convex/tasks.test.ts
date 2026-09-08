/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'
const TODAY = '2026-09-08'

function as(subject: string) {
  return convexTest(schema, modules).withIdentity({ tokenIdentifier: subject })
}

/* These three are the rules the product is built on. None of them is visible in
   a screenshot, and each fails silently if it regresses — which is the whole
   reason they are the first tests in this codebase. */

describe('three quests a day (PLAN.md §3c.1)', () => {
  test('the fourth pick is refused', async () => {
    const t = as(ME)

    const ids = []
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

  test('finishing one frees the slot', async () => {
    const t = as(ME)
    const ids = []
    for (const title of ['one', 'two', 'three', 'four']) {
      ids.push(await t.mutation(api.tasks.create, { title }))
    }
    for (const id of ids.slice(0, 3)) {
      await t.mutation(api.tasks.pickForToday, { taskId: id, today: TODAY })
    }

    await t.mutation(api.tasks.complete, { taskId: ids[0] })

    await t.mutation(api.tasks.pickForToday, { taskId: ids[3], today: TODAY })
    expect(await t.query(api.tasks.listToday, { today: TODAY })).toHaveLength(3)
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
    const mine = as(ME)
    await mine.mutation(api.tasks.create, { title: 'my task' })

    const theirs = as(SOMEONE_ELSE)
    expect(await theirs.query(api.tasks.listBacklog, {})).toHaveLength(0)
  })

  test('another user cannot complete my task', async () => {
    const mine = as(ME)
    const id = await mine.mutation(api.tasks.create, { title: 'my task' })

    const theirs = as(SOMEONE_ELSE)
    await expect(
      theirs.mutation(api.tasks.complete, { taskId: id }),
    ).rejects.toThrow('No such task')
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
    const mine = as(ME)
    const logId = await mine.mutation(api.logs.create, {
      kind: 'note',
      area: 'life',
      occurredAt: Date.now(),
      text: 'mine',
    })

    const theirs = as(SOMEONE_ELSE)
    await expect(theirs.mutation(api.logs.remove, { logId })).rejects.toThrow(
      'No such log',
    )
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
