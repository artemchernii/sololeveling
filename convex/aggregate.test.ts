/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* September 2026, local midnights. Passed in rather than computed server-side:
   the server does not know what month it is where you are. */
const AUG_1 = new Date(2026, 7, 1).getTime()
const SEP_1 = new Date(2026, 8, 1).getTime()
const OCT_1 = new Date(2026, 9, 1).getTime()
const MONTH = { prevStart: AUG_1, monthStart: SEP_1, nextStart: OCT_1 }

function as(subject: string) {
  return convexTest(schema, modules).withIdentity({ tokenIdentifier: subject })
}

function at(month: 'aug' | 'sep', day: number) {
  return new Date(2026, month === 'aug' ? 7 : 8, day, 12).getTime()
}

describe('monthCounts is six fixed tiles (PLAN.md §3 item 4)', () => {
  test('it counts this month against last, per tile', async () => {
    const t = as(ME)
    const log = (kind: 'workout' | 'session', when: number) =>
      t.mutation(api.logs.create, {
        kind,
        area: kind === 'workout' ? 'body' : 'portuguese',
        occurredAt: when,
      })

    await log('workout', at('sep', 3))
    await log('workout', at('sep', 5))
    await log('workout', at('aug', 20))
    await log('session', at('sep', 4))

    const counts = await t.query(api.aggregate.monthCounts, MONTH)
    expect(counts.body).toEqual({ now: 2, prev: 1 })
    expect(counts.portuguese).toEqual({ now: 1, prev: 0 })
    expect(counts.total).toBe(3)
  })

  test('the shape is fixed — nine areas, six tiles', async () => {
    const t = as(ME)
    const counts = await t.query(api.aggregate.monthCounts, MONTH)
    expect(Object.keys(counts).sort()).toEqual(
      [
        'body',
        'money',
        'portuguese',
        'projects',
        'social',
        'style',
        'total',
      ].sort(),
    )
    /* Career, knowledge and life exist as areas and have no tile, on purpose. */
    expect(counts).not.toHaveProperty('career')
    expect(counts).not.toHaveProperty('knowledge')
    expect(counts).not.toHaveProperty('life')
  })

  test('a log tagged body but of another kind does not become a workout', async () => {
    const t = as(ME)
    await t.mutation(api.logs.create, {
      kind: 'note',
      area: 'body',
      occurredAt: at('sep', 6),
      text: 'knee felt off',
    })

    const counts = await t.query(api.aggregate.monthCounts, MONTH)
    /* The tiles count kinds, not areas: a note about the body is not a workout. */
    expect(counts.body.now).toBe(0)
    expect(counts.total).toBe(1)
  })

  test('a log on the last day of last month stays in last month', async () => {
    const t = as(ME)
    await t.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: SEP_1 - 1,
    })
    const counts = await t.query(api.aggregate.monthCounts, MONTH)
    expect(counts.body).toEqual({ now: 0, prev: 1 })
  })

  test('it never counts another owner’s logs', async () => {
    const mine = as(ME)
    await mine.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: at('sep', 3),
    })

    const theirs = as(SOMEONE_ELSE)
    const counts = await theirs.query(api.aggregate.monthCounts, MONTH)
    expect(counts.body.now).toBe(0)
  })
})

