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

  /* The field has existed since the schema was written and was never shown.
     R3b puts a textarea on it — a pasted prompt, a longer note. */
  test('update writes and clears the description', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'business',
    })
    await me.mutation(api.goals.update, {
      goalId,
      description: '  Three paragraphs of context.  ',
    })
    expect((await me.query(api.goals.get, { goalId }))?.description).toBe(
      'Three paragraphs of context.',
    )

    await me.mutation(api.goals.update, { goalId, description: null })
    expect(
      (await me.query(api.goals.get, { goalId }))?.description,
    ).toBeUndefined()
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

describe('a closed goal is kept, dated, and can come back (24 Sep)', () => {
  test('reaching stamps closedAt; reopening clears it', async () => {
    const { t, mine } = twoOwners()
    const goalId = await mine.mutation(api.goals.create, {
      title: 'Run 10k',
      area: 'body',
    })
    await mine.mutation(api.goals.setStatus, { goalId, status: 'done' })
    let goal = await t.run((ctx) => ctx.db.get(goalId))
    expect(goal?.closedAt).toBeTypeOf('number')

    await mine.mutation(api.goals.setStatus, { goalId, status: 'active' })
    goal = await t.run((ctx) => ctx.db.get(goalId))
    expect(goal?.status).toBe('active')
    expect(goal?.closedAt).toBeUndefined()
  })

  test('listClosed splits reached from dropped, newest first, without monthly targets', async () => {
    const { mine } = twoOwners()
    const a = await mine.mutation(api.goals.create, {
      title: 'A',
      area: 'body',
    })
    const b = await mine.mutation(api.goals.create, {
      title: 'B',
      area: 'body',
    })
    const c = await mine.mutation(api.goals.create, {
      title: 'C',
      area: 'body',
    })
    await mine.mutation(api.goals.create, {
      title: 'Still going',
      area: 'body',
    })
    await mine.mutation(api.goals.setStatus, { goalId: a, status: 'done' })
    await new Promise((r) => setTimeout(r, 5))
    await mine.mutation(api.goals.setStatus, { goalId: b, status: 'done' })
    await mine.mutation(api.goals.setStatus, { goalId: c, status: 'dropped' })
    await mine.mutation(api.goals.setTileTarget, {
      tile: 'body',
      targetValue: 12,
    })
    await mine.mutation(api.goals.clearTileTarget, { tile: 'body' })

    const shelf = await mine.query(api.goals.listClosed, {})
    expect(shelf.reached.map((g) => g.title)).toEqual(['B', 'A'])
    expect(shelf.dropped.map((g) => g.title)).toEqual(['C'])
  })

  test("another owner's closed goals are not on my shelf", async () => {
    const { mine, theirs } = twoOwners()
    const goalId = await theirs.mutation(api.goals.create, {
      title: 'Theirs',
      area: 'body',
    })
    await theirs.mutation(api.goals.setStatus, { goalId, status: 'done' })
    const shelf = await mine.query(api.goals.listClosed, {})
    expect(shelf.reached).toHaveLength(0)
    await expect(
      mine.mutation(api.goals.setStatus, { goalId, status: 'active' }),
    ).rejects.toThrow(/No such goal/)
  })
})

