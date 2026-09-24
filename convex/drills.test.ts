/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

function world() {
  const t = convexTest(schema, modules)
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

function dayStartsBack(count: number, from = new Date()) {
  const midnight = new Date(from)
  midnight.setHours(0, 0, 0, 0)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(midnight)
    d.setDate(d.getDate() - (count - 1 - i))
    return d.getTime()
  })
}

describe('drills — a routine is typed in, in order', () => {
  test('created in order, group written like a category', async () => {
    const { me } = world()
    await me.mutation(api.drills.create, {
      area: 'body',
      group: '  Stretch ',
      title: ' Cat-cow ',
    })
    await me.mutation(api.drills.create, {
      area: 'body',
      group: 'stretch',
      title: 'Bird  dog',
    })
    const rows = await me.query(api.drills.list, { area: 'body' })
    expect(rows.map((d) => [d.group, d.title])).toEqual([
      ['stretch', 'Cat-cow'],
      ['stretch', 'Bird dog'],
    ])
  })

  test('an empty name is refused', async () => {
    const { me } = world()
    await expect(
      me.mutation(api.drills.create, {
        area: 'body',
        group: 'gym',
        title: ' ',
      }),
    ).rejects.toThrow('Give it a name')
  })

  test('only my drills, only this area', async () => {
    const { me, them } = world()
    await me.mutation(api.drills.create, {
      area: 'body',
      group: 'gym',
      title: 'Squat',
    })
    await me.mutation(api.drills.create, {
      area: 'portuguese',
      group: 'topic',
      title: 'Ser vs estar',
    })
    expect(await them.query(api.drills.list, { area: 'body' })).toEqual([])
    const body = await me.query(api.drills.list, { area: 'body' })
    expect(body.map((d) => d.title)).toEqual(['Squat'])
  })

  test('retired leaves the list, restore brings it back', async () => {
    const { me } = world()
    const id = await me.mutation(api.drills.create, {
      area: 'body',
      group: 'gym',
      title: 'Squat',
    })
    await me.mutation(api.drills.retire, { drillId: id })
    expect(await me.query(api.drills.list, { area: 'body' })).toEqual([])
    await me.mutation(api.drills.restore, { drillId: id })
    expect(await me.query(api.drills.list, { area: 'body' })).toHaveLength(1)
  })

  test('rename and mark; another owner can do neither', async () => {
    const { me, them } = world()
    const id = await me.mutation(api.drills.create, {
      area: 'portuguese',
      group: 'topic',
      title: 'Preterito',
    })
    await me.mutation(api.drills.rename, { drillId: id, title: 'Pretérito' })
    await me.mutation(api.drills.setMark, { drillId: id, mark: 'solid' })
    let [row] = await me.query(api.drills.list, { area: 'portuguese' })
    expect(row.title).toBe('Pretérito')
    expect(row.mark).toBe('solid')
    await me.mutation(api.drills.setMark, { drillId: id, mark: null })
    ;[row] = await me.query(api.drills.list, { area: 'portuguese' })
    expect(row.mark).toBeUndefined()

    await expect(
      them.mutation(api.drills.rename, { drillId: id, title: 'x' }),
    ).rejects.toThrow('No such drill')
    await expect(
      them.mutation(api.drills.setMark, { drillId: id, mark: 'solid' }),
    ).rejects.toThrow('No such drill')
    await expect(
      them.mutation(api.drills.retire, { drillId: id }),
    ).rejects.toThrow('No such drill')
  })
})

describe('drills.did — one tap, one exercise log, never a workout', () => {
  test('writes an exercise filed under the group, carrying the name', async () => {
    const { t, me } = world()
    const id = await me.mutation(api.drills.create, {
      area: 'body',
      group: 'stretch',
      title: 'Cat-cow',
    })
    const logId = await me.mutation(api.drills.did, { drillId: id })
    const log = await t.run((ctx) => ctx.db.get(logId))
    expect(log?.kind).toBe('exercise')
    expect(log?.area).toBe('body')
    expect(log?.text).toBe('Cat-cow')
    expect(log?.meta).toEqual({ category: 'stretch', drillId: id })
  })

  test('six stretches are not six workouts on the Today tile', async () => {
    const { me } = world()
    const id = await me.mutation(api.drills.create, {
      area: 'body',
      group: 'stretch',
      title: 'Cat-cow',
    })
    for (let i = 0; i < 6; i += 1) {
      await me.mutation(api.drills.did, { drillId: id })
    }
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const count = await me.query(api.aggregate.kindCount, {
      kind: 'workout',
      start,
      end: Date.now() + 1,
    })
    expect(count).toBe(0)
  })

  test("another owner's drill cannot be ticked, a retired one refuses", async () => {
    const { me, them } = world()
    const id = await me.mutation(api.drills.create, {
      area: 'body',
      group: 'gym',
      title: 'Squat',
    })
    await expect(
      them.mutation(api.drills.did, { drillId: id }),
    ).rejects.toThrow('No such drill')
    await me.mutation(api.drills.retire, { drillId: id })
    await expect(me.mutation(api.drills.did, { drillId: id })).rejects.toThrow(
      'off the list',
    )
  })
})

