/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'

/* A whole trading history (his Revolut export, 3,595 trades since 2020)
   goes in through update all, like every other file (9 Oct, "go use
   bulk"). Fake timers so no scheduled reading reaches the model. */
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 9, 12) })
})
afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const t = convexTest(schema, modules)
  return { t, me: t.withIdentity({ tokenIdentifier: ME }) }
}

type T = ReturnType<typeof setup>['t']
type Me = ReturnType<typeof setup>['me']

const DAY = 86_400_000
const START = new Date(2020, 2, 2, 15).getTime()

const AAPL = {
  symbol: 'AAPL',
  name: 'Apple Inc.',
  exchange: 'NMS',
  type: 'EQUITY',
}
const TSLA = {
  symbol: 'TSLA',
  name: 'Tesla, Inc.',
  exchange: 'NMS',
  type: 'EQUITY',
}

type Row = {
  occurredAt: number
  name: string
  side: 'buy' | 'sell' | 'split'
  shares: number
  price: number
  currency: string
}

const buy = (i: number, name = 'AAPL', shares = 0.5): Row => ({
  occurredAt: START + i * DAY,
  name,
  side: 'buy',
  shares,
  price: 100,
  currency: 'USD',
})

async function revolut(t: T, me: Me) {
  const accountId = await me.mutation(api.accounts.create, {
    name: 'Revolut',
    kinds: ['bank', 'broker'],
    currencies: ['EUR'],
  })
  await t.run(async (ctx) => {
    await ctx.db.insert('fxRates', {
      ownerId: ME,
      currency: 'USD',
      rate: 0.9,
      asOf: START - 30 * DAY,
      fetchedAt: START,
      source: 'ECB via Frankfurter',
    })
  })
  return accountId
}

async function openBatch(t: T) {
  return await t.run((ctx) =>
    ctx.db.insert('batches', {
      ownerId: ME,
      status: 'open',
      leftOut: [],
      quietMonths: [],
      moves: [],
      extras: [],
      dismissed: [],
    }),
  )
}

/* The history as the reader leaves it: ready, its rows in intakeTrades,
   and each name's ticker found once. */
async function history(
  t: T,
  batchId: Id<'batches'>,
  rows: Array<Row>,
  found: Array<{ name: string; candidates: Array<typeof AAPL> }> = [
    { name: 'AAPL', candidates: [AAPL] },
    { name: 'TSLA', candidates: [TSLA] },
  ],
) {
  return await t.run(async (ctx) => {
    const intakeId = await ctx.db.insert('intakes', {
      ownerId: ME,
      batchId,
      storageIds: [],
      status: 'ready',
      kind: 'trades',
      title: 'Revolut · trades · Mar 2020 → Oct 2026',
      institution: 'Revolut',
      files: [
        { name: 'trading-account.csv', size: 1, contentType: 'text/csv' },
      ],
      trades: [],
      historyTrades: rows.length,
      historyTickers: new Set(rows.map((r) => r.name)).size,
      historyFound: found.map((f) => ({ ...f, preferred: 0 })),
    })
    for (const r of rows)
      await ctx.db.insert('intakeTrades', { ...r, ownerId: ME, intakeId })
    return intakeId
  })
}

