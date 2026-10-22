/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { internal } from './_generated/api'
import schema from './schema'

/* N3 share alerts (spec docs/specs/2026-10-22-n3-investment-alerts.md). */

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const THEM = 'https://clerk.test|user_them'
const DAY = 86_400_000

const share = { symbol: 'MSFT', type: 'EQUITY', name: 'Microsoft Corporation' }
const big = {
  kind: 'big_day' as const,
  title: 'Microsoft ▲ 6%',
  body: '$449.50 · 21 Oct → $476.47 · 22 Oct',
  url: '/finances?room=portfolio&position=x',
  share,
}

async function msft(t: ReturnType<typeof convexTest>, ownerId: string) {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert('instruments', {
      ownerId,
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      exchange: 'NMS',
      currency: 'USD',
      type: 'EQUITY',
    })
    for (const ago of [3, 2, 1])
      await ctx.db.insert('prices', {
        ownerId,
        instrumentId: id,
        price: 400 + ago,
        currency: 'USD',
        asOf: Date.now() - ago * DAY,
        fetchedAt: Date.now(),
        source: 'Yahoo Finance',
      })
    return id
  })
}

test('S5 a run twice in a day → one bell row, with the company on it', async () => {
  const t = convexTest(schema, modules)
  expect(
    await t.mutation(internal.investAlerts.send, {
      ownerId: ME,
      alerts: [big],
    }),
  ).toBe(1)
  expect(
    await t.mutation(internal.investAlerts.send, {
      ownerId: ME,
      alerts: [big],
    }),
  ).toBe(0)
  const rows = await t.run((ctx) => ctx.db.query('notifications').collect())
  expect(rows).toHaveLength(1)
  expect(rows[0].kind).toBe('big_day')
  expect(rows[0].share).toEqual(share)
})

test('S6 another owner’s share never reaches mine', async () => {
  const t = convexTest(schema, modules)
  const theirs = await msft(t, THEM)
  expect(
    await t.query(internal.investAlerts.shareFacts, {
      ownerId: ME,
      id: theirs,
      now: Date.now(),
    }),
  ).toBeNull()
  const mine = await t.query(internal.investAlerts.shareFacts, {
    ownerId: THEM,
    id: theirs,
    now: Date.now(),
  })
  expect(mine?.closes.map((c) => c.price)).toEqual([403, 402, 401])
  expect(mine?.currency).toBe('USD')
})
