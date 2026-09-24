/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test, vi } from 'vitest'

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
    expect(await t.query(api.tasks.listBacklog, { today: TODAY })).toHaveLength(
      1,
    )
  })

  test('dropping one frees the slot without completing it', async () => {
    const t = as(ME)
    const a = await t.mutation(api.tasks.create, { title: 'a' })
    await t.mutation(api.tasks.pickForToday, { taskId: a, today: TODAY })
    await t.mutation(api.tasks.dropFromToday, { taskId: a })

    expect(await t.query(api.tasks.listToday, { today: TODAY })).toHaveLength(0)
    expect(await t.query(api.tasks.listBacklog, { today: TODAY })).toHaveLength(
      1,
    )
  })

  test('the three come in the order they were picked, not made', async () => {
    const t = as(ME)
    const old = await t.mutation(api.tasks.create, { title: 'old' })
    const fresh = await t.mutation(api.tasks.create, { title: 'fresh' })
    /* Two picks in one millisecond would tie; a person takes longer. */
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date(2026, 8, 8, 9, 0, 0))
      await t.mutation(api.tasks.pickForToday, { taskId: fresh, today: TODAY })
      vi.setSystemTime(new Date(2026, 8, 8, 9, 0, 5))
      await t.mutation(api.tasks.pickForToday, { taskId: old, today: TODAY })
    } finally {
      vi.useRealTimers()
    }

    const today = await t.query(api.tasks.listToday, { today: TODAY })
    expect(today.map((x) => x.title)).toEqual(['fresh', 'old'])
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

    expect(
      await theirs.query(api.tasks.listBacklog, { today: TODAY }),
    ).toHaveLength(0)
    expect(
      await mine.query(api.tasks.listBacklog, { today: TODAY }),
    ).toHaveLength(1)
  })

  test('reopening takes the tick back, and the task_done log with it', async () => {
    const t = as(ME)
    const id = await t.mutation(api.tasks.create, { title: 'a', area: 'body' })
    await t.mutation(api.tasks.pickForToday, { taskId: id, today: TODAY })
    await t.mutation(api.tasks.complete, { taskId: id })
    /* A workout logged from the follow-up is a separate act and stays. */
    await t.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: Date.now(),
      taskId: id,
    })

    await t.mutation(api.tasks.reopen, { taskId: id })

    const today = await t.query(api.tasks.listToday, { today: TODAY })
    expect(today).toHaveLength(1)
    expect(today[0].status).toBe('open')
    expect(today[0].completedAt).toBeUndefined()
    const logs = await t.query(api.logs.recent, {})
    expect(logs.map((l) => l.kind)).toEqual(['workout'])
  })

  test('another user cannot complete my task', async () => {
    const { mine, theirs } = twoOwners()
    const id = await mine.mutation(api.tasks.create, { title: 'my task' })

    await expect(
      theirs.mutation(api.tasks.complete, { taskId: id }),
    ).rejects.toThrow('No such task')
    /* Still open, and no task_done written in my name. */
    expect(
      await mine.query(api.tasks.listBacklog, { today: TODAY }),
    ).toHaveLength(1)
    expect(await mine.query(api.logs.listSince, { since: 0 })).toHaveLength(0)
  })

  test('an anonymous caller gets nothing', async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.query(api.tasks.listBacklog, { today: TODAY }),
    ).rejects.toThrow('Not signed in')
  })
})