describe('aggregate.drillDays — how often each item was done', () => {
  test('per drill per day, with a total and the last time', async () => {
    const { me } = world()
    const days = dayStartsBack(7)
    const end = days[6] + 86_400_000
    const a = await me.mutation(api.drills.create, {
      area: 'body',
      group: 'stretch',
      title: 'Cat-cow',
    })
    const b = await me.mutation(api.drills.create, {
      area: 'body',
      group: 'stretch',
      title: 'Bird dog',
    })
    await me.mutation(api.drills.did, { drillId: a })
    await me.mutation(api.drills.did, { drillId: a })
    await me.mutation(api.drills.did, { drillId: b })
    /* A stretch session is not an exercise and names no drill. */
    await me.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: Date.now(),
      category: 'stretch',
    })

    const { rows, complete } = await me.query(api.aggregate.drillDays, {
      area: 'body',
      dayStarts: days,
      end,
    })
    expect(complete).toBe(true)
    const byId = new Map(rows.map((r) => [r.drillId, r]))
    expect(byId.get(a)?.days).toEqual([0, 0, 0, 0, 0, 0, 2])
    expect(byId.get(a)?.total).toBe(2)
    expect(byId.get(b)?.total).toBe(1)
    expect(rows).toHaveLength(2)
  })

  test("another owner's taps are not mine", async () => {
    const { me, them } = world()
    const days = dayStartsBack(7)
    const id = await them.mutation(api.drills.create, {
      area: 'body',
      group: 'gym',
      title: 'Squat',
    })
    await them.mutation(api.drills.did, { drillId: id })
    const { rows } = await me.query(api.aggregate.drillDays, {
      area: 'body',
      dayStarts: days,
      end: days[6] + 86_400_000,
    })
    expect(rows).toEqual([])
  })
})

describe('categoryDays — a routine and its session are one habit', () => {
  test('a stretch session and ticked stretches share one STRETCH row', async () => {
    const { me } = world()
    const days = dayStartsBack(7)
    const id = await me.mutation(api.drills.create, {
      area: 'body',
      group: 'stretch',
      title: 'Cat-cow',
    })
    await me.mutation(api.drills.did, { drillId: id })
    await me.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: Date.now(),
      category: 'stretch',
    })
    const { rows } = await me.query(api.aggregate.categoryDays, {
      area: 'body',
      kinds: ['workout', 'exercise'],
      dayStarts: days,
      end: days[6] + 86_400_000,
      recentDays: 7,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].category).toBe('stretch')
    expect(rows[0].kind).toBe('workout')
    expect(rows[0].days[6]).toBe(2)
    expect(rows[0].activeRecent).toBe(1)
  })
})

describe('logs.setCategory — refiling an OTHER row', () => {
  test('sets, changes and clears; the rest of meta survives', async () => {
    const { t, me } = world()
    const logId = await me.mutation(api.logs.create, {
      kind: 'session',
      area: 'portuguese',
      occurredAt: Date.now(),
      value: 30,
    })
    await me.mutation(api.logs.setCategory, { logId, category: ' Class ' })
    expect((await t.run((ctx) => ctx.db.get(logId)))?.meta).toEqual({
      category: 'class',
    })
    await me.mutation(api.logs.setCategory, { logId, category: null })
    expect((await t.run((ctx) => ctx.db.get(logId)))?.meta).toBeUndefined()

    const drillId = await me.mutation(api.drills.create, {
      area: 'body',
      group: 'stretch',
      title: 'Cat-cow',
    })
    const ex = await me.mutation(api.drills.did, { drillId })
    await me.mutation(api.logs.setCategory, { logId: ex, category: 'gym' })
    expect((await t.run((ctx) => ctx.db.get(ex)))?.meta).toEqual({
      category: 'gym',
      drillId,
    })
  })

  test("another owner's log is refused", async () => {
    const { me, them } = world()
    const logId = await me.mutation(api.logs.create, {
      kind: 'session',
      area: 'portuguese',
      occurredAt: Date.now(),
    })
    await expect(
      them.mutation(api.logs.setCategory, { logId, category: 'class' }),
    ).rejects.toThrow('No such log')
  })
})