describe('currentState is the latest row per key (PLAN.md §1)', () => {
  test('the newest snapshot wins', async () => {
    const t = as(ME)
    for (const [value, when] of [
      [76.2, at('sep', 1)],
      [75.4, at('sep', 6)],
      [75.9, at('sep', 3)],
    ] as const) {
      await t.mutation(api.state.record, {
        area: 'body',
        key: 'weight',
        value,
        unit: 'kg',
        recordedAt: when,
      })
    }

    const state = await t.query(api.aggregate.currentState, {})
    expect(state.weight?.value).toBe(75.4)
  })

  test('a text state works as well as a number — B1 is not a score', async () => {
    const t = as(ME)
    await t.mutation(api.state.record, {
      area: 'portuguese',
      key: 'cefr_level',
      textValue: 'B1',
      recordedAt: at('sep', 1),
    })

    const state = await t.query(api.aggregate.currentState, {})
    expect(state.cefr_level?.textValue).toBe('B1')
    expect(state.cefr_level?.value).toBeUndefined()
  })

  test('a target is a state value like any other', async () => {
    const t = as(ME)
    await t.mutation(api.state.record, {
      area: 'portuguese',
      key: 'sessions_target',
      value: 4,
      recordedAt: at('sep', 1),
    })

    const state = await t.query(api.aggregate.currentState, {})
    /* "2 of 4 sessions" is a log count over this — source 2 twice, not a
       fourth source. */
    expect(state.sessions_target?.value).toBe(4)
  })

  test('a key never recorded is simply absent, not zero', async () => {
    const t = as(ME)
    const state = await t.query(api.aggregate.currentState, {})
    /* Absent, so the cell renders nothing. A zero would be a claim. */
    expect(state.net_worth).toBeNull()
  })

  test('a snapshot with neither value nor text is refused', async () => {
    const t = as(ME)
    await expect(
      t.mutation(api.state.record, {
        area: 'money',
        key: 'net_worth',
        recordedAt: at('sep', 1),
      }),
    ).rejects.toThrow('value or a text value')
  })

  test('removing the newest snapshot makes the previous one current again', async () => {
    const t = as(ME)
    await t.mutation(api.state.record, {
      area: 'body',
      key: 'weight',
      value: 76.2,
      unit: 'kg',
      recordedAt: at('sep', 1),
    })
    const typo = await t.mutation(api.state.record, {
      area: 'body',
      key: 'weight',
      value: 754,
      unit: 'kg',
      recordedAt: at('sep', 6),
    })

    await t.mutation(api.state.remove, { snapshotId: typo })

    const state = await t.query(api.aggregate.currentState, {})
    expect(state.weight?.value).toBe(76.2)
  })

  test('it never reads another owner’s state', async () => {
    const mine = as(ME)
    await mine.mutation(api.state.record, {
      area: 'money',
      key: 'net_worth',
      value: 42100,
      recordedAt: at('sep', 1),
    })

    const theirs = as(SOMEONE_ELSE)
    const state = await theirs.query(api.aggregate.currentState, {})
    /* Every key present and every one null: the shape is fixed, the values are
       theirs alone. */
    expect(Object.values(state).every((v) => v === null)).toBe(true)
  })
})

describe('weekCounts is the same six tiles, over weeks (PLAN.md §3)', () => {
  /* Mondays. Boundaries arrive as arguments for the same reason months do. */
  const MON = (day: number) => new Date(2026, 8, day).getTime()
  const STARTS = [MON(7), MON(14), MON(21)]
  const END = MON(28)

  test('a log lands in the week it happened in', async () => {
    const t = as(ME)
    const log = (when: number) =>
      t.mutation(api.logs.create, {
        kind: 'workout',
        area: 'body',
        occurredAt: when,
      })

    await log(new Date(2026, 8, 8, 12).getTime())
    await log(new Date(2026, 8, 9, 12).getTime())
    await log(new Date(2026, 8, 22, 12).getTime())

    const weeks = await t.query(api.aggregate.weekCounts, {
      starts: STARTS,
      end: END,
    })
    expect(weeks.map((w) => w.body)).toEqual([2, 0, 1])
    expect(weeks.map((w) => w.total)).toEqual([2, 0, 1])
  })

  test('one row per week start, in the order given', async () => {
    const weeks = await as(ME).query(api.aggregate.weekCounts, {
      starts: STARTS,
      end: END,
    })
    expect(weeks.map((w) => w.start)).toEqual(STARTS)
  })

  test('it returns counts and nothing derived from them', async () => {
    const weeks = await as(ME).query(api.aggregate.weekCounts, {
      starts: STARTS,
      end: END,
    })
    expect(Object.keys(weeks[0]).sort()).toEqual(
      [
        'body',
        'money',
        'portuguese',
        'projects',
        'social',
        'start',
        'style',
        'total',
      ].sort(),
    )
  })

  test('a log before the first week is not counted anywhere', async () => {
    const t = as(ME)
    await t.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: new Date(2026, 8, 1, 12).getTime(),
    })
    const weeks = await t.query(api.aggregate.weekCounts, {
      starts: STARTS,
      end: END,
    })
    expect(weeks.map((w) => w.total)).toEqual([0, 0, 0])
  })

  test('never another owner’s logs', async () => {
    const theirs = as(SOMEONE_ELSE)
    await theirs.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: new Date(2026, 8, 8, 12).getTime(),
    })
    const weeks = await as(ME).query(api.aggregate.weekCounts, {
      starts: STARTS,
      end: END,
    })
    expect(weeks.map((w) => w.total)).toEqual([0, 0, 0])
  })
})
