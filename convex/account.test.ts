/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const FRIEND = 'https://clerk.test|user_friend'

/* R8 · S3b, docs/specs/2026-10-27-delete-account.md. */

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

async function world() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const friend = t.withIdentity({ tokenIdentifier: FRIEND })
  await friend.mutation(api.profiles.finishFirstRun, {
    lang: 'en',
    timezone: 'Europe/Lisbon',
  })
  await t.run(async (ctx) => {
    for (const ownerId of [ME, FRIEND]) {
      /* More than one run's batch, so the wipe has to come back. */
      for (let i = 0; i < 320; i++)
        await ctx.db.insert('logs', {
          ownerId,
          kind: 'note',
          area: 'life',
          occurredAt: i,
        })
      await ctx.db.insert('tasks', {
        ownerId,
        title: 'Run',
        priority: 1,
        status: 'open',
      })
      const storageId = await ctx.storage.store(new Blob([ownerId]))
      await ctx.db.insert('attachments', {
        ownerId,
        storageId,
        name: 'a.txt',
        contentType: 'text/plain',
        size: 1,
      })
    }
  })
  return { t, me, friend }
}

describe('what the button would delete', () => {
  test('a guest sees their rows and files, profile and area included', async () => {
    const { friend } = await world()
    expect(await friend.query(api.account.counts, {})).toEqual({
      guest: true,
      rows: 320 + 1 + 1 + 1 + 1,
      files: 1,
      more: false,
    })
  })

  test('Artem is not a guest and nothing is counted', async () => {
    const { me } = await world()
    expect(await me.query(api.account.counts, {})).toEqual({
      guest: false,
      rows: 0,
      files: 0,
      more: false,
    })
  })
})

describe('DELETE ALL', () => {
  test("a guest's rows and files are gone; Artem's are all there", async () => {
    const { t, friend } = await world()
    await friend.mutation(api.account.deleteAll, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const left = await t.run(async (ctx) => {
      const of = async (ownerId: string) => ({
        logs: (
          await ctx.db
            .query('logs')
            .withIndex('by_owner_time', (q) => q.eq('ownerId', ownerId))
            .collect()
        ).length,
        tasks: (
          await ctx.db
            .query('tasks')
            .withIndex('by_owner_status', (q) => q.eq('ownerId', ownerId))
            .collect()
        ).length,
        attachments: (
          await ctx.db
            .query('attachments')
            .withIndex('by_owner_note', (q) => q.eq('ownerId', ownerId))
            .collect()
        ).length,
        areas: (
          await ctx.db
            .query('areas')
            .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
            .collect()
        ).length,
        profiles: (
          await ctx.db
            .query('profiles')
            .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
            .collect()
        ).length,
      })
      return {
        friend: await of(FRIEND),
        me: await of(ME),
        files: (await ctx.db.system.query('_storage').collect()).length,
      }
    })
    expect(left.friend).toEqual({
      logs: 0,
      tasks: 0,
      attachments: 0,
      areas: 0,
      profiles: 0,
    })
    expect(left.me).toEqual({
      logs: 320,
      tasks: 1,
      attachments: 1,
      areas: 0,
      profiles: 0,
    })
    expect(left.files).toBe(1)
  })

  test('refused for Artem, nothing deleted', async () => {
    const { t, me } = await world()
    await expect(me.mutation(api.account.deleteAll, {})).rejects.toThrow(
      'NOT_A_GUEST',
    )
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const logs = await t.run((ctx) =>
      ctx.db
        .query('logs')
        .withIndex('by_owner_time', (q) => q.eq('ownerId', ME))
        .collect(),
    )
    expect(logs).toHaveLength(320)
  })

  test('refused signed out', async () => {
    const { t } = await world()
    await expect(t.mutation(api.account.deleteAll, {})).rejects.toThrow()
  })
})
