/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const FRIEND = 'https://clerk.test|user_friend'

/* R8 · S2, docs/specs/2026-10-26-first-run.md. */
function two() {
  const t = convexTest(schema, modules)
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    friend: t.withIdentity({ tokenIdentifier: FRIEND }),
  }
}

describe('who is asked the first run', () => {
  test('a new person is asked, on Lisbon until they answer', async () => {
    const { friend } = two()
    expect(await friend.query(api.profiles.mine, {})).toEqual({
      needsFirstRun: true,
      timezone: 'Europe/Lisbon',
    })
  })

  test('a person who has logged anything is never asked', async () => {
    const { t, me } = two()
    await t.run(async (ctx) => {
      await ctx.db.insert('logs', {
        ownerId: ME,
        kind: 'note',
        area: 'life',
        occurredAt: 1,
      })
    })
    expect((await me.query(api.profiles.mine, {})).needsFirstRun).toBe(false)
  })

  test("one person's log does not answer for another", async () => {
    const { t, friend } = two()
    await t.run(async (ctx) => {
      await ctx.db.insert('logs', {
        ownerId: ME,
        kind: 'note',
        area: 'life',
        occurredAt: 1,
      })
    })
    expect((await friend.query(api.profiles.mine, {})).needsFirstRun).toBe(true)
  })

  test('signed out is refused', async () => {
    const { t } = two()
    await expect(t.query(api.profiles.mine, {})).rejects.toThrow()
  })
})

describe('finishing the first run', () => {
  test('a language becomes a language area, the zone is kept', async () => {
    const { friend } = two()
    await friend.mutation(api.profiles.finishFirstRun, {
      lang: 'en',
      timezone: 'America/New_York',
    })
    expect(await friend.query(api.profiles.mine, {})).toEqual({
      needsFirstRun: false,
      timezone: 'America/New_York',
    })
    const areas = await friend.query(api.areas.list, {})
    expect(areas.map((a) => [a.slug, a.track, a.lang])).toEqual([
      ['english', 'language', 'en'],
    ])
  })

  test('NONE makes no area and still ends the first run', async () => {
    const { friend } = two()
    await friend.mutation(api.profiles.finishFirstRun, {
      lang: null,
      timezone: 'Europe/Berlin',
    })
    expect((await friend.query(api.profiles.mine, {})).needsFirstRun).toBe(
      false,
    )
    expect(await friend.query(api.areas.list, {})).toEqual([])
  })

  test('twice is one profile row and one area', async () => {
    const { t, friend } = two()
    for (let i = 0; i < 2; i++)
      await friend.mutation(api.profiles.finishFirstRun, {
        lang: 'de',
        timezone: 'Europe/Berlin',
      })
    const rows = await t.run(async (ctx) => ({
      profiles: await ctx.db.query('profiles').collect(),
      areas: await ctx.db.query('areas').collect(),
    }))
    expect(rows.profiles).toHaveLength(1)
    expect(rows.areas).toHaveLength(1)
  })

  test('an unknown language or zone is refused, nothing written', async () => {
    const { t, friend } = two()
    await expect(
      friend.mutation(api.profiles.finishFirstRun, {
        lang: 'xx',
        timezone: 'Europe/Lisbon',
      }),
    ).rejects.toThrow('NO_SUCH_LANGUAGE')
    await expect(
      friend.mutation(api.profiles.finishFirstRun, {
        lang: 'en',
        timezone: 'Mars/Olympus',
      }),
    ).rejects.toThrow('NO_SUCH_ZONE')
    const profiles = await t.run((ctx) => ctx.db.query('profiles').collect())
    expect(profiles).toEqual([])
  })

  test("a friend's answer is not mine", async () => {
    const { me, friend } = two()
    await friend.mutation(api.profiles.finishFirstRun, {
      lang: 'en',
      timezone: 'Asia/Tokyo',
    })
    expect(await me.query(api.profiles.mine, {})).toEqual({
      needsFirstRun: true,
      timezone: 'Europe/Lisbon',
    })
  })
})
