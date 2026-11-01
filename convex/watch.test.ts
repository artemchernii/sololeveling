/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

/* The watchlist (spec docs/specs/2026-11-01-watchlist.md). */

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const FRIEND = 'https://clerk.test|user_friend'
const DAY = 86_400_000
const T0 = Date.UTC(2026, 9, 26, 21)

type Backend = ReturnType<typeof convexTest>

const amd = { symbol: 'AMD', name: 'Advanced Micro Devices', exchange: 'NMS', type: 'EQUITY' }

/** A name already known with closes, as the nightly check stores them. */
async function closes(t: Backend, prices: Array<number>) {
  return await t.run(async (ctx) => {
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId: ME,
      ...amd,
      currency: 'USD',
    })
    for (const [i, price] of prices.entries())
      await ctx.db.insert('prices', {
        ownerId: ME,
        instrumentId,
        price,
        currency: 'USD',
        asOf: T0 + i * DAY,
        fetchedAt: T0 + i * DAY,
        source: 'Yahoo Finance',
      })
    return instrumentId
  })
}

test('★ adds once, the list has it with its closes, nobody else sees it', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const friend = t.withIdentity({ tokenIdentifier: FRIEND })
  const id = await closes(t, [140, 141.2])
  expect(await me.query(api.watch.list, {})).toEqual([])

  expect(await me.mutation(api.watch.add, { candidate: amd })).toBe(id)
  await me.mutation(api.watch.add, { candidate: amd })
  const list = await me.query(api.watch.list, {})
  expect(list).toHaveLength(1)
  expect(list[0]).toMatchObject({ symbol: 'AMD', alert: null, hit: null })
  expect(list[0].closes.map((c) => c.price)).toEqual([141.2, 140])
  expect(await friend.query(api.watch.list, {})).toEqual([])
  expect(await t.query(internal.watch.ids, { ownerId: ME })).toEqual([id])
})

test('a new ticker becomes an instrument; the 21st is refused WATCH_FULL', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  for (let i = 0; i < 20; i++)
    await me.mutation(api.watch.add, {
      candidate: { ...amd, symbol: `T${i}`, name: `Name ${i}` },
    })
  expect(await me.query(api.watch.list, {})).toHaveLength(20)
  await expect(
    me.mutation(api.watch.add, { candidate: { ...amd, symbol: 'X21' } }),
  ).rejects.toThrow(/WATCH_FULL/)
  expect(await me.query(api.watch.list, {})).toHaveLength(20)
})

test('★ again takes it off; its closes stay', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const id = await closes(t, [140])
  await me.mutation(api.watch.add, { candidate: amd })
  await me.mutation(api.watch.remove, { instrumentId: id })
  expect(await me.query(api.watch.list, {})).toEqual([])
  const kept = await t.run((ctx) => ctx.db.query('prices').collect())
  expect(kept).toHaveLength(1)
})

test('🔔 above the price waits for a rise, below for a fall; a bad price is refused', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const friend = t.withIdentity({ tokenIdentifier: FRIEND })
  const id = await closes(t, [141.2])
  await me.mutation(api.watch.add, { candidate: amd })
  expect(await me.mutation(api.watch.setAlert, { instrumentId: id, at: 150 })).toBe('up')
  expect(await me.mutation(api.watch.setAlert, { instrumentId: id, at: 120 })).toBe('down')
  await expect(
    me.mutation(api.watch.setAlert, { instrumentId: id, at: -1 }),
  ).rejects.toThrow(/WATCH_PRICE/)
  await expect(
    friend.mutation(api.watch.setAlert, { instrumentId: id, at: 150 }),
  ).rejects.toThrow(/NOT_WATCHED/)
  await me.mutation(api.watch.clearAlert, { instrumentId: id })
  expect((await me.query(api.watch.list, {}))[0].alert).toBeNull()
})

test('a close past the alert rings once, with the close before', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const id = await closes(t, [58.4, 56.1])
  await me.mutation(api.watch.add, { candidate: amd })
  await me.mutation(api.watch.setAlert, { instrumentId: id, at: 55 })
  expect(await t.mutation(internal.watch.ringHits, { ownerId: ME })).toBe(0)

  await t.run((ctx) =>
    ctx.db.insert('prices', {
      ownerId: ME,
      instrumentId: id,
      price: 54.7,
      currency: 'USD',
      asOf: T0 + 2 * DAY,
      fetchedAt: T0 + 2 * DAY,
      source: 'Yahoo Finance',
    }),
  )
  expect(await t.mutation(internal.watch.ringHits, { ownerId: ME })).toBe(1)
  expect(await t.mutation(internal.watch.ringHits, { ownerId: ME })).toBe(0)
  const sent = await t.run((ctx) => ctx.db.query('notifications').collect())
  expect(sent).toHaveLength(1)
  expect(sent[0].kind).toBe('watch_hit')
  expect(sent[0].title).toContain('AMD · CLOSE $54.70 ≤ $55')
  expect(sent[0].body).toContain('PREV CLOSE $56.10')
  expect((await me.query(api.watch.list, {}))[0].hit).toMatchObject({
    price: 54.7,
  })
})
