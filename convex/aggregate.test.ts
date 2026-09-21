/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

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

/* The fixtures above are fixed dates in September 2026, and logs.create
   refuses anything in the future. Without a clock of its own this file would
   start failing on whatever real day first falls before a fixture — so it
   lives on 1 October, after every one of them. Only Date is faked: the
   timers convex-test awaits keep running. */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 1, 12))
})
afterAll(() => {
  vi.useRealTimers()
})

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
    mine: t.withIdentity({ tokenIdentifier: ME }),
    theirs: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
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
      kind: 'expense',
      area: 'body',
      occurredAt: at('sep', 6),
      value: 30,
      text: 'knee brace',
    })

    const counts = await t.query(api.aggregate.monthCounts, MONTH)
    /* The tiles count kinds, not areas: money spent on the body is not a
       workout. (This was a note, until notes stopped being logs.) */
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
    const { mine, theirs } = twoOwners()
    await mine.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: at('sep', 3),
    })

    const counts = await theirs.query(api.aggregate.monthCounts, MONTH)
    expect(counts.body.now).toBe(0)
    expect((await mine.query(api.aggregate.monthCounts, MONTH)).body.now).toBe(
      1,
    )
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

  test('targets are not state: they live on goals now (R2)', async () => {
    const state = await as(ME).query(api.aggregate.currentState, {})
    /* sessions_target moved to the Languages tile's goal; skills_* went
       with the Career cell on 15 Sep. A key nothing reads is a key that
       drifts. */
    expect(Object.keys(state).sort()).toEqual([
      'cefr_level',
      'net_worth',
      'weight',
    ])
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
    const { mine, theirs } = twoOwners()
    await mine.mutation(api.state.record, {
      area: 'money',
      key: 'net_worth',
      value: 42100,
      recordedAt: at('sep', 1),
    })

    const state = await theirs.query(api.aggregate.currentState, {})
    /* Every key present and every one null: the shape is fixed, the values are
       theirs alone. */
    expect(Object.values(state).every((v) => v === null)).toBe(true)
    expect(
      (await mine.query(api.aggregate.currentState, {})).net_worth?.value,
    ).toBe(42100)
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

  test('the same boundaries work for days — THIS WEEK on Today', async () => {
    const t = as(ME)
    const DAY = (d: number) => new Date(2026, 8, d).getTime()
    const log = (kind: 'workout' | 'session', when: Date) =>
      t.mutation(api.logs.create, {
        kind,
        area: kind === 'workout' ? 'body' : 'portuguese',
        occurredAt: when.getTime(),
      })

    await log('workout', new Date(2026, 8, 15, 7))
    await log('session', new Date(2026, 8, 15, 23, 30))
    await log('workout', new Date(2026, 8, 16, 0, 10))

    const days = await t.query(api.aggregate.weekCounts, {
      starts: [DAY(14), DAY(15), DAY(16)],
      end: DAY(17),
    })
    expect(days.map((d) => d.body)).toEqual([0, 1, 1])
    expect(days.map((d) => d.portuguese)).toEqual([0, 1, 0])
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
    const { mine, theirs } = twoOwners()
    await theirs.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: new Date(2026, 8, 8, 12).getTime(),
    })
    const range = { starts: STARTS, end: END }

    const weeks = await mine.query(api.aggregate.weekCounts, range)
    expect(weeks.map((w) => w.total)).toEqual([0, 0, 0])
    const theirWeeks = await theirs.query(api.aggregate.weekCounts, range)
    expect(theirWeeks.map((w) => w.total)).toEqual([1, 0, 0])
  })
})

describe('kindCount is a log count for one kind (PLAN.md §1, source 1)', () => {
  test('it counts that kind, in that period, and only mine', async () => {
    const t = as(ME)
    const log = (kind: 'workout' | 'session', when: number) =>
      t.mutation(api.logs.create, {
        kind,
        area: kind === 'workout' ? 'body' : 'portuguese',
        occurredAt: when,
      })

    await log('workout', at('sep', 3))
    await log('workout', at('sep', 20))
    await log('session', at('sep', 4))
    await log('workout', at('aug', 30))
    await t.run(async (ctx) => {
      await ctx.db.insert('logs', {
        ownerId: SOMEONE_ELSE,
        kind: 'workout',
        area: 'body',
        occurredAt: at('sep', 5),
      })
    })

    const count = (kind: 'workout' | 'session', start: number, end: number) =>
      t.query(api.aggregate.kindCount, { kind, start, end })

    expect(await count('workout', SEP_1, OCT_1)).toBe(2)
    expect(await count('session', SEP_1, OCT_1)).toBe(1)
    expect(await count('workout', AUG_1, SEP_1)).toBe(1)
  })
})

