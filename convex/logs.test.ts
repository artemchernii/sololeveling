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