describe('a mistake is not permanent', () => {
  test('a removed task leaves the day, and its earlier evidence alone', async () => {
    const t = as(ME)
    const id = await t.mutation(api.tasks.create, { title: 'typo' })
    await t.mutation(api.tasks.complete, { taskId: id })
    await t.mutation(api.tasks.remove, { taskId: id })

    expect(await t.query(api.tasks.listBacklog, { today: TODAY })).toHaveLength(
      0,
    )
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
    const muscle = await t.mutation(api.goals.create, {
      title: 'Gain 5 kg of muscle',
      area: 'body',
    })
    const oreum = await t.mutation(api.projects.create, { title: 'Oreum' })
    const taskId = await t.mutation(api.tasks.create, { title: 'Buy protein' })
    await t.mutation(api.tasks.setProject, { taskId, projectId: oreum })

    await t.mutation(api.tasks.setGoal, { taskId, goalId: muscle })

    const bound = (await t.query(api.tasks.listBacklog, { today: TODAY })).find(
      (x) => x._id === taskId,
    )
    expect(bound?.goalId).toBe(muscle)
    expect(bound?.projectId).toBeUndefined()

    await t.mutation(api.tasks.setGoal, { taskId, goalId: null })
    const loose = (await t.query(api.tasks.listBacklog, { today: TODAY })).find(
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

describe('a day ends (17 Sep)', () => {
  const NEXT_DAY = '2026-09-09'

  test('an unticked one goes back to the backlog, a ticked one does not', async () => {
    const t = as(ME)
    const left = await t.mutation(api.tasks.create, { title: 'left' })
    const done = await t.mutation(api.tasks.create, { title: 'done' })
    for (const taskId of [left, done]) {
      await t.mutation(api.tasks.pickForToday, { taskId, today: TODAY })
    }
    await t.mutation(api.tasks.complete, { taskId: done })

    /* The same day: both are on today, neither is waiting. */
    expect(await t.query(api.tasks.listBacklog, { today: TODAY })).toHaveLength(
      0,
    )

    /* The next morning: today is empty, and the unfinished one is waiting,
       still saying which day it was chosen for. */
    expect(
      await t.query(api.tasks.listToday, { today: NEXT_DAY }),
    ).toHaveLength(0)
    const waiting = await t.query(api.tasks.listBacklog, { today: NEXT_DAY })
    expect(waiting.map((x) => x.title)).toEqual(['left'])
    expect(waiting[0].todayFor).toBe(TODAY)

    /* And it can be chosen again: yesterday's slot does not count today. */
    await t.mutation(api.tasks.pickForToday, { taskId: left, today: NEXT_DAY })
    expect(
      await t.query(api.tasks.listToday, { today: NEXT_DAY }),
    ).toHaveLength(1)
  })
})

describe('the Done tab (17 Sep)', () => {
  async function tick(t: ReturnType<typeof as>, title: string, at: number) {
    vi.setSystemTime(at)
    const taskId = await t.mutation(api.tasks.create, { title })
    await t.mutation(api.tasks.complete, { taskId })
    return taskId
  }

  test('newest done first, open ones never', async () => {
    const t = as(ME)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await tick(t, 'first', Date.UTC(2026, 8, 1))
      await tick(t, 'second', Date.UTC(2026, 8, 10))
      await t.mutation(api.tasks.create, { title: 'still open' })

      const done = await t.query(api.tasks.listDone, {})
      expect(done.map((x) => x.title)).toEqual(['second', 'first'])
    } finally {
      vi.useRealTimers()
    }
  })

  test('a period, an area and words each narrow it', async () => {
    const t = as(ME)
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const old = await tick(t, 'invoice march', Date.UTC(2026, 2, 3))
      const recent = await tick(t, 'invoice september', Date.UTC(2026, 8, 3))
      await t.mutation(api.tasks.setArea, { taskId: recent, area: 'business' })
      await tick(t, 'run', Date.UTC(2026, 8, 4))

      const since = Date.UTC(2026, 8, 1)
      expect(
        (await t.query(api.tasks.listDone, { since })).map((x) => x.title),
      ).toEqual(['run', 'invoice september'])
      expect(
        (await t.query(api.tasks.listDone, { area: 'business' })).map(
          (x) => x._id,
        ),
      ).toEqual([recent])
      expect(
        (await t.query(api.tasks.listDone, { search: 'invoice' }))
          .map((x) => x._id)
          .sort(),
      ).toEqual([old, recent].sort())
      expect(
        (await t.query(api.tasks.listDone, { search: 'invoice', since })).map(
          (x) => x._id,
        ),
      ).toEqual([recent])
    } finally {
      vi.useRealTimers()
    }
  })

  test('someone else sees none of mine', async () => {
    const { mine, theirs } = twoOwners()
    const taskId = await mine.mutation(api.tasks.create, { title: 'mine' })
    await mine.mutation(api.tasks.complete, { taskId })

    expect(await theirs.query(api.tasks.listDone, {})).toHaveLength(0)
    expect(
      await theirs.query(api.tasks.listDone, { search: 'mine' }),
    ).toHaveLength(0)
    expect(await mine.query(api.tasks.listDone, {})).toHaveLength(1)
  })
})

describe('a task is created only under your own project or goal', () => {
  test("someone else's project is refused, and nothing is written", async () => {
    const { mine, theirs } = twoOwners()
    const projectId = await mine.mutation(api.projects.create, {
      title: 'Oreum',
    })

    await expect(
      theirs.mutation(api.tasks.create, { title: 'sneak in', projectId }),
    ).rejects.toThrow('No such project')
    expect(
      await theirs.query(api.tasks.listBacklog, { today: TODAY }),
    ).toHaveLength(0)
    expect(
      await mine.query(api.tasks.listByProject, { projectId }),
    ).toHaveLength(0)
  })

  test("someone else's goal is refused", async () => {
    const { mine, theirs } = twoOwners()
    const goalId = await mine.mutation(api.goals.create, {
      title: 'Gain 5 kg',
      area: 'body',
    })

    await expect(
      theirs.mutation(api.tasks.create, { title: 'sneak in', goalId }),
    ).rejects.toThrow('No such goal')
    expect(
      await theirs.query(api.tasks.listBacklog, { today: TODAY }),
    ).toHaveLength(0)
  })

  /* A project brought its goal with it until 21 Sep. It brings its kind
     instead: a task made on a project is `projects`, and carries no goal
     unless one was asked for. */
  test('your own project brings its kind, not a goal', async () => {
    const { mine } = twoOwners()
    const projectId = await mine.mutation(api.projects.create, {
      title: 'Oreum',
    })

    await mine.mutation(api.tasks.create, { title: 'Invoice', projectId })

    const [task] = await mine.query(api.tasks.listBacklog, { today: TODAY })
    expect(task.projectId).toBe(projectId)
    expect(task.goalId).toBeUndefined()
    expect(task.area).toBe('projects')
  })
})

/* 24 Sep: the backlog's Select mode — done, archive and delete, several at
   once. */
describe('several tasks at once', () => {
  async function three(t: ReturnType<typeof as>) {
    return [
      await t.mutation(api.tasks.create, { title: 'One', area: 'body' }),
      await t.mutation(api.tasks.create, { title: 'Two' }),
      await t.mutation(api.tasks.create, { title: 'Three' }),
    ]
  }
  const titles = (xs: Array<{ title: string }>) => xs.map((x) => x.title).sort()

  test('done in bulk writes one task_done log per task, and only that', async () => {
    const t = as(ME)
    const [one, two] = await three(t)
    await t.mutation(api.tasks.completeMany, { taskIds: [one, two] })

    expect(
      titles(await t.query(api.tasks.listBacklog, { today: TODAY })),
    ).toEqual(['Three'])
    const logs = await t.run((ctx) => ctx.db.query('logs').collect())
    expect(logs.map((l) => l.kind)).toEqual(['task_done', 'task_done'])
    expect(logs.find((l) => l.text === 'One')?.area).toBe('body')
  })

  test('a task already done is not logged twice', async () => {
    const t = as(ME)
    const [one] = await three(t)
    await t.mutation(api.tasks.complete, { taskId: one })
    await t.mutation(api.tasks.completeMany, { taskIds: [one] })
    const logs = await t.run((ctx) => ctx.db.query('logs').collect())
    expect(logs).toHaveLength(1)
  })

  test('archive leaves the backlog and the calendar, frees today, and comes back', async () => {
    const t = as(ME)
    const [one] = await three(t)
    await t.mutation(api.tasks.setSchedule, {
      taskId: one,
      scheduledAt: new Date(2026, 8, 8, 9).getTime(),
      durationMin: 30,
    })
    await t.mutation(api.tasks.pickForToday, { taskId: one, today: TODAY })

    await t.mutation(api.tasks.setArchivedMany, {
      taskIds: [one],
      archived: true,
    })
    expect(
      titles(await t.query(api.tasks.listBacklog, { today: TODAY })),
    ).toEqual(['Three', 'Two'])
    expect(await t.query(api.tasks.listToday, { today: TODAY })).toHaveLength(0)
    expect(
      await t.query(api.tasks.listScheduledInRange, {
        from: new Date(2026, 8, 8).getTime(),
        to: new Date(2026, 8, 9).getTime(),
      }),
    ).toHaveLength(0)
    expect(titles(await t.query(api.tasks.listArchived, {}))).toEqual(['One'])

    await t.mutation(api.tasks.setArchivedMany, {
      taskIds: [one],
      archived: false,
    })
    expect(await t.query(api.tasks.listArchived, {})).toHaveLength(0)
    expect(await t.query(api.tasks.listBacklog, { today: TODAY })).toHaveLength(
      3,
    )
  })

  test('deletes several', async () => {
    const t = as(ME)
    const [one, two] = await three(t)
    await t.mutation(api.tasks.removeMany, { taskIds: [one, two] })
    expect(
      titles(await t.query(api.tasks.listBacklog, { today: TODAY })),
    ).toEqual(['Three'])
  })

  test("one task of someone else's refuses the whole batch", async () => {
    const { mine, theirs } = twoOwners()
    const my = await mine.mutation(api.tasks.create, { title: 'Mine' })
    const their = await theirs.mutation(api.tasks.create, { title: 'Theirs' })

    for (const call of [
      () => mine.mutation(api.tasks.completeMany, { taskIds: [my, their] }),
      () => mine.mutation(api.tasks.removeMany, { taskIds: [my, their] }),
      () =>
        mine.mutation(api.tasks.setArchivedMany, {
          taskIds: [my, their],
          archived: true,
        }),
    ]) {
      await expect(call()).rejects.toThrow()
    }
    expect(
      await mine.query(api.tasks.listBacklog, { today: TODAY }),
    ).toHaveLength(1)
    const logs = await mine.run((ctx) => ctx.db.query('logs').collect())
    expect(logs).toHaveLength(0)
  })

  test('a task can be created with its time', async () => {
    const t = as(ME)
    const at = new Date(2026, 8, 8, 18).getTime()
    await t.mutation(api.tasks.create, {
      title: 'Gym',
      scheduledAt: at,
      durationMin: 60,
    })
    const [row] = await t.query(api.tasks.listScheduledInRange, {
      from: new Date(2026, 8, 8).getTime(),
      to: new Date(2026, 8, 9).getTime(),
    })
    expect(row.scheduledAt).toBe(at)
    expect(row.durationMin).toBe(60)
  })
})

describe("a goal's own tasks (24 Sep)", () => {
  test('open, not archived, mine, and says when there are more', async () => {
    const { mine, theirs } = twoOwners()
    const goalId = await mine.mutation(api.goals.create, {
      title: 'Ship it',
      area: 'career',
    })
    const ids = []
    for (const title of ['a', 'b', 'c', 'd']) {
      ids.push(await mine.mutation(api.tasks.create, { title, goalId }))
    }
    await mine.mutation(api.tasks.complete, { taskId: ids[0] })
    await mine.mutation(api.tasks.setArchivedMany, {
      taskIds: [ids[1]],
      archived: true,
    })

    const two = await mine.query(api.tasks.listByGoal, { goalId, limit: 2 })
    expect(two.tasks.map((t) => t.title).sort()).toEqual(['c', 'd'])
    expect(two.more).toBe(false)

    const one = await mine.query(api.tasks.listByGoal, { goalId, limit: 1 })
    expect(one.tasks).toHaveLength(1)
    expect(one.more).toBe(true)

    const peek = await theirs.query(api.tasks.listByGoal, { goalId, limit: 5 })
    expect(peek.tasks).toHaveLength(0)
  })
})
