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

describe('logs.create takes a when, but only one that has happened', () => {
  test('a log can be back-dated', async () => {
    const t = as(ME)
    const yesterday = Date.now() - 86_400_000
    await t.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: yesterday,
    })
    const [row] = await t.query(api.logs.recent, {})
    expect(row.occurredAt).toBe(yesterday)
  })

  test('a log in the future is refused — that is intent, not evidence', async () => {
    await expect(
      as(ME).mutation(api.logs.create, {
        kind: 'workout',
        area: 'body',
        occurredAt: Date.now() + 60 * 60_000,
      }),
    ).rejects.toThrow('not in the future')
  })

  test('a clock a minute ahead is not a lie', async () => {
    await as(ME).mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: Date.now() + 60_000,
    })
  })
})

describe('logs.recent', () => {
  test('newest first, without ticked tasks, and only mine', async () => {
    const t = as(ME)
    const now = Date.now()
    await t.mutation(api.logs.create, {
      kind: 'session',
      area: 'portuguese',
      occurredAt: now - 3000,
      value: 50,
    })
    await t.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: now - 1000,
    })
    await t.run(async (ctx) => {
      await ctx.db.insert('logs', {
        ownerId: ME,
        kind: 'task_done',
        area: 'life',
        occurredAt: now - 500,
      })
      await ctx.db.insert('logs', {
        ownerId: SOMEONE_ELSE,
        kind: 'workout',
        area: 'body',
        occurredAt: now - 200,
      })
    })

    const rows = await t.query(api.logs.recent, {})
    expect(rows.map((r) => r.kind)).toEqual(['workout', 'session'])
  })
})

describe('a note is not a log', () => {
  test('logs.create refuses kind note — notes live in notes', async () => {
    await expect(
      as(ME).mutation(api.logs.create, {
        kind: 'note',
        area: 'life',
        occurredAt: Date.now(),
        text: 'call the landlord',
      }),
    ).rejects.toThrow('written to notes')
  })
})

describe('a log carries the kind of thing it was', () => {
  test('a category is stored on the row', async () => {
    const t = as(ME)
    await t.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: Date.now(),
      category: 'gym',
    })
    const [row] = await t.query(api.logs.recent, {})
    expect(row.meta?.category).toBe('gym')
  })

  test('a log without one stores no category, not an empty one', async () => {
    const t = as(ME)
    await t.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: Date.now(),
    })
    const [row] = await t.query(api.logs.recent, {})
    expect(row.meta?.category).toBeUndefined()
  })

  test('supplements are an intake, not a workout', async () => {
    const t = as(ME)
    await t.mutation(api.logs.create, {
      kind: 'intake',
      area: 'body',
      occurredAt: Date.now(),
      category: 'supplements',
    })
    const [row] = await t.query(api.logs.recent, {})
    expect(row.kind).toBe('intake')
    expect(row.meta?.category).toBe('supplements')
  })
})

describe('the categories you have already used', () => {
  test('distinct, sorted, and only for the kind asked for', async () => {
    const t = as(ME)
    const now = Date.now()
    for (const category of ['gym', 'stretch', 'gym']) {
      await t.mutation(api.logs.create, {
        kind: 'workout',
        area: 'body',
        occurredAt: now,
        category,
      })
    }
    await t.mutation(api.logs.create, {
      kind: 'intake',
      area: 'body',
      occurredAt: now,
      category: 'supplements',
    })

    expect(await t.query(api.logs.categories, { kind: 'workout' })).toEqual([
      'gym',
      'stretch',
    ])
    expect(await t.query(api.logs.categories, { kind: 'intake' })).toEqual([
      'supplements',
    ])
  })

  test('another owner sees none of yours', async () => {
    /* ONE backend, two identities. Two convexTest() calls are two databases
       and would pass no matter what the query did. */
    const backend = convexTest(schema, modules)
    await backend
      .withIdentity({ tokenIdentifier: ME })
      .mutation(api.logs.create, {
        kind: 'workout',
        area: 'body',
        occurredAt: Date.now(),
        category: 'gym',
      })
    const theirs = await backend
      .withIdentity({ tokenIdentifier: SOMEONE_ELSE })
      .query(api.logs.categories, { kind: 'workout' })
    expect(theirs).toEqual([])
  })
})

describe('logs.listForArea — RecentBody reads through the index, not by filtering', () => {
  test('only the asked-for area, newest first', async () => {
    const t = as(ME)
    const now = Date.now()
    await t.mutation(api.logs.create, {
      kind: 'session',
      area: 'portuguese',
      occurredAt: now - 3000,
      value: 50,
    })
    await t.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: now - 2000,
    })
    await t.mutation(api.logs.create, {
      kind: 'intake',
      area: 'body',
      occurredAt: now - 1000,
      category: 'supplements',
    })

    const { rows } = await t.query(api.logs.listForArea, {
      area: 'body',
      since: now - 86_400_000,
    })
    expect(rows.map((r) => r.kind)).toEqual(['intake', 'workout'])
  })

  test('respects the window — a row before `since` is left out', async () => {
    const t = as(ME)
    const now = Date.now()
    await t.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: now - 10_000,
    })
    await t.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: now - 1000,
    })

    const { rows } = await t.query(api.logs.listForArea, {
      area: 'body',
      since: now - 5000,
    })
    expect(rows.length).toBe(1)
    expect(rows[0].occurredAt).toBe(now - 1000)
  })

  test('another owner sees none of yours', async () => {
    /* ONE backend, two identities — two convexTest() calls are two databases
       and would pass no matter what the query did. */
    const backend = convexTest(schema, modules)
    await backend
      .withIdentity({ tokenIdentifier: ME })
      .mutation(api.logs.create, {
        kind: 'workout',
        area: 'body',
        occurredAt: Date.now(),
      })
    const theirs = await backend
      .withIdentity({ tokenIdentifier: SOMEONE_ELSE })
      .query(api.logs.listForArea, { area: 'body', since: 0 })
    expect(theirs.rows).toEqual([])
  })

  test('a read that hits the row cap says so, and one that does not', async () => {
    const now = Date.now()

    /* One row over AREA_ROWS, written straight to the table — AREA_ROWS is
       sized for twelve weeks of real capture, so reaching it through
       logs.create would mean thousands of mutations for a fact this shows
       just as well with direct inserts (the same shortcut aggregate.test.ts
       takes for categoryDays' own row cap). */
    const overflowing = as(ME)
    await overflowing.run(async (ctx) => {
      for (let i = 0; i < 1501; i += 1) {
        await ctx.db.insert('logs', {
          ownerId: ME,
          kind: 'workout',
          area: 'body',
          occurredAt: now - i,
        })
      }
    })
    const full = await overflowing.query(api.logs.listForArea, {
      area: 'body',
      since: 0,
    })
    expect(full.complete).toBe(false)

    const under = as(ME)
    await under.mutation(api.logs.create, {
      kind: 'workout',
      area: 'body',
      occurredAt: now,
    })
    const partial = await under.query(api.logs.listForArea, {
      area: 'body',
      since: 0,
    })
    expect(partial.complete).toBe(true)
  })
})
