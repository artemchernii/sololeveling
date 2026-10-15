/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'

/* His MSFT on 14 Oct night: the × took a Trade Republic buy away for
   good. A removed trade is kept aside with its day of removal, and UNDO
   puts the same row back (mockup trade-remove.html). */
async function setup() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
      ibanTails: [],
      cardTails: [],
      order: 0,
    })
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId: ME,
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      exchange: 'NMS',
      currency: 'USD',
      type: 'EQUITY',
    })
    const row = {
      ownerId: ME,
      accountId,
      instrumentId,
      side: 'buy' as const,
      priceEur: 338.398526,
    }
    const kept = await ctx.db.insert('trades', {
      ...row,
      shares: 1.31940046,
      occurredAt: Date.UTC(2026, 5, 22, 12),
    })
    const tradeId = await ctx.db.insert('trades', {
      ...row,
      shares: 0.741729,
      occurredAt: Date.UTC(2026, 6, 1, 12),
    })
    return { accountId, instrumentId, tradeId, kept }
  })
  return { t, ...ids, me: t.withIdentity({ tokenIdentifier: ME }) }
}

test('remove keeps the trade aside; the position no longer counts it', async () => {
  const { t, me, accountId, instrumentId, tradeId } = await setup()
  await me.mutation(api.invest.removeTrade, { tradeId })

  const left = await me.query(api.invest.trades, { accountId, instrumentId })
  expect(left.map((r) => r.shares)).toEqual([1.31940046])
  const removed = await me.query(api.invest.removedTrades, {
    instrumentIds: [instrumentId],
  })
  expect(removed).toHaveLength(1)
  expect(removed[0]).toMatchObject({ shares: 0.741729, side: 'buy' })
  expect(removed[0].removedAt).toBeGreaterThan(0)
  const held = await t.run(async (ctx) =>
    (await ctx.db.query('trades').collect()).reduce((s, r) => s + r.shares, 0),
  )
  expect(held).toBeCloseTo(1.31940046, 8)
})

test('undo puts the same trade back, and nothing stays aside', async () => {
  const { me, accountId, instrumentId, tradeId } = await setup()
  await me.mutation(api.invest.removeTrade, { tradeId })
  const [gone] = await me.query(api.invest.removedTrades, {
    instrumentIds: [instrumentId],
  })
  await me.mutation(api.invest.restoreTrade, { removedId: gone._id })

  const back = await me.query(api.invest.trades, { accountId, instrumentId })
  expect(back.map((r) => r.shares)).toEqual([0.741729, 1.31940046])
  expect(back[0]).toMatchObject({
    side: 'buy',
    priceEur: 338.398526,
    occurredAt: Date.UTC(2026, 6, 1, 12),
  })
  expect(
    await me.query(api.invest.removedTrades, { instrumentIds: [instrumentId] }),
  ).toHaveLength(0)
})

test('another person can neither remove, see nor restore his trade', async () => {
  const { t, me, instrumentId, tradeId } = await setup()
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  await expect(
    other.mutation(api.invest.removeTrade, { tradeId }),
  ).rejects.toThrow()
  await me.mutation(api.invest.removeTrade, { tradeId })
  expect(
    await other.query(api.invest.removedTrades, {
      instrumentIds: [instrumentId],
    }),
  ).toHaveLength(0)
  const [gone] = await me.query(api.invest.removedTrades, {
    instrumentIds: [instrumentId],
  })
  await expect(
    other.mutation(api.invest.restoreTrade, { removedId: gone._id }),
  ).rejects.toThrow()
  expect(
    await me.query(api.invest.removedTrades, { instrumentIds: [instrumentId] }),
  ).toHaveLength(1)
})