describe('the Portuguese tile counts Portuguese sessions only', () => {
  test('a work session is not Portuguese practice', async () => {
    const t = as(ME)
    const session = (area: 'portuguese' | 'career' | 'business') =>
      t.mutation(api.logs.create, {
        kind: 'session',
        area,
        occurredAt: at('sep', 7),
        value: 60,
        unit: 'min',
      })
    await session('portuguese')
    await session('career')
    await session('business')

    const counts = await t.query(api.aggregate.monthCounts, MONTH)
    expect(counts.portuguese.now).toBe(1)
    expect(counts.total).toBe(3)

    const [week] = await t.query(api.aggregate.weekCounts, {
      starts: [new Date(2026, 8, 7).getTime()],
      end: new Date(2026, 8, 14).getTime(),
    })
    expect(week.portuguese).toBe(1)
  })
})

describe('kindCount narrows by area and project', () => {
  test('Portuguese sessions, work sessions and time on a project are three counts', async () => {
    const db = convexTest(schema, modules)
    const t = db.withIdentity({ tokenIdentifier: ME })
    const projectId = await t.run((ctx) =>
      ctx.db.insert('projects', {
        ownerId: ME,
        title: 'Oreum',
        status: 'active',
      }),
    )
    const session = (
      area: 'portuguese' | 'career' | 'business',
      project?: typeof projectId,
    ) =>
      t.mutation(api.logs.create, {
        kind: 'session',
        area,
        occurredAt: at('sep', 9),
        projectId: project,
      })
    await session('portuguese')
    await session('portuguese')
    await session('career')
    await session('business', projectId)

    const count = (extra: {
      area?: 'portuguese' | 'career'
      projectId?: typeof projectId
    }) =>
      t.query(api.aggregate.kindCount, {
        kind: 'session',
        start: SEP_1,
        end: OCT_1,
        ...extra,
      })

    expect(await count({})).toBe(4)
    expect(await count({ area: 'portuguese' })).toBe(2)
    expect(await count({ area: 'career' })).toBe(1)
    expect(await count({ projectId })).toBe(1)
  })
})

describe('tileTargets is a goal’s targetValue per tile (PLAN.md §1)', () => {
  test('null where no target is set — absent, not zero', async () => {
    const targets = await as(ME).query(api.aggregate.tileTargets, {})
    expect(targets).toEqual({
      projects: null,
      portuguese: null,
      body: null,
      money: null,
      style: null,
      social: null,
    })
  })

  test('a target shows on its own tile only', async () => {
    const t = as(ME)
    await t.mutation(api.goals.setTileTarget, { tile: 'body', targetValue: 9 })
    const targets = await t.query(api.aggregate.tileTargets, {})
    expect(targets.body).toEqual({ value: 9 })
    expect(targets.social).toBeNull()
  })

  test('a measurable goal with no tile is not a monthly target', async () => {
    const t = as(ME)
    await t.mutation(api.goals.create, {
      title: '€80,000',
      area: 'money',
      targetValue: 80000,
      unit: '€',
    })
    expect((await t.query(api.aggregate.tileTargets, {})).money).toBeNull()
  })

  test('a cleared target is gone from the tile', async () => {
    const t = as(ME)
    await t.mutation(api.goals.setTileTarget, { tile: 'body', targetValue: 9 })
    await t.mutation(api.goals.clearTileTarget, { tile: 'body' })
    expect((await t.query(api.aggregate.tileTargets, {})).body).toBeNull()
  })

  /* The count stays a count. The words are what the count is in aid of —
     "aiming at €100 a month" — and nothing divides by them (PLAN.md §4). */
  test('a tile carries the words set beside its number, and can drop them', async () => {
    const t = as(ME)
    await t.mutation(api.goals.setTileTarget, {
      tile: 'money',
      targetValue: 4,
      targetLabel: 'aiming at €100 a month',
    })
    expect((await t.query(api.aggregate.tileTargets, {})).money).toEqual({
      value: 4,
      label: 'aiming at €100 a month',
    })

    await t.mutation(api.goals.setTileTarget, {
      tile: 'money',
      targetValue: 6,
      targetLabel: null,
    })
    expect((await t.query(api.aggregate.tileTargets, {})).money).toEqual({
      value: 6,
    })
  })

  test('never another owner’s', async () => {
    const { mine, theirs } = twoOwners()
    await theirs.mutation(api.goals.setTileTarget, {
      tile: 'body',
      targetValue: 9,
    })
    expect((await mine.query(api.aggregate.tileTargets, {})).body).toBeNull()
    expect((await theirs.query(api.aggregate.tileTargets, {})).body).toEqual({
      value: 9,
    })
  })
})

