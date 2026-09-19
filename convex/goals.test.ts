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

/* Two people in one database: my row is really there when they look for it. */
function twoOwners() {
  const t = convexTest(schema, modules)
  return {
    t,
    mine: t.withIdentity({ tokenIdentifier: ME }),
    theirs: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

describe('a monthly target is a goal bound to its tile (PLAN.md §3 item 4)', () => {
  test('setting one writes a goal the Goals page can read', async () => {
    const t = as(ME)
    await t.mutation(api.goals.setTileTarget, { tile: 'body', targetValue: 9 })

    const goals = await t.query(api.goals.listActive, {})
    expect(goals).toHaveLength(1)
    expect(goals[0]).toMatchObject({
      tile: 'body',
      area: 'body',
      targetValue: 9,
      unit: 'workouts',
      status: 'active',
    })
  })

  test('setting it again changes the number, not the number of goals', async () => {
    const t = as(ME)
    const first = await t.mutation(api.goals.setTileTarget, {
      tile: 'body',
      targetValue: 9,
    })
    const second = await t.mutation(api.goals.setTileTarget, {
      tile: 'body',
      targetValue: 12,
    })

    expect(second).toBe(first)
    const goals = await t.query(api.goals.listActive, {})
    expect(goals).toHaveLength(1)
    expect(goals[0].targetValue).toBe(12)
  })

  test('each tile has its own', async () => {
    const t = as(ME)
    await t.mutation(api.goals.setTileTarget, { tile: 'body', targetValue: 9 })
    await t.mutation(api.goals.setTileTarget, {
      tile: 'social',
      targetValue: 2,
    })

    const goals = await t.query(api.goals.listActive, {})
    expect(goals.map((g) => g.tile).sort()).toEqual(['body', 'social'])
  })

  test('clearing drops the goal rather than deleting it', async () => {
    const { t, mine } = twoOwners()
    await mine.mutation(api.goals.setTileTarget, {
      tile: 'body',
      targetValue: 9,
    })
    await mine.mutation(api.goals.clearTileTarget, { tile: 'body' })

    expect(await mine.query(api.goals.listActive, {})).toHaveLength(0)
    /* A target you had in March is part of March. */
    const rows = await t.run((ctx) => ctx.db.query('goals').collect())
    expect(rows.map((g) => g.status)).toEqual(['dropped'])
  })

  test('a target is a whole number above zero', async () => {
    const t = as(ME)
    for (const targetValue of [0, -3, 2.5]) {
      await expect(
        t.mutation(api.goals.setTileTarget, { tile: 'body', targetValue }),
      ).rejects.toThrow('whole number above zero')
    }
    expect(await t.query(api.goals.listActive, {})).toHaveLength(0)
  })

  test('another owner’s target is theirs', async () => {
    const { mine, theirs } = twoOwners()
    await theirs.mutation(api.goals.setTileTarget, {
      tile: 'body',
      targetValue: 9,
    })
    await mine.mutation(api.goals.setTileTarget, {
      tile: 'body',
      targetValue: 4,
    })
    await mine.mutation(api.goals.clearTileTarget, { tile: 'body' })

    const theirGoals = await theirs.query(api.goals.listActive, {})
    expect(theirGoals).toHaveLength(1)
    expect(theirGoals[0].targetValue).toBe(9)
    expect(await mine.query(api.goals.listActive, {})).toHaveLength(0)
  })
})

describe('a goal stands on its own, and can be edited', () => {
  test('get reads one goal by a URL-shaped id; foreign and bad ids are null', async () => {
    const { mine, theirs } = twoOwners()
    const goalId = await mine.mutation(api.goals.create, {
      title: 'No fap for a month',
      area: 'life',
    })

    expect((await mine.query(api.goals.get, { goalId }))?.title).toBe(
      'No fap for a month',
    )
    expect(await theirs.query(api.goals.get, { goalId })).toBeNull()
    expect(await mine.query(api.goals.get, { goalId: 'nope' })).toBeNull()
  })

  test('update sets and clears the deadline and the target label', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'Gain muscle',
      area: 'body',
    })

    await me.mutation(api.goals.update, {
      goalId,
      deadline: '2027-03-01',
      targetLabel: '+5 kg',
      title: 'Gain 5 kg of muscle',
    })
    let goal = await me.query(api.goals.get, { goalId })
    expect([goal?.title, goal?.deadline, goal?.targetLabel]).toEqual([
      'Gain 5 kg of muscle',
      '2027-03-01',
      '+5 kg',
    ])

    await me.mutation(api.goals.update, {
      goalId,
      deadline: null,
      targetLabel: null,
    })
    goal = await me.query(api.goals.get, { goalId })
    expect(goal?.deadline).toBeUndefined()
    expect(goal?.targetLabel).toBeUndefined()
  })

  /* Leaving a field out keeps it: the Goals page edits one line at a time. */
  test('update refiles without touching what it was not given', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'Ship Oreum',
      area: 'career',
      description: 'the one that pays',
    })
    await me.mutation(api.goals.update, { goalId, area: 'business' })
    const goal = await me.query(api.goals.get, { goalId })
    expect([goal?.area, goal?.title, goal?.description]).toEqual([
      'business',
      'Ship Oreum',
      'the one that pays',
    ])
  })

  test('update refuses an empty title and another owner', async () => {
    const { mine, theirs } = twoOwners()
    const goalId = await mine.mutation(api.goals.create, {
      title: 'G',
      area: 'life',
    })
    await expect(
      mine.mutation(api.goals.update, { goalId, title: '  ' }),
    ).rejects.toThrow('A goal needs a title')
    await expect(
      theirs.mutation(api.goals.update, { goalId, title: 'x' }),
    ).rejects.toThrow('No such goal')
  })
})
