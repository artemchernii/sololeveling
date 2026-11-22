/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const ME = 'https://clerk.test|user_me'
const FRI_CLOSE = Date.UTC(2026, 10, 20, 21)
const SUN = Date.UTC(2026, 10, 22, 13)
const DAY_START = Date.UTC(2026, 10, 22)

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(SUN + 3_600_000) })
})
afterEach(() => {
  vi.useRealTimers()
})

/* His update of 22 Nov, as it stood (made-up amounts): the trades hold
   GOOG, RHM.DE and NVDA; the Net Worth PDF reads GOOGL, RHM.F and NVDA
   with Trade Republic's values; a first apply had saved GOOGL and RHM.F
   as positions of their own. Dropped again, every position is valued at
   the file's value and nothing is counted twice. */
const HELD: Array<[string, string, string, number, number]> = [
  // trades' ticker, file's ticker, name, shares, file's value
  ['GOOG', 'GOOGL', 'Alphabet Inc.', 2, 480.5],
  ['RHM.DE', 'RHM.F', 'Rheinmetall AG', 0.2, 130.25],
  ['NVDA', 'NVDA', 'NVIDIA Corp.', 5, 610.75],
]

test('the Net Worth PDF dropped again: each position at its value, none twice', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const tr = await me.mutation(api.accounts.create, {
    name: 'Trade Republic',
    kinds: ['broker'],
    currencies: ['EUR'],
  })
  const batchId = await t.run(async (ctx) => {
    await ctx.db.insert('fxRates', {
      ownerId: ME,
      currency: 'USD',
      rate: 0.9,
      asOf: Date.UTC(2026, 10, 20),
      fetchedAt: FRI_CLOSE,
      source: 'ECB',
    })
    const first = await ctx.db.insert('intakes', {
      ownerId: ME,
      storageIds: [],
      status: 'done',
      kind: 'holdings',
      title: 'Net Worth',
    })
    for (const [symbol, fileSymbol, name, shares] of HELD) {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId: ME,
        symbol,
        name,
        type: 'EQUITY',
        currency: symbol === 'RHM.DE' ? 'EUR' : 'USD',
        exchange: 'X',
      })
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId: tr,
        instrumentId,
        side: 'buy',
        shares,
        priceEur: 100,
        occurredAt: Date.UTC(2026, 9, 1),
      })
      await ctx.db.insert('prices', {
        ownerId: ME,
        instrumentId,
        price: 100,
        currency: symbol === 'RHM.DE' ? 'EUR' : 'USD',
        asOf: FRI_CLOSE,
        fetchedAt: FRI_CLOSE,
        source: 'Yahoo Finance',
      })
      if (fileSymbol !== symbol) {
        /* The first apply's copy on the file's own listing. */
        const wrong = await ctx.db.insert('instruments', {
          ownerId: ME,
          symbol: fileSymbol,
          name,
          type: 'EQUITY',
          currency: 'USD',
          exchange: 'Y',
        })
        await ctx.db.insert('holdings', {
          ownerId: ME,
          accountId: tr,
          instrumentId: wrong,
          shares,
          asOf: SUN - 600_000,
          importId: first,
        })
      }
    }
    const batchId = await ctx.db.insert('batches', {
      ownerId: ME,
      status: 'open',
      leftOut: [],
      quietMonths: [],
      moves: [],
      extras: [],
      dismissed: [],
    })
    await ctx.db.insert('intakes', {
      ownerId: ME,
      batchId,
      accountId: tr,
      storageIds: [],
      status: 'ready',
      kind: 'holdings',
      title: 'Net Worth',
      institution: 'Trade Republic',
      files: [
        { name: 'Net Worth.pdf', size: 1, contentType: 'application/pdf' },
      ],
      positions: HELD.map(([, fileSymbol, name, shares, valueEur]) => ({
        name,
        shares,
        valueEur,
        preferred: 0,
        candidates: [
          { symbol: fileSymbol, name, exchange: 'X', type: 'EQUITY' },
        ],
      })),
    })
    return batchId
  })
  await me.query(api.intake.batchReview, { batchId })
  await me.mutation(api.intake.applyBatch, { batchId, dayStart: DAY_START })
  for (let i = 0; i < 4; i++)
    await t.mutation(internal.intake.applyStep, {
      batchId,
      dayStart: DAY_START,
      names: [],
    })
  const pos = await me.query(api.aggregate.positions, {})
  expect(
    pos.rows.map((r) => [r.symbol, r.valueEur, r.statementAt !== null]).sort(),
  ).toEqual(
    [
      ['GOOG', 480.5, true],
      ['NVDA', 610.75, true],
      ['RHM.DE', 130.25, true],
    ].sort(),
  )
  expect(pos.totalEur).toBe(1221.5)
})