async function apply(t: T, me: Me, batchId: Id<'batches'>) {
  await me.mutation(api.intake.applyBatch, {
    batchId,
    dayStart: new Date(2026, 9, 9).getTime(),
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  return await me.query(api.intake.batch, { batchId })
}

const tradesOf = (t: T) => t.run((ctx) => ctx.db.query('trades').collect())

describe('a trading history through update all', () => {
  test('every row lands, a chunk at a time; splits at no cost; no cash moves; the update finishes', async () => {
    const { t, me } = setup()
    const accountId = await revolut(t, me)
    const batchId = await openBatch(t)
    const rows: Array<Row> = [
      ...Array.from({ length: 450 }, (_, i) => buy(i)),
      {
        occurredAt: START + 460 * DAY,
        name: 'AAPL',
        side: 'split',
        shares: 225,
        price: 0,
        currency: 'EUR',
      },
      { ...buy(470), side: 'sell', shares: 10 },
      buy(480, 'TSLA', 2),
    ]
    const intakeId = await history(t, batchId, rows)

    const view = await apply(t, me, batchId)
    expect(view.status).toBe('done')
    expect(view.applied).toMatchObject({ intakes: 1, rows: 453, accounts: 1 })

    const trades = await tradesOf(t)
    expect(trades).toHaveLength(453)
    expect(trades.every((x) => x.accountId === accountId)).toBe(true)
    expect(trades.every((x) => x.noCash === true)).toBe(true)
    expect(trades.every((x) => x.importId === intakeId)).toBe(true)
    const split = trades.filter((x) => x.split === true)
    expect(split).toHaveLength(1)
    expect(split[0]).toMatchObject({ side: 'buy', shares: 225, priceEur: 0 })
    /* That day's stored rate: $100 → €90. */
    expect(trades.find((x) => !x.split)?.priceEur).toBe(90)

    const intake = await t.run((ctx) => ctx.db.get(intakeId))
    expect(intake?.status).toBe('done')

    const pos = await me.query(api.aggregate.positions, {})
    const shares = Object.fromEntries(pos.rows.map((p) => [p.symbol, p.shares]))
    expect(shares).toEqual({ AAPL: 450 * 0.5 + 225 - 10, TSLA: 2 })
    /* Revolut's cash is what its statements say — never these trades. */
    const bal = await me.query(api.aggregate.balances, {})
    expect(
      bal.accounts.find((a) => a.accountId === accountId)?.cashEur ?? 0,
    ).toBe(0)
  })

  test('the same history again adds nothing', async () => {
    const { t, me } = setup()
    await revolut(t, me)
    const rows = Array.from({ length: 30 }, (_, i) => buy(i))
    await history(t, await openBatch(t), rows)
    await apply(t, me, (await me.query(api.intake.openBatch, {}))!)
    expect(await tradesOf(t)).toHaveLength(30)

    const again = await openBatch(t)
    await history(t, again, rows)
    const view = await apply(t, me, again)
    expect(view.status).toBe('done')
    expect(view.applied).toMatchObject({ intakes: 1, rows: 0 })
    expect(await tradesOf(t)).toHaveLength(30)
  })

  test('a trade a statement already brought in is skipped, not doubled', async () => {
    const { t, me } = setup()
    const accountId = await revolut(t, me)
    await t.run(async (ctx) => {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId: ME,
        symbol: 'AAPL',
        name: 'Apple Inc.',
        exchange: 'NMS',
        type: 'EQUITY',
        currency: 'USD',
      })
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId,
        instrumentId,
        side: 'buy',
        shares: 0.5,
        priceEur: 90,
        occurredAt: START + 3 * DAY,
      })
    })
    const batchId = await openBatch(t)
    await history(
      t,
      batchId,
      Array.from({ length: 5 }, (_, i) => buy(i)),
    )
    const view = await apply(t, me, batchId)
    expect(view.applied).toMatchObject({ rows: 4 })
    expect(await tradesOf(t)).toHaveLength(5)
  })

  test('a name with no ticker found is left out and said, never guessed', async () => {
    const { t, me } = setup()
    await revolut(t, me)
    const batchId = await openBatch(t)
    const intakeId = await history(
      t,
      batchId,
      [buy(0), buy(1, 'XYZQ', 3), buy(2, 'XYZQ', 1)],
      [
        { name: 'AAPL', candidates: [AAPL] },
        { name: 'XYZQ', candidates: [] },
      ],
    )
    const view = await apply(t, me, batchId)
    expect(view.status).toBe('done')
    expect(view.applied).toMatchObject({ rows: 1 })
    const intake = await t.run((ctx) => ctx.db.get(intakeId))
    expect(intake?.status).toBe('done')
    expect(intake?.note).toContain('2 trades of XYZQ')
  })
})

describe('a history dropped on its own', () => {
  test('joins the update that is open, so it opens on the update-all screen', async () => {
    const { t, me } = setup()
    const batchId = await openBatch(t)
    const intakeId = await t.run((ctx) =>
      ctx.db.insert('intakes', {
        ownerId: ME,
        storageIds: [],
        status: 'reading',
        readingSince: Date.now(),
      }),
    )
    await t.mutation(internal.intake.finish, {
      intakeId,
      kind: 'trades',
      title: 'Revolut · trades',
      trades: [],
      positions: undefined,
      historyTrades: 2,
      historyTickers: 1,
      historyFound: [{ name: 'AAPL', candidates: [AAPL], preferred: 0 }],
    })
    const intake = await t.run((ctx) => ctx.db.get(intakeId))
    expect(intake?.batchId).toBe(batchId)
    expect(await me.query(api.intake.openBatch, {})).toBe(batchId)
  })

  test('starts an update of its own when none is open', async () => {
    const { t, me } = setup()
    const intakeId = await t.run((ctx) =>
      ctx.db.insert('intakes', {
        ownerId: ME,
        storageIds: [],
        status: 'reading',
        readingSince: Date.now(),
      }),
    )
    await t.mutation(internal.intake.finish, {
      intakeId,
      kind: 'trades',
      title: 'Revolut · trades',
      trades: [],
      positions: undefined,
      historyTrades: 2,
      historyTickers: 1,
    })
    const intake = await t.run((ctx) => ctx.db.get(intakeId))
    expect(intake?.batchId).toBeDefined()
    expect(await me.query(api.intake.openBatch, {})).toBe(intake?.batchId)
  })
})

describe('a history read by the reader before 9 Oct', () => {
  test('is read again, once; a ready statement is still refused', async () => {
    const { t, me } = setup()
    const file = await t.run((ctx) =>
      ctx.storage.store(new Blob(['csv'], { type: 'text/csv' })),
    )
    const [old, statement] = await t.run(async (ctx) => [
      await ctx.db.insert('intakes', {
        ownerId: ME,
        storageIds: [file],
        status: 'ready',
        kind: 'trades',
        trades: [],
        historyTrades: 3595,
      }),
      await ctx.db.insert('intakes', {
        ownerId: ME,
        storageIds: [file],
        status: 'ready',
        kind: 'transactions',
        transactions: [],
      }),
    ])
    await me.mutation(api.intake.retry, { intakeId: old })
    expect((await t.run((ctx) => ctx.db.get(old)))?.status).toBe('reading')
    await expect(
      me.mutation(api.intake.retry, { intakeId: statement }),
    ).rejects.toThrow('That one is not stuck.')
  })
})
