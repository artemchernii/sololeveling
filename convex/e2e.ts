import { v } from 'convex/values'

import { mutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { TableNames } from './_generated/dataModel'
import { requireUser } from './auth'

/* Browser tests on mock data (docs/specs/2026-10-05-e2e-tests.md). Only
   the throwaway test backend on his Mac has E2E=1; his dev deployment and
   prod do not, so on them every function here refuses before it reads a
   row. Mock data is an exception to "Nothing is seeded" that Artem agreed
   on 5 Oct — in that test database only, never in his. */

function guard() {
  if (process.env.E2E !== '1')
    throw new Error('E2E functions run only on the test backend.')
}

const DAY = 86_400_000

/* Every table a test can write to. The test database is thrown away, so
   reset reads them whole — never allowed on a real one, which the guard
   makes sure of. */
const TABLES: Array<TableNames> = [
  'accounts',
  'stateSnapshots',
  'logs',
  'fxRates',
  'csvLayouts',
  'intakes',
  'intakeTrades',
  'batches',
  'merchantRules',
  'recurring',
  'trades',
  'payees',
]

async function wipe(ctx: MutationCtx) {
  for (const table of TABLES)
    for (const row of await ctx.db.query(table).collect())
      await ctx.db.delete(row._id)
}

/* Revolut's own export header, so a CSV of it is read by code alone —
   no paid reader in a test. */
export const REVOLUT_HEADER =
  'type|product|started date|completed date|description|amount|fee|currency|state|balance'

export const ACTIVO_HEADER = 'date|description|amount|balance'

/**
 * His accounts as they stand on a bad day: everything 8 days old, Revolut
 * holding EUR and USD, three rows of the coming CSV already in. `days`
 * are the local midnights of the four days before today, from the test,
 * so "8 days ago" and the CSV's dates are true whenever it runs.
 */
export const reset = mutation({
  args: { days: v.array(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    await wipe(ctx)
    const now = Date.now()
    const old = now - 8 * DAY

    const account = (
      name: string,
      kinds: Array<'bank' | 'broker' | 'cash'>,
      currencies: Array<string>,
      domain: string | undefined,
      order: number,
    ) =>
      ctx.db.insert('accounts', {
        ownerId,
        name,
        kinds,
        currencies,
        domain,
        ibanTails: [],
        cardTails: [],
        order,
      })
    const revolut = await account(
      'Revolut',
      ['bank', 'broker'],
      ['EUR', 'USD'],
      'revolut.com',
      0,
    )
    const activo = await account(
      'ActivoBank',
      ['bank'],
      ['EUR'],
      'activobank.pt',
      1,
    )
    const cash = await account('Cash', ['cash'], ['EUR'], undefined, 2)

    const balance = (id: typeof revolut, currency: string, value: number) =>
      ctx.db.insert('stateSnapshots', {
        ownerId,
        area: 'money',
        key: `balance:${id}:${currency}`,
        value,
        unit: currency.toLowerCase(),
        recordedAt: old,
        source: 'typed',
      })
    await balance(revolut, 'EUR', 1200)
    await balance(revolut, 'USD', 40)
    await balance(activo, 'EUR', 830.5)
    await balance(cash, 'EUR', 5000)
    await ctx.db.insert('fxRates', {
      ownerId,
      currency: 'USD',
      rate: 0.86,
      asOf: old,
      fetchedAt: old,
      source: 'test',
    })

    /* Three rows the CSV repeats — "already have". */
    const [d1, d2, d3] = args.days
    const spend = (at: number, merchant: string, value: number) =>
      ctx.db.insert('logs', {
        ownerId,
        area: 'money',
        kind: 'expense',
        occurredAt: at + 12 * 3_600_000,
        value,
        unit: 'eur',
        text: merchant,
        accountId: revolut,
        meta: { merchant, raw: merchant, category: 'eating out' },
      })
    await spend(d1, 'Guacamole', 13.05)
    await spend(d2, 'Bolt', 6.7)
    await spend(d3, 'Continente', 41.27)

    await ctx.db.insert('csvLayouts', {
      ownerId,
      headerKey: REVOLUT_HEADER,
      layout: {
        kind: 'transactions',
        institution: 'Revolut',
        dateColumn: 2,
        dateOrder: 'ymd',
        decimal: '.',
        descriptionColumn: 4,
        amountColumn: 5,
        feeColumn: 6,
        currencyColumn: 7,
        stateColumn: 8,
        balanceColumn: 9,
        pendingValues: ['PENDING'],
        skipValues: ['REVERTED', 'DECLINED', 'FAILED'],
        buyPrefixes: [],
        sellPrefixes: [],
        splitPrefixes: [],
      },
      updatedAt: now,
    })
    /* A second bank's export, so a bulk upload touches two accounts. */
    await ctx.db.insert('csvLayouts', {
      ownerId,
      headerKey: ACTIVO_HEADER,
      layout: {
        kind: 'transactions',
        institution: 'ActivoBank',
        currency: 'EUR',
        dateColumn: 0,
        dateOrder: 'ymd',
        decimal: '.',
        descriptionColumn: 1,
        amountColumn: 2,
        balanceColumn: 3,
        pendingValues: [],
        skipValues: [],
        buyPrefixes: [],
        sellPrefixes: [],
        splitPrefixes: [],
      },
      updatedAt: now,
    })
    return null
  },
})

/**
 * His salary, landed the day before the bad day's first row — so Spending
 * has a pay month to open. Its own call: in reset, Future balance would
 * show it coming and the empty "Nothing coming yet" would never be seen.
 */
export const paySalary = mutation({
  args: { day: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const revolut = (
      await ctx.db
        .query('accounts')
        .withIndex('by_owner_order', (q) => q.eq('ownerId', ownerId))
        .first()
    )?._id
    const salary = await ctx.db.insert('recurring', {
      ownerId,
      name: 'Acme Payroll',
      kind: 'income',
      amount: 2900,
      accountId: revolut,
      cadence: 'monthly',
      day: new Date(args.day).getDate(),
    })
    await ctx.db.insert('logs', {
      ownerId,
      area: 'money',
      kind: 'income',
      occurredAt: args.day + 9 * 3_600_000,
      value: 2900,
      unit: 'eur',
      text: 'Acme Payroll',
      accountId: revolut,
      meta: { raw: 'Acme Payroll', recurringId: salary },
    })
    return null
  },
})

/**
 * A Revolut crypto statement as the reader returns it — so the crypto
 * review can be pressed without paying for a reading (5 Oct: "add to
 * Revolut … WE STUCK AND IT LOOKED FROZEN").
 */
export const readCrypto = mutation({
  args: { days: v.array(v.number()) },
  returns: v.id('intakes'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const [d1, d2, d3, d4] = args.days
    const coin = (symbol: string) => [
      {
        symbol: `${symbol}-EUR`,
        name: symbol,
        exchange: 'CCC',
        type: 'CRYPTOCURRENCY',
      },
    ]
    const t = (
      at: number,
      name: string,
      side: 'buy' | 'sell' | 'reward',
      shares: number,
      price: number,
    ) => ({
      occurredAt: at + 12 * 3_600_000,
      name,
      side,
      shares,
      price,
      currency: 'EUR',
      fee: side === 'reward' ? undefined : 0.01,
      crypto: true,
      preferred: 0,
      candidates: coin(name),
    })
    return await ctx.db.insert('intakes', {
      ownerId,
      storageIds: [],
      status: 'ready',
      kind: 'trades',
      title: 'Revolut crypto statement',
      institution: 'Revolut',
      model: 'Claude Haiku 4.5',
      costUsd: 0.004,
      readAt: Date.now(),
      files: [
        {
          name: 'crypto-account-statement.pdf',
          size: 120_000,
          contentType: 'application/pdf',
        },
      ],
      trades: [
        t(d1, 'BTC', 'buy', 0.002, 52_000),
        t(d1, 'ETH', 'buy', 0.05, 2_300),
        t(d2, 'ADA', 'buy', 100, 0.42),
        t(d3, 'ADA', 'reward', 1.5, 0),
        t(d4, 'ETH', 'sell', 0.01, 2_400),
      ],
      positions: [
        { name: 'BTC', shares: 0.002, valueEur: 104, candidates: coin('BTC') },
        { name: 'ETH', shares: 0.04, valueEur: 96, candidates: coin('ETH') },
        { name: 'ADA', shares: 101.5, valueEur: 43, candidates: coin('ADA') },
      ],
    })
  },
})

/**
 * A Revolut Invest screenshot as the reader returns it: two shares and
 * the free cash — so the holdings review can be saved without paying for
 * a reading (5 Oct safety net).
 */
export const readHoldings = mutation({
  args: {},
  returns: v.id('intakes'),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const stock = (symbol: string, name: string) => [
      { symbol, name, exchange: 'NMS', type: 'EQUITY' },
    ]
    const now = Date.now()
    return await ctx.db.insert('intakes', {
      ownerId,
      storageIds: [],
      status: 'ready',
      kind: 'holdings',
      title: 'Revolut Invest screenshot',
      institution: 'Revolut',
      model: 'Claude Haiku 4.5',
      costUsd: 0.003,
      readAt: now,
      files: [
        { name: 'revolut-invest.png', size: 240_000, contentType: 'image/png' },
      ],
      positions: [
        {
          name: 'Apple',
          shares: 2,
          priceEur: 200,
          valueEur: 400,
          preferred: 0,
          todayPriceEur: 200,
          todayAsOf: now,
          candidates: stock('AAPL', 'Apple Inc.'),
        },
        {
          name: 'Microsoft',
          shares: 1,
          priceEur: 380,
          valueEur: 380,
          preferred: 0,
          todayPriceEur: 380,
          todayAsOf: now,
          candidates: stock('MSFT', 'Microsoft Corporation'),
        },
      ],
      cashEur: 120,
      totalEur: 900,
    })
  },
})

/**
 * A Revolut stock order history as the reader returns it: two buys and
 * a sell — so the trades review can be confirmed without paying for a
 * reading (5 Oct safety net).
 */
export const readTrades = mutation({
  args: { days: v.array(v.number()) },
  returns: v.id('intakes'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const [d1, d2, d3] = args.days
    const t = (
      at: number,
      name: string,
      symbol: string,
      side: 'buy' | 'sell',
      shares: number,
      price: number,
    ) => ({
      occurredAt: at + 15 * 3_600_000,
      name,
      side,
      shares,
      price,
      currency: 'EUR',
      fee: 0,
      preferred: 0,
      candidates: [{ symbol, name, exchange: 'NMS', type: 'EQUITY' }],
    })
    return await ctx.db.insert('intakes', {
      ownerId,
      storageIds: [],
      status: 'ready',
      kind: 'trades',
      title: 'Revolut stock orders',
      institution: 'Revolut',
      model: 'Claude Haiku 4.5',
      costUsd: 0.004,
      readAt: Date.now(),
      files: [
        {
          name: 'trading-account-statement.pdf',
          size: 90_000,
          contentType: 'application/pdf',
        },
      ],
      trades: [
        t(d1, 'Apple', 'AAPL', 'buy', 2, 200),
        t(d2, 'Microsoft', 'MSFT', 'buy', 1, 380),
        t(d3, 'Apple', 'AAPL', 'sell', 1, 210),
      ],
    })
  },
})

/* A whole trading history as the reader leaves it (9 Oct): its rows apart
   in intakeTrades, each ticker found once, in an update of its own. */
export const readHistory = mutation({
  args: { days: v.array(v.number()) },
  returns: v.id('batches'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    return await history(ctx, ownerId, args.days)
  },
})

async function history(ctx: MutationCtx, ownerId: string, days: Array<number>) {
  {
    const first = days[0] - 40 * DAY
    const batchId = await ctx.db.insert('batches', {
      ownerId,
      status: 'open',
      leftOut: [],
      quietMonths: [],
      moves: [],
      extras: [],
      dismissed: [],
    })
    const rows = [
      ...Array.from({ length: 30 }, (_, i) => ({
        occurredAt: first + i * DAY + 15 * 3_600_000,
        name: i % 3 === 0 ? 'MSFT' : 'AAPL',
        side: 'buy' as const,
        shares: 0.5,
        price: i % 3 === 0 ? 380 : 200,
        currency: 'EUR',
      })),
      {
        occurredAt: first + 31 * DAY,
        name: 'AAPL',
        side: 'split' as const,
        shares: 10,
        price: 0,
        currency: 'EUR',
      },
    ]
    const intakeId = await ctx.db.insert('intakes', {
      ownerId,
      batchId,
      storageIds: [],
      status: 'ready',
      kind: 'trades',
      title: 'Revolut · trades',
      institution: 'Revolut',
      model: 'its remembered columns',
      costUsd: 0,
      readAt: Date.now(),
      files: [
        { name: 'trading-account.csv', size: 4_000, contentType: 'text/csv' },
      ],
      trades: [],
      historyTrades: rows.length,
      historyTickers: 2,
      historyFound: [
        ['AAPL', 'Apple Inc.'],
        ['MSFT', 'Microsoft Corporation'],
      ].map(([symbol, name]) => ({
        name: symbol,
        preferred: 0,
        candidates: [{ symbol, name, exchange: 'NMS', type: 'EQUITY' }],
      })),
    })
    for (const r of rows)
      await ctx.db.insert('intakeTrades', { ...r, ownerId, intakeId })
    return batchId
  }
}

/* An update whose one file is still being read (10 Oct) — held there, so
   a test can try to close the window on it. */
export const holdRead = mutation({
  args: {},
  returns: v.id('batches'),
  handler: async (ctx) => {
    const ownerId = await requireUser(ctx)
    guard()
    const batchId = await ctx.db.insert('batches', {
      ownerId,
      status: 'open',
      leftOut: [],
      quietMonths: [],
      moves: [],
      extras: [],
      dismissed: [],
    })
    await ctx.db.insert('intakes', {
      ownerId,
      batchId,
      storageIds: [],
      status: 'reading',
      readingSince: Date.now(),
      progress: { stage: 'rows', rows: 12, have: 0, recent: [] },
      files: [
        {
          name: 'statement-sep.pdf',
          size: 90_000,
          contentType: 'application/pdf',
        },
      ],
    })
    return batchId
  },
})

const BLURRY = 'The picture is too blurry to read the numbers.'

/* The read held by holdRead comes back unreadable. */
export const failRead = mutation({
  args: { batchId: v.id('batches') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const intakes = await ctx.db
      .query('intakes')
      .withIndex('by_owner_batch', (q) =>
        q.eq('ownerId', ownerId).eq('batchId', args.batchId),
      )
      .collect()
    for (const i of intakes)
      if (i.status === 'reading')
        await ctx.db.patch(i._id, {
          status: 'failed',
          error: BLURRY,
          retryable: true,
          progress: undefined,
        })
    return null
  },
})

/* One more file in an update, read and found unreadable. */
export const badFile = mutation({
  args: { batchId: v.id('batches') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    await ctx.db.insert('intakes', {
      ownerId,
      batchId: args.batchId,
      storageIds: [],
      status: 'failed',
      error: BLURRY,
      retryable: true,
      files: [{ name: 'blurry.png', size: 240_000, contentType: 'image/png' }],
    })
    return null
  },
})

/* A save that stopped: the history's update left "applying", with nothing
   scheduled to carry it on. */
export const stuckApply = mutation({
  args: { days: v.array(v.number()) },
  returns: v.id('batches'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const batchId = await history(ctx, ownerId, args.days)
    await ctx.db.patch(batchId, {
      status: 'applying',
      applied: { intakes: 0, rows: 0, accounts: 1 },
    })
    return batchId
  },
})
