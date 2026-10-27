/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import { GUEST_CAP_USD, capFor, refuseGuest } from './profiles'
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

/* What seed:run writes for Artem, which no client can. */
async function seedPrinciples(t: ReturnType<typeof two>['t']) {
  await t.run((ctx) =>
    ctx.db.insert('principles', { ownerId: ME, text: 'P', sortOrder: 0 }),
  )
}

describe('who is asked the first run', () => {
  test('a new person is asked, on Lisbon until they answer', async () => {
    const { friend } = two()
    expect(await friend.query(api.profiles.mine, {})).toEqual({
      needsFirstRun: true,
      guest: true,
      demo: false,
      timezone: 'Europe/Lisbon',
    })
  })

  test('Artem, whose principles the deploy key seeded, is never asked', async () => {
    const { t, me } = two()
    await seedPrinciples(t)
    expect(await me.query(api.profiles.mine, {})).toEqual({
      needsFirstRun: false,
      guest: false,
      demo: false,
      timezone: 'Europe/Lisbon',
    })
  })

  test('a guest who logged before GO is still asked', async () => {
    const { t, friend } = two()
    await t.run(async (ctx) => {
      await ctx.db.insert('logs', {
        ownerId: FRIEND,
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
      guest: true,
      demo: false,
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
    const { t, me, friend } = two()
    await seedPrinciples(t)
    await friend.mutation(api.profiles.finishFirstRun, {
      lang: 'en',
      timezone: 'Asia/Tokyo',
    })
    expect(await me.query(api.profiles.mine, {})).toEqual({
      needsFirstRun: false,
      guest: false,
      demo: false,
      timezone: 'Europe/Lisbon',
    })
  })
})

describe('a guest (R8 · S3a)', () => {
  test('anyone not Artem is a guest, first run done or not', async () => {
    const { t, me, friend } = two()
    await seedPrinciples(t)
    expect((await friend.query(api.profiles.mine, {})).guest).toBe(true)
    await friend.mutation(api.profiles.finishFirstRun, {
      lang: null,
      timezone: 'Europe/Lisbon',
    })
    expect((await friend.query(api.profiles.mine, {})).guest).toBe(true)
    expect((await me.query(api.profiles.mine, {})).guest).toBe(false)
  })

  test('a sign-up who never pressed GO is refused money AI and gets the guest cap', async () => {
    const { t } = two()
    await expect(t.run((ctx) => refuseGuest(ctx, FRIEND))).rejects.toThrow(
      'NOT_FOR_GUESTS',
    )
    expect(await t.run((ctx) => capFor(ctx, FRIEND))).toBe(GUEST_CAP_USD)
  })

  test('the test backend stand-in for Artem is past the first run, not a guest', async () => {
    const { t, me } = two()
    await t.run(async (ctx) => {
      await ctx.db.insert('profiles', {
        ownerId: ME,
        timezone: 'Europe/Lisbon',
        firstRunAt: 1,
        asOwner: true,
      })
    })
    expect(await me.query(api.profiles.mine, {})).toEqual({
      needsFirstRun: false,
      guest: false,
      demo: false,
      timezone: 'Europe/Lisbon',
    })
  })
})
