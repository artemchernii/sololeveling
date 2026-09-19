/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

function as(subject: string) {
  return convexTest(schema, modules).withIdentity({ tokenIdentifier: subject })
}

/* Two people in one database — see goals.test.ts: two convexTest() backends
   would be two databases, and every ownership test would pass for free. */
function twoOwners() {
  const t = convexTest(schema, modules)
  return {
    t,
    mine: t.withIdentity({ tokenIdentifier: ME }),
    theirs: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

describe('milestones belong to a goal', () => {
  test('are listed in the order they were added', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'Gain 5 kg of muscle',
      area: 'body',
    })
    await me.mutation(api.milestones.create, { goalId, title: '+1 kg' })
    await me.mutation(api.milestones.create, {
      goalId,
      title: '+3 kg',
      dueDate: '2026-11-01',
    })
    await me.mutation(api.milestones.create, { goalId, title: '+5 kg' })

    const list = await me.query(api.milestones.listByGoal, { goalId })
    expect(list.map((m) => m.title)).toEqual(['+1 kg', '+3 kg', '+5 kg'])
    expect(list[1].dueDate).toBe('2026-11-01')
  })

  test('reaching one stamps a time; un-reaching clears it; the goal stays active', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'body',
    })
    const m = await me.mutation(api.milestones.create, {
      goalId,
      title: 'Only one',
    })

    await me.mutation(api.milestones.setReached, {
      milestoneId: m,
      reached: true,
    })
    let [row] = await me.query(api.milestones.listByGoal, { goalId })
    expect(typeof row.reachedAt).toBe('number')
    /* Reaching the last milestone is not reaching the goal — that is its own act. */
    expect((await me.query(api.goals.get, { goalId }))?.status).toBe('active')

    await me.mutation(api.milestones.setReached, {
      milestoneId: m,
      reached: false,
    })
    ;[row] = await me.query(api.milestones.listByGoal, { goalId })
    expect(row.reachedAt).toBeUndefined()
  })

  test('move swaps with the neighbour, and does nothing at either end', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'life',
    })
    const a = await me.mutation(api.milestones.create, { goalId, title: 'a' })
    const b = await me.mutation(api.milestones.create, { goalId, title: 'b' })
    await me.mutation(api.milestones.create, { goalId, title: 'c' })

    await me.mutation(api.milestones.move, {
      milestoneId: b,
      direction: 'earlier',
    })
    /* Already first: the second call is the no-op at the end of the list. */
    await me.mutation(api.milestones.move, {
      milestoneId: b,
      direction: 'earlier',
    })
    await me.mutation(api.milestones.move, {
      milestoneId: a,
      direction: 'later',
    })

    const list = await me.query(api.milestones.listByGoal, { goalId })
    expect(list.map((m) => m.title)).toEqual(['b', 'c', 'a'])
  })

  test('update renames and re-dates; null clears the date', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'life',
    })
    const m = await me.mutation(api.milestones.create, {
      goalId,
      title: 'x',
      dueDate: '2026-10-01',
    })
    await me.mutation(api.milestones.update, {
      milestoneId: m,
      title: 'Two weeks clean',
    })
    await me.mutation(api.milestones.update, { milestoneId: m, dueDate: null })
    const [row] = await me.query(api.milestones.listByGoal, { goalId })
    expect(row.title).toBe('Two weeks clean')
    expect(row.dueDate).toBeUndefined()
  })

  test('a milestone needs a title, on the way in and on the way through', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'life',
    })
    await expect(
      me.mutation(api.milestones.create, { goalId, title: '   ' }),
    ).rejects.toThrow('A milestone needs a title')
    const m = await me.mutation(api.milestones.create, { goalId, title: 'x' })
    await expect(
      me.mutation(api.milestones.update, { milestoneId: m, title: ' ' }),
    ).rejects.toThrow('A milestone needs a title')
  })

  test('a bad or foreign goal id lists nothing rather than throwing', async () => {
    const me = as(ME)
    expect(
      await me.query(api.milestones.listByGoal, { goalId: 'nope' }),
    ).toEqual([])
  })

  test('deleting a goal deletes its milestones', async () => {
    const { t, mine } = twoOwners()
    const goalId = await mine.mutation(api.goals.create, {
      title: 'G',
      area: 'life',
    })
    await mine.mutation(api.milestones.create, { goalId, title: 'a' })
    await mine.mutation(api.goals.remove, { goalId })
    const left = await t.run((ctx) => ctx.db.query('milestones').collect())
    expect(left).toEqual([])
  })

  test('another owner can neither add to my goal nor read or touch its milestones', async () => {
    const { mine, theirs } = twoOwners()
    const goalId = await mine.mutation(api.goals.create, {
      title: 'Mine',
      area: 'life',
    })
    const m = await mine.mutation(api.milestones.create, { goalId, title: 'a' })

    await expect(
      theirs.mutation(api.milestones.create, { goalId, title: 'b' }),
    ).rejects.toThrow('No such goal')
    expect(await theirs.query(api.milestones.listByGoal, { goalId })).toEqual(
      [],
    )
    await expect(
      theirs.mutation(api.milestones.setReached, {
        milestoneId: m,
        reached: true,
      }),
    ).rejects.toThrow('No such milestone')
    await expect(
      theirs.mutation(api.milestones.update, { milestoneId: m, title: 'b' }),
    ).rejects.toThrow('No such milestone')
    await expect(
      theirs.mutation(api.milestones.move, {
        milestoneId: m,
        direction: 'later',
      }),
    ).rejects.toThrow('No such milestone')
    await expect(
      theirs.mutation(api.milestones.remove, { milestoneId: m }),
    ).rejects.toThrow('No such milestone')
  })

  test('remove takes one step out and leaves the rest in order', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'life',
    })
    await me.mutation(api.milestones.create, { goalId, title: 'a' })
    const b = await me.mutation(api.milestones.create, { goalId, title: 'b' })
    await me.mutation(api.milestones.create, { goalId, title: 'c' })

    await me.mutation(api.milestones.remove, { milestoneId: b })

    const list = await me.query(api.milestones.listByGoal, { goalId })
    expect(list.map((m) => m.title)).toEqual(['a', 'c'])
  })
})
