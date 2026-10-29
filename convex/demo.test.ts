/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const DEMO = 'https://clerk.test|user_demo'

/* The demo account, docs/specs/2026-10-27-demo-account.md (D5–D8). */

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-27T15:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

async function world() {
  const t = convexTest(schema, modules)
  await t.run((ctx) =>
    ctx.db.insert('principles', { ownerId: ME, text: 'P', sortOrder: 0 }),
  )
  await t.mutation(internal.demo.make, { ownerId: DEMO })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    demo: t.withIdentity({ tokenIdentifier: DEMO }),
  }
}

const count = (
  t: ReturnType<typeof convexTest>,
  ownerId: string,
  table: 'logs' | 'tasks' | 'trades' | 'accounts' | 'principles',
) =>
  t.run(async (ctx) => {
    const index = {
      logs: 'by_owner_time',
      tasks: 'by_owner_status',
      trades: 'by_owner_time',
      accounts: 'by_owner_order',
      principles: 'by_owner_order',
    }[table]
    return (
      await ctx.db
        .query(table)
        .withIndex(
          index as never,
          (q) =>
            (q as unknown as { eq: (f: string, v: string) => unknown }).eq(
              'ownerId',
              ownerId,
            ) as never,
        )
        .collect()
    ).length
  })

describe('demo account', () => {
  test('D5 make fills every room, twice gives the same, never principles', async () => {
    const { t, demo } = await world()
    const first = {
      logs: await count(t, DEMO, 'logs'),
      tasks: await count(t, DEMO, 'tasks'),
      trades: await count(t, DEMO, 'trades'),
      accounts: await count(t, DEMO, 'accounts'),
    }
    expect(first.logs).toBeGreaterThan(150)
    expect(first.tasks).toBe(6)
    expect(first.accounts).toBe(3)
    expect(first.trades).toBeGreaterThan(5)
    expect(await count(t, DEMO, 'principles')).toBe(0)

    await t.mutation(internal.demo.refill, { ownerId: DEMO })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await count(t, DEMO, 'logs')).toBe(first.logs)
    expect(await count(t, DEMO, 'tasks')).toBe(first.tasks)

    const mine = await demo.query(api.profiles.mine, {})
    expect(mine).toMatchObject({ demo: true, guest: false })
    expect(mine.needsFirstRun).toBe(false)
  })

  test('D5 three picked for today, one ticked', async () => {
    const { t } = await world()
    const today = await t.run((ctx) =>
      ctx.db
        .query('tasks')
        .withIndex('by_owner_today', (q) =>
          q.eq('ownerId', DEMO).eq('todayFor', '2026-10-27'),
        )
        .collect(),
    )
    expect(today).toHaveLength(3)
    expect(today.filter((x) => x.status === 'done')).toHaveLength(1)
  })

  test('D7 every write is refused for the demo account', async () => {
    const { t, demo } = await world()
    await expect(
      demo.mutation(api.tasks.create, { title: 'x' }),
    ).rejects.toThrow(/DEMO_READ_ONLY/)
    await expect(
      demo.mutation(api.logs.create, {
        kind: 'workout',
        area: 'body',
        value: 60,
        occurredAt: Date.now(),
      } as never),
    ).rejects.toThrow(/DEMO_READ_ONLY/)
    await expect(demo.mutation(api.account.deleteAll, {})).rejects.toThrow(
      /DEMO_READ_ONLY/,
    )
    await expect(
      demo.action(api.ai.ask.ask, { question: 'x', facts: [] }),
    ).rejects.toThrow(/DEMO_NO_AI/)
    /* Nothing changed. */
    expect(await count(t, DEMO, 'tasks')).toBe(6)
  })

  test('D7 areas.ensure and freshen stay open', async () => {
    const { demo } = await world()
    await demo.mutation(api.areas.ensure, {})
    expect(await demo.mutation(api.demo.freshen, {})).toBe('fresh')
  })

  test('D6 filled yesterday → open refills with today', async () => {
    const { t, demo } = await world()
    vi.setSystemTime(new Date('2026-10-28T09:00:00Z'))
    expect(await demo.mutation(api.demo.freshen, {})).toBe('refilling')
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const picked = await t.run((ctx) =>
      ctx.db
        .query('tasks')
        .withIndex('by_owner_today', (q) =>
          q.eq('ownerId', DEMO).eq('todayFor', '2026-10-28'),
        )
        .collect(),
    )
    expect(picked).toHaveLength(3)
    expect(await demo.mutation(api.demo.freshen, {})).toBe('fresh')
  })

  test('D8 Artem is untouched: still owner, writes, never made demo', async () => {
    const { t, me } = await world()
    expect(await me.query(api.profiles.mine, {})).toMatchObject({
      demo: false,
      guest: false,
    })
    await me.mutation(api.tasks.create, { title: 'mine' })
    expect(await me.mutation(api.demo.freshen, {})).toBe('not_demo')
    await expect(
      t.mutation(internal.demo.make, { ownerId: ME }),
    ).rejects.toThrow(/THIS_IS_ARTEM/)
    await expect(
      t.mutation(internal.demo.refill, { ownerId: ME }),
    ).rejects.toThrow(/NOT_DEMO/)
    expect(await count(t, ME, 'principles')).toBe(1)
  })
})
