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
   and my id is real when they pass it — so a refusal comes from the
   ownership check, not from a row that was never in their database. */
function twoOwners() {
  const t = convexTest(schema, modules)
  return {
    mine: t.withIdentity({ tokenIdentifier: ME }),
    theirs: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

async function chain(t: ReturnType<typeof as>, title: string) {
  const goalId = await t.mutation(api.goals.create, {
    title: `goal for ${title}`,
    area: 'business',
  })
  return await t.mutation(api.projects.create, { goalId, title })
}

describe('one focus chain (PLAN.md §3c.2)', () => {
  test('promoting one demotes the other', async () => {
    const t = as(ME)
    const a = await chain(t, 'Oreum')
    const b = await chain(t, 'Solo Leveling')

    await t.mutation(api.projects.setFocus, { projectId: a })
    await t.mutation(api.projects.setFocus, { projectId: b })

    const live = await t.query(api.projects.listLive, {})
    const focused = live.filter((p) => p.status === 'focus')
    expect(focused).toHaveLength(1)
    expect(focused[0]._id).toBe(b)
    expect(live.find((p) => p._id === a)?.status).toBe('active')
  })

  test('focusing the already-focused chain is not a demotion to nothing', async () => {
    const t = as(ME)
    const a = await chain(t, 'Oreum')
    await t.mutation(api.projects.setFocus, { projectId: a })
    await t.mutation(api.projects.setFocus, { projectId: a })

    const live = await t.query(api.projects.listLive, {})
    expect(live.filter((p) => p.status === 'focus')).toHaveLength(1)
  })

  test('setStatus refuses to hand out focus behind setFocus’s back', async () => {
    const t = as(ME)
    const a = await chain(t, 'Oreum')
    await expect(
      t.mutation(api.projects.setStatus, { projectId: a, status: 'focus' }),
    ).rejects.toThrow('setFocus')
  })

  test('completing the focus chain leaves nothing in focus', async () => {
    const t = as(ME)
    const a = await chain(t, 'Oreum')
    await t.mutation(api.projects.setFocus, { projectId: a })
    await t.mutation(api.projects.setStatus, {
      projectId: a,
      status: 'completed',
    })

    const live = await t.query(api.projects.listLive, {})
    expect(live.filter((p) => p.status === 'focus')).toHaveLength(0)
    /* Completed is not live: the grid shows what is still going. */
    expect(live).toHaveLength(0)
  })
})

describe('a chain answers to a goal', () => {
  test('a task attached to a chain inherits its goal', async () => {
    const t = as(ME)
    const goalId = await t.mutation(api.goals.create, {
      title: 'Ship the business',
      area: 'business',
    })
    const projectId = await t.mutation(api.projects.create, {
      goalId,
      title: 'Oreum',
    })
    const taskId = await t.mutation(api.tasks.create, { title: 'Invoice' })

    await t.mutation(api.tasks.setProject, { taskId, projectId })

    const tasks = await t.query(api.tasks.listByProject, { projectId })
    expect(tasks).toHaveLength(1)
    expect(tasks[0].goalId).toBe(goalId)
  })

  test('cutting a task loose clears the goal with the project', async () => {
    const t = as(ME)
    const projectId = await chain(t, 'Oreum')
    const taskId = await t.mutation(api.tasks.create, { title: 'Invoice' })
    await t.mutation(api.tasks.setProject, { taskId, projectId })
    await t.mutation(api.tasks.setProject, { taskId, projectId: null })

    const tasks = await t.query(api.tasks.listByProject, { projectId })
    expect(tasks).toHaveLength(0)
  })

  test('a chain cannot be hung on another owner’s goal', async () => {
    const { mine, theirs } = twoOwners()
    const goalId = await mine.mutation(api.goals.create, {
      title: 'mine',
      area: 'business',
    })

    await expect(
      theirs.mutation(api.projects.create, { goalId, title: 'theirs' }),
    ).rejects.toThrow('No such goal')
    expect(await theirs.query(api.projects.listLive, {})).toEqual([])
  })

  test('a task cannot be attached to another owner’s chain', async () => {
    const { mine, theirs } = twoOwners()
    const projectId = await chain(mine, 'Oreum')

    const taskId = await theirs.mutation(api.tasks.create, { title: 'theirs' })
    await expect(
      theirs.mutation(api.tasks.setProject, { taskId, projectId }),
    ).rejects.toThrow('No such project')
    expect(await mine.query(api.tasks.listByProject, { projectId })).toEqual([])
  })
})

describe('a target is real or it is absent (PLAN.md §1)', () => {
  test('a value without a unit is refused', async () => {
    const t = as(ME)
    await expect(
      t.mutation(api.goals.create, {
        title: 'Get fit',
        area: 'body',
        targetValue: 80,
      }),
    ).rejects.toThrow('value and a unit')
  })

  test('a label alone is fine — not everything is measurable', async () => {
    const t = as(ME)
    const goalId = await t.mutation(api.goals.create, {
      title: 'Speak Portuguese',
      area: 'portuguese',
      targetLabel: 'B2',
    })
    const goals = await t.query(api.goals.listActive, {})
    expect(goals.find((g) => g._id === goalId)?.targetValue).toBeUndefined()
  })
})

describe('entityCounts is the only place a count comes from (PLAN.md §1)', () => {
  test('it counts done and total per chain, and hands them over separately', async () => {
    const t = as(ME)
    const projectId = await chain(t, 'Oreum')

    const ids = []
    for (const title of ['a', 'b', 'c']) {
      const id = await t.mutation(api.tasks.create, { title })
      await t.mutation(api.tasks.setProject, { taskId: id, projectId })
      ids.push(id)
    }
    await t.mutation(api.tasks.complete, { taskId: ids[0] })

    const counts = await t.query(api.aggregate.entityCounts, {})
    expect(counts.tasksByProject[projectId]).toEqual({
      done: 1,
      total: 3,
      open: 2,
    })
    /* No ratio, no percentage: the component renders "1 of 3" or nothing. */
    expect(counts.tasksByProject[projectId]).not.toHaveProperty('percent')
  })

  test('it never counts another owner’s rows', async () => {
    const { mine, theirs } = twoOwners()
    const projectId = await chain(mine, 'Oreum')
    const taskId = await mine.mutation(api.tasks.create, { title: 'a' })
    await mine.mutation(api.tasks.setProject, { taskId, projectId })

    const counts = await theirs.query(api.aggregate.entityCounts, {})
    expect(counts.tasksByProject).toEqual({})
    expect(counts.activeProjects).toBe(0)
    expect(
      (await mine.query(api.aggregate.entityCounts, {})).activeProjects,
    ).toBe(1)
  })
})

describe('a chain is removable, and takes nothing down with it', () => {
  test('deleting a chain cuts its tasks loose rather than deleting them', async () => {
    const t = as(ME)
    const projectId = await chain(t, 'Oreum')
    const taskId = await t.mutation(api.tasks.create, { title: 'Invoice' })
    await t.mutation(api.tasks.setProject, { taskId, projectId })

    await t.mutation(api.projects.remove, { projectId })

    /* The task survives — it may still be worth doing — and no longer points
       at a document that would make listByProject throw. */
    const loose = await t.query(api.tasks.listBacklog, {})
    expect(loose).toHaveLength(1)
    expect(loose[0].projectId).toBeUndefined()
    expect(loose[0].goalId).toBeUndefined()
  })

  test('a goal refuses to go while chains still hang off it', async () => {
    const t = as(ME)
    const goalId = await t.mutation(api.goals.create, {
      title: 'Ship it',
      area: 'business',
    })
    await t.mutation(api.projects.create, { goalId, title: 'Oreum' })

    await expect(t.mutation(api.goals.remove, { goalId })).rejects.toThrow(
      'Oreum',
    )
  })

  test('once the chains are gone the goal can be', async () => {
    const t = as(ME)
    const goalId = await t.mutation(api.goals.create, {
      title: 'Ship it',
      area: 'business',
    })
    const projectId = await t.mutation(api.projects.create, {
      goalId,
      title: 'Oreum',
    })

    await t.mutation(api.projects.remove, { projectId })
    await t.mutation(api.goals.remove, { goalId })

    expect(await t.query(api.goals.listActive, {})).toHaveLength(0)
  })

  test('another owner cannot remove my chain', async () => {
    const { mine, theirs } = twoOwners()
    const projectId = await chain(mine, 'Oreum')

    await expect(
      theirs.mutation(api.projects.remove, { projectId }),
    ).rejects.toThrow('No such project')
    expect(await mine.query(api.projects.get, { projectId })).not.toBeNull()
  })
})

/* A chain's page is reached by URL, and a URL can be anything: pasted wrong,
   left over from a deleted chain, cut short. None of those is a crash — the
   page says "No such chain" — so the reads it makes answer null and empty
   rather than throwing an argument error the page cannot catch. */
describe('a chain page read by a bad link', () => {
  test('an id that is not a chain id reads as no chain', async () => {
    const t = as(ME)
    expect(
      await t.query(api.projects.get, { projectId: 'not-an-id' }),
    ).toBeNull()
    expect(
      await t.query(api.tasks.listByProject, { projectId: 'not-an-id' }),
    ).toEqual([])
  })

  test('a deleted chain, or someone else’s, reads as no chain', async () => {
    const db = convexTest(schema, modules)
    const mine = db.withIdentity({ tokenIdentifier: ME })
    const theirs = db.withIdentity({ tokenIdentifier: SOMEONE_ELSE })
    const projectId = await chain(mine, 'Oreum')

    expect(await theirs.query(api.tasks.listByProject, { projectId })).toEqual(
      [],
    )

    await mine.mutation(api.projects.remove, { projectId })
    expect(await mine.query(api.projects.get, { projectId })).toBeNull()
    expect(await mine.query(api.tasks.listByProject, { projectId })).toEqual([])
  })
})
