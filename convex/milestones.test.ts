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

describe('a milestone can be due at a time of day', () => {
  test('a time is kept beside the date, and cleared on its own', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'business',
    })
    const m = await me.mutation(api.milestones.create, {
      goalId,
      title: 'planning',
      dueDate: '2026-09-21',
      dueTime: '14:00',
    })

    let [row] = await me.query(api.milestones.listByGoal, { goalId })
    expect([row.dueDate, row.dueTime]).toEqual(['2026-09-21', '14:00'])

    /* The day survives losing the hour: "by the 21st" is still a due date. */
    await me.mutation(api.milestones.update, { milestoneId: m, dueTime: null })
    ;[row] = await me.query(api.milestones.listByGoal, { goalId })
    expect(row.dueDate).toBe('2026-09-21')
    expect(row.dueTime).toBeUndefined()
  })

  /* An hour with no day is not a due date, and would have nowhere to sit on
     the calendar. Clearing the date takes the time with it. */
  test('clearing the date clears the time too', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'business',
    })
    const m = await me.mutation(api.milestones.create, {
      goalId,
      title: 'planning',
      dueDate: '2026-09-21',
      dueTime: '14:00',
    })

    await me.mutation(api.milestones.update, { milestoneId: m, dueDate: null })

    const [row] = await me.query(api.milestones.listByGoal, { goalId })
    expect(row.dueDate).toBeUndefined()
    expect(row.dueTime).toBeUndefined()
  })

  test('a time without a date is refused on the way in', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'business',
    })
    await expect(
      me.mutation(api.milestones.create, {
        goalId,
        title: 'planning',
        dueTime: '14:00',
      }),
    ).rejects.toThrow('A time needs a day')
  })

  test('and refused on the way through', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'business',
    })
    const m = await me.mutation(api.milestones.create, { goalId, title: 'x' })
    await expect(
      me.mutation(api.milestones.update, { milestoneId: m, dueTime: '09:30' }),
    ).rejects.toThrow('A time needs a day')
  })
})

describe('milestones due in a span of days', () => {
  test('inside the window, and never the day it ends', async () => {
    const me = as(ME)
    const goalId = await me.mutation(api.goals.create, {
      title: 'G',
      area: 'business',
    })
    for (const [title, dueDate] of [
      ['before', '2026-09-06'],
      ['first day', '2026-09-07'],
      ['middle', '2026-09-09'],
      ['the end day', '2026-09-14'],
    ]) {
      await me.mutation(api.milestones.create, { goalId, title, dueDate })
    }
    await me.mutation(api.milestones.create, { goalId, title: 'no day' })

    const due = await me.query(api.milestones.dueInRange, {
      from: '2026-09-07',
      to: '2026-09-14',
    })
    expect(due.map((m) => m.title)).toEqual(['first day', 'middle'])
  })

  test('never another owner’s', async () => {
    const { mine, theirs } = twoOwners()
    const goalId = await mine.mutation(api.goals.create, {
      title: 'Mine',
      area: 'business',
    })
    await mine.mutation(api.milestones.create, {
      goalId,
      title: 'mine',
      dueDate: '2026-09-09',
    })

    expect(
      await theirs.query(api.milestones.dueInRange, {
        from: '2026-09-01',
        to: '2026-10-01',
      }),
    ).toEqual([])
  })
})

/* 24 Sep: a + between any two steps on the timeline. */
describe('adding a step in between', () => {
  async function goalWith(t: ReturnType<typeof as>, titles: Array<string>) {
    const goalId = await t.mutation(api.goals.create, {
      title: 'Ship',
      area: 'career',
    })
    const ids = []
    for (const title of titles) {
      ids.push(await t.mutation(api.milestones.create, { goalId, title }))
    }
    return { goalId, ids }
  }
  async function order(t: ReturnType<typeof as>, goalId: string) {
    const list = await t.query(api.milestones.listByGoal, { goalId })
    return list.map((m) => m.title)
  }

  test('after a step lands right after it', async () => {
    const t = as(ME)
    const { goalId, ids } = await goalWith(t, ['a', 'c'])
    await t.mutation(api.milestones.create, {
      goalId,
      title: 'b',
      after: ids[0],
    })
    expect(await order(t, goalId)).toEqual(['a', 'b', 'c'])
  })

  test('null puts it first; absent puts it last', async () => {
    const t = as(ME)
    const { goalId } = await goalWith(t, ['b'])
    await t.mutation(api.milestones.create, { goalId, title: 'a', after: null })
    await t.mutation(api.milestones.create, { goalId, title: 'c' })
    expect(await order(t, goalId)).toEqual(['a', 'b', 'c'])
  })

  test('in between, again and again, keeps the order', async () => {
    const t = as(ME)
    const { goalId, ids } = await goalWith(t, ['a', 'z'])
    let after = ids[0]
    for (const title of ['b', 'c', 'd', 'e']) {
      after = await t.mutation(api.milestones.create, { goalId, title, after })
    }
    expect(await order(t, goalId)).toEqual(['a', 'b', 'c', 'd', 'e', 'z'])
  })

  test("refuses someone else's step as the anchor", async () => {
    const { mine, theirs } = twoOwners()
    const { ids } = await goalWith(theirs, ['theirs'])
    const { goalId } = await goalWith(mine, ['mine'])
    await expect(
      mine.mutation(api.milestones.create, {
        goalId,
        title: 'x',
        after: ids[0],
      }),
    ).rejects.toThrow('No such milestone')
  })
})