describe('goals — a weekly target per Body kind', () => {
  test('set, change on the same goal, read back, clear', async () => {
    const t = as(ME)
    const id = await t.mutation(api.goals.setWeeklyTarget, {
      category: 'gym',
      targetValue: 3,
    })
    const again = await t.mutation(api.goals.setWeeklyTarget, {
      category: 'gym',
      targetValue: 4,
    })
    expect(again).toBe(id)
    await t.mutation(api.goals.setWeeklyTarget, {
      category: 'stretch',
      targetValue: 7,
    })
    const targets = await t.query(api.goals.weeklyTargets, {})
    expect(targets.map((r) => [r.category, r.targetValue]).sort()).toEqual([
      ['gym', 4],
      ['stretch', 7],
    ])
    /* A real goal, so the Goals page shows it too. */
    const goal = (await t.query(api.goals.listActive, {})).find(
      (g) => g._id === id,
    )
    expect(goal).toMatchObject({ area: 'body', unit: 'sessions' })

    await t.mutation(api.goals.clearWeeklyTarget, { category: 'gym' })
    expect(
      (await t.query(api.goals.weeklyTargets, {})).map((r) => r.category),
    ).toEqual(['stretch'])
  })

  test('refused: a number out of range, a kind Body does not count', async () => {
    const t = as(ME)
    for (const targetValue of [0, 15, 2.5]) {
      await expect(
        t.mutation(api.goals.setWeeklyTarget, { category: 'gym', targetValue }),
      ).rejects.toThrow('A weekly target is a whole number from 1 to 14.')
    }
    await expect(
      t.mutation(api.goals.setWeeklyTarget, {
        category: 'poker',
        targetValue: 2,
      }),
    ).rejects.toThrow('No such Body kind')
  })

  test("another owner's target is not mine to read or clear", async () => {
    const { mine, theirs } = twoOwners()
    await mine.mutation(api.goals.setWeeklyTarget, {
      category: 'gym',
      targetValue: 3,
    })
    expect(await theirs.query(api.goals.weeklyTargets, {})).toEqual([])
    await theirs.mutation(api.goals.clearWeeklyTarget, { category: 'gym' })
    expect(await mine.query(api.goals.weeklyTargets, {})).toHaveLength(1)
  })
})

describe('goals — a weekly target per language kind', () => {
  test('a language keeps its own targets, apart from Body and each other', async () => {
    const t = as(ME)
    const pt = await t.mutation(api.areas.addLanguage, { lang: 'pt-PT' })
    const en = await t.mutation(api.areas.addLanguage, { lang: 'en' })
    const id = await t.mutation(api.goals.setWeeklyTarget, {
      area: pt,
      category: 'class',
      targetValue: 2,
    })
    await t.mutation(api.goals.setWeeklyTarget, {
      area: en,
      category: 'class',
      targetValue: 1,
    })
    await t.mutation(api.goals.setWeeklyTarget, {
      category: 'gym',
      targetValue: 3,
    })
    /* Setting it again is the same goal, not a second one. */
    expect(
      await t.mutation(api.goals.setWeeklyTarget, {
        area: pt,
        category: 'class',
        targetValue: 3,
      }),
    ).toBe(id)

    const targets = await t.query(api.goals.weeklyTargets, {})
    expect(
      targets.map((r) => [r.area, r.category, r.targetValue]).sort(),
    ).toEqual([
      ['body', 'gym', 3],
      [en, 'class', 1],
      [pt, 'class', 3],
    ])
    const goal = (await t.query(api.goals.listActive, {})).find(
      (g) => g._id === id,
    )
    expect(goal).toMatchObject({ area: pt, unit: 'classes' })
    expect(goal?.title).toMatch(/classes each week$/)

    /* Clearing Portuguese leaves English's class target alone. */
    await t.mutation(api.goals.clearWeeklyTarget, {
      area: pt,
      category: 'class',
    })
    expect(
      (await t.query(api.goals.weeklyTargets, {})).map((r) => r.area).sort(),
    ).toEqual(['body', en])
  })

  test('refused: a kind a language does not file, an area that is not a language', async () => {
    const t = as(ME)
    const pt = await t.mutation(api.areas.addLanguage, { lang: 'pt-PT' })
    await expect(
      t.mutation(api.goals.setWeeklyTarget, {
        area: pt,
        category: 'gym',
        targetValue: 2,
      }),
    ).rejects.toThrow('No such language kind')
    await expect(
      t.mutation(api.goals.setWeeklyTarget, {
        area: 'work',
        category: 'class',
        targetValue: 2,
      }),
    ).rejects.toThrow('Not a language area')
  })

  test("another owner's language is not mine to set a target on", async () => {
    const { mine, theirs } = twoOwners()
    const pt = await mine.mutation(api.areas.addLanguage, { lang: 'pt-PT' })
    await expect(
      theirs.mutation(api.goals.setWeeklyTarget, {
        area: pt,
        category: 'class',
        targetValue: 2,
      }),
    ).rejects.toThrow('Not a language area')
    await mine.mutation(api.goals.setWeeklyTarget, {
      area: pt,
      category: 'class',
      targetValue: 2,
    })
    await theirs.mutation(api.goals.clearWeeklyTarget, {
      area: pt,
      category: 'class',
    })
    expect(await mine.query(api.goals.weeklyTargets, {})).toHaveLength(1)
  })
})