describe('goals.setWeightTarget — the dashed line on the Weight card', () => {
  test('creates one kg body goal, then moves its number', async () => {
    const { me } = world()
    const first = await me.mutation(api.goals.setWeightTarget, {
      targetValue: 72.04,
    })
    const again = await me.mutation(api.goals.setWeightTarget, {
      targetValue: 71,
    })
    expect(again).toBe(first)
    const goals = await me.query(api.goals.listActive, {})
    expect(goals).toHaveLength(1)
    expect(goals[0]).toMatchObject({
      area: 'body',
      unit: 'kg',
      targetValue: 71,
    })
  })

  test('not a weight is refused; clear drops it', async () => {
    const { me } = world()
    await expect(
      me.mutation(api.goals.setWeightTarget, { targetValue: 0 }),
    ).rejects.toThrow('not a weight')
    await me.mutation(api.goals.setWeightTarget, { targetValue: 72 })
    await me.mutation(api.goals.clearWeightTarget, {})
    expect(await me.query(api.goals.listActive, {})).toEqual([])
  })

  test("a workouts target is not the weight goal, and another owner's is not mine", async () => {
    const { me, them } = world()
    await me.mutation(api.goals.setTileTarget, {
      tile: 'body',
      targetValue: 12,
    })
    await them.mutation(api.goals.setWeightTarget, { targetValue: 90 })
    await me.mutation(api.goals.setWeightTarget, { targetValue: 72 })
    const goals = await me.query(api.goals.listActive, {})
    expect(goals).toHaveLength(2)
    expect(goals.find((g) => g.unit === 'kg')?.targetValue).toBe(72)
  })
})

describe('drills — built-in Body programs', () => {
  test('adding a program makes a drill per exercise, filed under its kind', async () => {
    const { me } = world()
    await me.mutation(api.drills.addProgram, { programId: 'gym-ab' })
    const rows = await me.query(api.drills.list, { area: 'body' })
    expect(rows.length).toBe(12)
    expect(new Set(rows.map((d) => d.group))).toEqual(new Set(['gym']))
    expect(rows[0]).toMatchObject({
      ref: 'gym-a--goblet-squat',
      title: 'Goblet squat',
    })
  })

  test('adding twice makes nothing new', async () => {
    const { me } = world()
    await me.mutation(api.drills.addProgram, { programId: 'back' })
    await me.mutation(api.drills.addProgram, { programId: 'back' })
    const rows = await me.query(api.drills.list, { area: 'body' })
    expect(rows.length).toBe(9)
  })

  test('an unknown program is refused', async () => {
    const { me } = world()
    await expect(
      me.mutation(api.drills.addProgram, { programId: 'nope' }),
    ).rejects.toThrow('No such program')
    await expect(
      me.mutation(api.drills.dropProgram, { programId: 'nope' }),
    ).rejects.toThrow('No such program')
  })

  test('drop retires, keeps the logs, and adding again brings the same rows back', async () => {
    const { t, me } = world()
    await me.mutation(api.drills.addProgram, { programId: 'back' })
    const [first] = await me.query(api.drills.list, { area: 'body' })
    const logId = await me.mutation(api.drills.did, { drillId: first._id })

    await me.mutation(api.drills.dropProgram, { programId: 'back' })
    expect(await me.query(api.drills.list, { area: 'body' })).toEqual([])
    expect(await t.run((ctx) => ctx.db.get(logId))).not.toBeNull()

    await me.mutation(api.drills.addProgram, { programId: 'back' })
    const again = await me.query(api.drills.list, { area: 'body' })
    expect(again.length).toBe(9)
    expect(again[0]._id).toBe(first._id)
  })

  test('drop leaves his own drills and other programs alone', async () => {
    const { me } = world()
    await me.mutation(api.drills.create, {
      area: 'body',
      group: 'stretch',
      title: 'Wall angels',
    })
    await me.mutation(api.drills.addProgram, { programId: 'back' })
    await me.mutation(api.drills.addProgram, { programId: 'hips' })
    await me.mutation(api.drills.dropProgram, { programId: 'back' })
    const rows = await me.query(api.drills.list, { area: 'body' })
    expect(rows.map((d) => d.title)).toContain('Wall angels')
    expect(rows.filter((d) => d.ref?.startsWith('hips--')).length).toBe(7)
    expect(rows.some((d) => d.ref?.startsWith('back--'))).toBe(false)
  })

  test("another owner's program rows are neither reused nor dropped", async () => {
    const { me, them } = world()
    await them.mutation(api.drills.addProgram, { programId: 'back' })
    await me.mutation(api.drills.addProgram, { programId: 'back' })
    await me.mutation(api.drills.dropProgram, { programId: 'back' })
    expect(await me.query(api.drills.list, { area: 'body' })).toEqual([])
    expect(
      (await them.query(api.drills.list, { area: 'body' })).length,
    ).toBe(9)
  })

  test('signed out is refused', async () => {
    const { t } = world()
    await expect(
      t.mutation(api.drills.addProgram, { programId: 'back' }),
    ).rejects.toThrow()
  })
})
