/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const DAY = 86_400_000

/* "Left out of the latest look" compares a holding with the latest file
   of its own kind (10 Oct: his gold file marked every Revolut coin "not
   on the latest screenshot"). */
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 10, 12) })
})
afterEach(() => {
  vi.useRealTimers()
})

async function revolut() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const accountId = await me.mutation(api.accounts.create, {
    name: 'Revolut',
    kinds: ['broker'],
    currencies: ['EUR'],
  })
  const look = (
    symbol: string,
    type: string,
    shares: number,
    asOf: number,
  ): Promise<Id<'holdings'>> =>
    t.run(async (ctx) => {
      const found = await ctx.db
        .query('instruments')
        .withIndex('by_owner_symbol', (q) =>
          q.eq('ownerId', ME).eq('symbol', symbol),
        )
        .first()
      const instrumentId =
        found?._id ??
        (await ctx.db.insert('instruments', {
          ownerId: ME,
          symbol,
          name: symbol,
          exchange: 'X',
          currency: 'USD',
          type,
        }))
      return await ctx.db.insert('holdings', {
        ownerId: ME,
        accountId,
        instrumentId,
        shares,
        asOf,
      })
    })
  return { me, look }
}

const notSeen = async (
  me: Awaited<ReturnType<typeof revolut>>['me'],
  symbol: string,
) =>
  (await me.query(api.aggregate.positions, {})).rows.find(
    (r) => r.symbol === symbol,
  )?.notSeen

test('a gold file does not mark the coins of the same account as gone', async () => {
  const { me, look } = await revolut()
  const oct4 = Date.now() - 6 * DAY
  await look('SOL-EUR', 'CRYPTOCURRENCY', 3, oct4)
  await look('ETH-EUR', 'CRYPTOCURRENCY', 0.5, oct4)
  await look('GC=F', 'FUTURE', 0.408365, Date.now())

  expect(await notSeen(me, 'SOL-EUR')).toBe(false)
  expect(await notSeen(me, 'ETH-EUR')).toBe(false)
  expect(await notSeen(me, 'GC=F')).toBe(false)
})

test('a coins file does not mark gold or shares as gone', async () => {
  const { me, look } = await revolut()
  const oct4 = Date.now() - 6 * DAY
  await look('GC=F', 'FUTURE', 0.4, oct4)
  await look('AMZN', 'EQUITY', 1.6, oct4)
  await look('SOL-EUR', 'CRYPTOCURRENCY', 3, Date.now())

  expect(await notSeen(me, 'GC=F')).toBe(false)
  expect(await notSeen(me, 'AMZN')).toBe(false)
})

test('a later coins file that leaves a coin out still marks it', async () => {
  const { me, look } = await revolut()
  await look('SOL-EUR', 'CRYPTOCURRENCY', 3, Date.now() - 6 * DAY)
  await look('ETH-EUR', 'CRYPTOCURRENCY', 0.5, Date.now() - 6 * DAY)
  await look('ETH-EUR', 'CRYPTOCURRENCY', 0.5, Date.now())

  expect(await notSeen(me, 'SOL-EUR')).toBe(true)
  expect(await notSeen(me, 'ETH-EUR')).toBe(false)
})
