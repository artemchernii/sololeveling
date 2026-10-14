import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const at = (m: number, d: number) => Date.UTC(2026, m - 1, d, 12)
const GOLD = {
  symbol: 'IGLN.L',
  name: 'iShares Physical Gold',
  exchange: 'LSE',
  type: 'ETF',
}
const DIGITAL = {
  symbol: 'DGTL.L',
  name: 'iShares Digital Security',
  exchange: 'LSE',
  type: 'ETF',
}
const DAYS = [at(7, 31), at(8, 29), at(9, 30)]

/* His 14 Oct save: one file read as iShares Physical Gold. `onto` says
   which instrument each of its three trades was written under. */
async function setup(onto: Array<'gold' | 'digital'>) {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const ids = await t.run(async (ctx) => {
    const accountId = await ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'Trading 212',
      kinds: ['broker'],
      currencies: ['EUR'],
      order: 0,
    })
    const gold = await ctx.db.insert('instruments', {
      ownerId: ME,
      currency: 'EUR',
      ...GOLD,
    })
    const digital = await ctx.db.insert('instruments', {
      ownerId: ME,
      currency: 'EUR',
      ...DIGITAL,
    })
    const batchId = await ctx.db.insert('batches', {
      ownerId: ME,
      status: 'done',
      appliedAt: at(10, 14),
      leftOut: [],
      quietMonths: [],
      moves: [],
      extras: [],
      dismissed: [],
    })
    const intakeId = await ctx.db.insert('intakes', {
      ownerId: ME,
      batchId,
      accountId,
      storageIds: [],
      status: 'done',
      kind: 'trades',
      files: [{ name: 'IMG_9290.PNG', size: 1, contentType: 'image/png' }],
      trades: DAYS.map((occurredAt) => ({
        occurredAt,
        name: 'iShares Physical Gold',
        side: 'buy' as const,
        shares: 2,
        price: 60,
        currency: 'EUR',
        preferred: 0,
        candidates: [GOLD],
      })),
    })
    for (const [n, occurredAt] of DAYS.entries())
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId,
        instrumentId: onto[n] === 'gold' ? gold : digital,
        side: 'buy',
        shares: 2,
        priceEur: 60,
        occurredAt,
        importId: intakeId,
      })
    /* A buy of the same day saved by hand, by no file: not this save's. */
    await ctx.db.insert('trades', {
      ownerId: ME,
      accountId,
      instrumentId: gold,
      side: 'buy',
      shares: 1,
      priceEur: 60,
      occurredAt: DAYS[0],
    })
    return { batchId }
  })
  return { t, me, ...ids }
}

describe('buysLanded.batch', () => {
  test('every trade on the thing it was read as', async () => {
    const { me, batchId } = await setup(['gold', 'gold', 'gold'])
    expect(await me.query(api.buysLanded.batch, { batchId })).toEqual([
      { ...pick(GOLD), buys: 3, sells: 0 },
    ])
  })

  test('trades written under another instrument are counted there', async () => {
    const { me, batchId } = await setup(['digital', 'digital', 'gold'])
    const landed = await me.query(api.buysLanded.batch, { batchId })
    expect(landed).toHaveLength(2)
    expect(landed).toContainEqual({ ...pick(DIGITAL), buys: 2, sells: 0 })
    expect(landed).toContainEqual({ ...pick(GOLD), buys: 1, sells: 0 })
  })

  test('another owner reads nothing of the save', async () => {
    const { t, batchId } = await setup(['digital', 'digital', 'digital'])
    const other = t.withIdentity({ tokenIdentifier: OTHER })
    expect(await other.query(api.buysLanded.batch, { batchId })).toEqual([])
  })
})

function pick(i: typeof GOLD) {
  return { symbol: i.symbol, name: i.name, type: i.type }
}