describe('categoryDays — how often, per kind of thing', () => {
  /* Local midnights, built by stepping days: the same rule weeks.ts keeps,
     because an hour goes missing twice a year. */
  function dayStartsBack(count: number, from = new Date()) {
    const midnight = new Date(from)
    midnight.setHours(0, 0, 0, 0)
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(midnight)
      d.setDate(d.getDate() - (count - 1 - i))
      return d.getTime()
    })
  }

  test('a row lands in the day it happened, and nowhere else', async () => {
    const t = as(ME)
    const days = dayStartsBack(7)
    const end = days[6] + 86_400_000
    await t.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: days[4] + 3_600_000,
      category: 'gym',
    })

    const { rows, complete } = await t.query(api.aggregate.categoryDays, {
      area: 'body',
      kinds: ['workout'],
      dayStarts: days,
      end,
      recentDays: 7,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0].category).toBe('gym')
    expect(rows[0].days).toEqual([0, 0, 0, 0, 1, 0, 0])
    expect(rows[0].total).toBe(1)
    expect(rows[0].activeRecent).toBe(1)
    expect(complete).toBe(true)
  })

  test('two sessions in one day are one active day, and two rows', async () => {
    const t = as(ME)
    const days = dayStartsBack(7)
    const end = days[6] + 86_400_000
    for (const offset of [3_600_000, 7_200_000]) {
      await t.mutation(api.logs.create, {
        kind: 'workout',
        area: 'body',
        occurredAt: days[6] + offset,
        category: 'gym',
      })
    }

    const { rows } = await t.query(api.aggregate.categoryDays, {
      area: 'body',
      kinds: ['workout'],
      dayStarts: days,
      end,
      recentDays: 7,
    })
    const [gym] = rows
    expect(gym.days[6]).toBe(2)
    expect(gym.total).toBe(2)
    /* The count is "days with something on them", not rows — twice in one
       day is one day you went. */
    expect(gym.activeRecent).toBe(1)
  })

  test('each category is its own row, sorted, uncategorised last', async () => {
    const t = as(ME)
    const days = dayStartsBack(3)
    const end = days[2] + 86_400_000
    await t.mutation(api.logs.create, {
      kind: 'workout', area: 'body', occurredAt: days[0], category: 'stretch',
    })
    await t.mutation(api.logs.create, {
      kind: 'workout', area: 'body', occurredAt: days[1], category: 'gym',
    })
    /* A workout from before this row shipped. */
    await t.mutation(api.logs.create, {
      kind: 'workout', area: 'body', occurredAt: days[2],
    })

    const { rows } = await t.query(api.aggregate.categoryDays, {
      area: 'body', kinds: ['workout'], dayStarts: days, end, recentDays: 3,
    })
    expect(rows.map((r) => r.category)).toEqual(['gym', 'stretch', null])
  })

  test('an intake and a workout are separate rows even with the same word', async () => {
    const t = as(ME)
    const days = dayStartsBack(2)
    const end = days[1] + 86_400_000
    await t.mutation(api.logs.create, {
      kind: 'intake', area: 'body', occurredAt: days[1], category: 'supplements',
    })
    await t.mutation(api.logs.create, {
      kind: 'workout', area: 'body', occurredAt: days[1], category: 'gym',
    })

    const { rows } = await t.query(api.aggregate.categoryDays, {
      area: 'body', kinds: ['workout', 'intake'], dayStarts: days, end, recentDays: 2,
    })
    expect(rows.map((r) => [r.kind, r.category])).toEqual([
      ['intake', 'supplements'],
      ['workout', 'gym'],
    ])
  })

  test('activeRecent covers only the trailing window asked for', async () => {
    const t = as(ME)
    const days = dayStartsBack(10)
    const end = days[9] + 86_400_000
    /* One long ago, one two days back. */
    for (const i of [0, 8]) {
      await t.mutation(api.logs.create, {
        kind: 'workout', area: 'body', occurredAt: days[i], category: 'gym',
      })
    }

    const { rows } = await t.query(api.aggregate.categoryDays, {
      area: 'body', kinds: ['workout'], dayStarts: days, end, recentDays: 3,
    })
    const [gym] = rows
    expect(gym.total).toBe(2)
    expect(gym.activeRecent).toBe(1)
  })

  test('another owner is not in your strip', async () => {
    const backend = convexTest(schema, modules)
    const days = dayStartsBack(2)
    const end = days[1] + 86_400_000
    await backend
      .withIdentity({ tokenIdentifier: ME })
      .mutation(api.logs.create, {
        kind: 'workout', area: 'body', occurredAt: days[1], category: 'gym',
      })
    const theirs = await backend
      .withIdentity({ tokenIdentifier: SOMEONE_ELSE })
      .query(api.aggregate.categoryDays, {
        area: 'body', kinds: ['workout'], dayStarts: days, end, recentDays: 2,
      })
    expect(theirs.rows).toEqual([])
  })

  test('no days asked for is no days answered', async () => {
    const { rows, complete } = await as(ME).query(api.aggregate.categoryDays, {
      area: 'body', kinds: ['workout'], dayStarts: [], end: Date.now(), recentDays: 30,
    })
    expect(rows).toEqual([])
    expect(complete).toBe(true)
  })

  test('a read that hits the row cap says so, and one that does not', async () => {
    const days = dayStartsBack(3)
    const end = days[2] + 86_400_000

    /* One row over CATEGORY_DAYS_ROWS, written straight to the table —
       CATEGORY_DAYS_ROWS is sized for twelve weeks of real capture, so
       reaching it through logs.create would mean thousands of mutations for
       a fact this shows just as well with direct inserts. */
    const overflowing = as(ME)
    await overflowing.run(async (ctx) => {
      for (let i = 0; i < 1501; i += 1) {
        await ctx.db.insert('logs', {
          ownerId: ME,
          kind: 'workout',
          area: 'body',
          occurredAt: days[1],
          meta: { category: 'gym' },
        })
      }
    })
    const full = await overflowing.query(api.aggregate.categoryDays, {
      area: 'body', kinds: ['workout'], dayStarts: days, end, recentDays: 3,
    })
    expect(full.complete).toBe(false)

    const under = as(ME)
    await under.mutation(api.logs.create, {
      kind: 'workout', area: 'body', occurredAt: days[1], category: 'gym',
    })
    const partial = await under.query(api.aggregate.categoryDays, {
      area: 'body', kinds: ['workout'], dayStarts: days, end, recentDays: 3,
    })
    expect(partial.complete).toBe(true)
  })
})

