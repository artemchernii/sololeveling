/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import {
  GUEST_CAP_USD,
  capFor,
  chargeGuest,
  guestAtCap,
  refuseGuest,
} from './profiles'
import schema from './schema'
import { monthKey } from '../src/lib/marketRead'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const FRIEND = 'https://clerk.test|user_friend'

/* R8 · S4 (docs/specs/2026-10-27-guest-ai-cap.md): money AI closed to
   guests, $0.50 a month per guest, Artem unchanged. */
async function world() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const friend = t.withIdentity({ tokenIdentifier: FRIEND })
  await friend.mutation(api.profiles.finishFirstRun, {
    lang: 'en',
    timezone: 'Europe/Lisbon',
  })
  return { t, me, friend }
}

describe('the cap', () => {
  test('a guest gets $0.50, Artem keeps $2', async () => {
    const { t, me, friend } = await world()
    const month = monthKey(Date.now())
    expect(await friend.query(api.rowsAsk.spend, { month })).toEqual({
      spent: 0,
      cap: GUEST_CAP_USD,
    })
    expect((await me.query(api.rowsAsk.spend, { month })).cap).toBe(2)
    expect(await t.run((ctx) => capFor(ctx, FRIEND))).toBe(0.5)
  })

  test("a guest's sheet and week reads fill the pot; at $0.50 the next is refused", async () => {
    const { t } = await world()
    await t.run(async (ctx) => {
      /* At Sonnet's $2 in and $10 out a million: 150k in and 20k out is
         $0.50, the whole pot. */
      await chargeGuest(ctx, FRIEND, {
        inputTokens: 150_000,
        outputTokens: 20_000,
      })
    })
    expect(await t.run((ctx) => guestAtCap(ctx, FRIEND))).toBe(true)
  })

  test("Artem's reads are not counted and never refused", async () => {
    const { t } = await world()
    await t.run(async (ctx) => {
      await chargeGuest(ctx, ME, { inputTokens: 900_000, outputTokens: 1 })
    })
    const rows = await t.run((ctx) =>
      ctx.db
        .query('aiSpend')
        .withIndex('by_owner_month', (q) => q.eq('ownerId', ME))
        .collect(),
    )
    expect(rows).toEqual([])
    expect(await t.run((ctx) => guestAtCap(ctx, ME))).toBe(false)
  })
})

describe('money AI', () => {
  test('refused for a guest, open for Artem', async () => {
    const { t } = await world()
    await expect(t.run((ctx) => refuseGuest(ctx, FRIEND))).rejects.toThrow(
      'NOT_FOR_GUESTS',
    )
    await t.run((ctx) => refuseGuest(ctx, ME))
  })
})