describe('stateHistory — source 2 read as a series', () => {
  test('the stored rows, oldest first, and nothing between them', async () => {
    const t = as(ME)
    const now = Date.now()
    const week = 7 * 86_400_000
    for (const [value, ts] of [
      [77.2, now - 2 * week],
      [76.1, now - week],
      [75.4, now],
    ] as const) {
      await t.mutation(api.logs.create, {
        kind: 'weight', area: 'body', occurredAt: ts, value, unit: 'kg',
      })
    }

    const { rows: history } = await t.query(api.aggregate.stateHistory, {
      key: 'weight',
      start: now - 3 * week,
      end: now + 86_400_000,
    })

    expect(history.map((r) => r.value)).toEqual([77.2, 76.1, 75.4])
    expect(history.map((r) => r.recordedAt)).toEqual([
      now - 2 * week, now - week, now,
    ])
    expect(history[0].unit).toBe('kg')
  })

  test('a row outside the window is not in it', async () => {
    const t = as(ME)
    const now = Date.now()
    await t.mutation(api.logs.create, {
      kind: 'weight', area: 'body', occurredAt: now - 90 * 86_400_000,
      value: 80, unit: 'kg',
    })
    const { rows: history } = await t.query(api.aggregate.stateHistory, {
      key: 'weight', start: now - 30 * 86_400_000, end: now + 86_400_000,
    })
    expect(history).toEqual([])
  })

  test('another owner has their own history', async () => {
    const backend = convexTest(schema, modules)
    const now = Date.now()
    await backend
      .withIdentity({ tokenIdentifier: ME })
      .mutation(api.logs.create, {
        kind: 'weight', area: 'body', occurredAt: now, value: 75.4, unit: 'kg',
      })
    const theirs = await backend
      .withIdentity({ tokenIdentifier: SOMEONE_ELSE })
      .query(api.aggregate.stateHistory, {
        key: 'weight', start: now - 86_400_000, end: now + 86_400_000,
      })
    expect(theirs.rows).toEqual([])
  })

  test('a read that hits the row cap says so, and one that does not', async () => {
    const now = Date.now()

    /* Rows over STATE_HISTORY_ROWS, written straight to the table —
       STATE_HISTORY_ROWS is sized for a year and a half of twice-daily
       readings, so reaching it through logs.create would mean thousands of
       mutations for a fact this shows just as well with direct inserts. */
    const overflowing = as(ME)
    await overflowing.run(async (ctx) => {
      for (let i = 0; i < 1001; i += 1) {
        await ctx.db.insert('stateSnapshots', {
          ownerId: ME,
          area: 'body',
          key: 'weight',
          value: 75,
          unit: 'kg',
          recordedAt: now - i * 60_000,
        })
      }
    })
    const full = await overflowing.query(api.aggregate.stateHistory, {
      key: 'weight', start: now - 70_000_000, end: now + 86_400_000,
    })
    expect(full.complete).toBe(false)

    const under = as(ME)
    await under.mutation(api.logs.create, {
      kind: 'weight', area: 'body', occurredAt: now, value: 75.4, unit: 'kg',
    })
    const partial = await under.query(api.aggregate.stateHistory, {
      key: 'weight', start: now - 86_400_000, end: now + 86_400_000,
    })
    expect(partial.complete).toBe(true)
  })
})
