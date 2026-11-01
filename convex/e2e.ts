import { v } from 'convex/values'

import { mutation } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { TableNames } from './_generated/dataModel'
import { requireUser } from './auth'
import { historySums } from '../src/lib/sharesCheck'

/* Browser tests on mock data (docs/specs/2026-10-05-e2e-tests.md). Only
   the throwaway test backend on his Mac has E2E=1; his dev deployment and
   prod do not, so on them every function here refuses before it reads a
   row. Mock data is an exception to "Nothing is seeded" that Artem agreed
   on 5 Oct — in that test database only, never in his. */

export function guard() {
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
  'ledgers',
  'removedTrades',
  'payees',
  'bankLinks',
  'notifications',
  'pushSubscriptions',
  'moneyAlerts',
  'reviews',
  'weekReads',
  'askReplies',
  'marketReads',
  'ideasReads',
  'aiSpend',
  'projects',
  'commits',
  'tasks',
  'fundamentals',
  'sectorAverages',
  'events',
  'goals',
  'targets',
  'watches',
  'profiles',
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
    /* Past the first run and not a guest (R8 · S2, S3a): every test opens
       the app as Artem would; first-run.spec.ts takes it away again. */
    await ctx.db.insert('profiles', {
      ownerId,
      timezone: 'Europe/Lisbon',
      firstRunAt: Date.now(),
      asOwner: true,
    })
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
 * A lived week for Review (15 Oct, mockup real.html) on what the app gets
 * by itself: a project's commits (three of a target of three, one last
 * week) and a quiet one, a task done, four bank rows and a bill this week,
 * one row last week, two gym workouts, a shake and a weight. `days` are this week's
 * Monday, Tuesday and Wednesday, local midnights. The bad day's spends are
 * taken out first, so the sums do not move with the weekday.
 */
export const reviewWeek = mutation({
  args: { days: v.array(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    for (const row of await ctx.db.query('logs').collect())
      if (row.area === 'money') await ctx.db.delete(row._id)
    const [a, b, c] = args.days
    const hour = (day: number, h: number) => day + h * 3_600_000

    const sl = await ctx.db.insert('projects', {
      ownerId,
      title: 'Solo Leveling',
      status: 'focus',
      githubRepo: 'artem/sololeveling',
      commitTargetWeekly: 3,
    })
    await ctx.db.insert('projects', {
      ownerId,
      title: 'Oreum',
      status: 'active',
    })
    const commit = (at: number, message: string) =>
      ctx.db.insert('commits', {
        ownerId,
        projectId: sl,
        repo: 'artem/sololeveling',
        sha: `${at}`,
        message,
        url: 'https://github.com/artem/sololeveling',
        authoredAt: at,
        fetchedAt: at,
        isMerge: false,
      })
    await commit(hour(a - 7 * DAY, 11), 'chore: last week')
    await commit(hour(a, 10), 'feat(review): the week bar')
    await commit(hour(a, 15), 'feat(review): spent by day')
    await commit(hour(b, 12), 'fix(review): bills not counted')
    await ctx.db.insert('tasks', {
      ownerId,
      title: 'Ship Review',
      projectId: sl,
      status: 'done',
      priority: 0,
      completedAt: hour(a, 18),
    })

    const bill = await ctx.db.insert('recurring', {
      ownerId,
      name: 'Anthropic',
      kind: 'expense',
      amount: 22.14,
      cadence: 'monthly',
      day: new Date(b).getDate(),
    })
    const spend = (
      at: number,
      text: string,
      value: number,
      category: string,
      recurringId?: typeof bill,
    ) =>
      ctx.db.insert('logs', {
        ownerId,
        area: 'money',
        kind: 'expense',
        occurredAt: at,
        value,
        unit: 'eur',
        text,
        meta: { merchant: text, category, recurringId },
      })
    await spend(hour(a - 7 * DAY, 12), 'English Bar 42', 74.05, 'eating out')
    await spend(hour(a, 9), 'Veiga e Seabra', 37.86, 'car')
    await spend(hour(b, 9), 'Anthropic', 22.14, 'subscriptions', bill)
    await spend(hour(c, 9), 'Solinca', 5.98, 'subscriptions')
    await spend(hour(c, 13), 'Bolt', 4.5, 'transport')
    await spend(hour(c, 19), 'Pingo Doce', 2.1, 'groceries')

    const workout = (at: number) =>
      ctx.db.insert('logs', {
        ownerId,
        area: 'body',
        kind: 'workout',
        occurredAt: at,
        value: 60,
        meta: { category: 'gym' },
      })
    await workout(hour(a, 7))
    await workout(hour(b, 7))
    await ctx.db.insert('logs', {
      ownerId,
      area: 'body',
      kind: 'intake',
      occurredAt: hour(b, 8),
      meta: { category: 'supplements' },
    })
    await ctx.db.insert('stateSnapshots', {
      ownerId,
      area: 'body',
      key: 'weight',
      value: 75.4,
      unit: 'kg',
      recordedAt: hour(b, 8),
      source: 'typed',
    })
    return null
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
    /* In an update, as every drop is (12 Oct): it shows in ADD's check. */
    const batchId = await ctx.db.insert('batches', {
      ownerId,
      status: 'open',
      leftOut: [],
      quietMonths: [],
      moves: [],
      extras: [],
      dismissed: [],
    })
    return await ctx.db.insert('intakes', {
      ownerId,
      batchId,
      storageIds: [],
      status: 'ready',
      kind: 'holdings',
      title: 'Revolut Invest screenshot',
      institution: 'Revolut',
      model: 'Claude Haiku 5.5',
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

export const readHistory = mutation({
  args: { days: v.array(v.number()) },
  returns: v.id('batches'),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    return await history(ctx, ownerId, args.days)
  },
})

export async function history(
  ctx: MutationCtx,
  ownerId: string,
  days: Array<number>,
) {
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
      historyShares: historySums(rows),
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

/* Today (docs/specs/2026-10-17-today-rework.md): an event later today, a
   lived September and October, and a langs target of 4. */
export const todayMonth = mutation({
  args: {
    now: v.number(),
    dayEnd: v.number(),
    monthStart: v.number(),
    prevStart: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const startsAt = Math.min(args.now + 20 * 60_000, args.dayEnd - 2 * 60_000)
    await ctx.db.insert('events', {
      ownerId,
      title: 'PT',
      area: 'body',
      startsAt,
      endsAt: startsAt + 60 * 60_000,
    })
    const log = (
      kind: 'workout' | 'session' | 'post',
      area: string,
      at: number,
    ) => ctx.db.insert('logs', { ownerId, kind, area, occurredAt: at })
    const sep = args.prevStart + 3_600_000
    const oct = args.monthStart + 3_600_000
    await log('workout', 'body', sep)
    await log('workout', 'body', sep + DAY)
    await log('session', 'portuguese', sep)
    await log('workout', 'body', oct)
    await log('workout', 'body', oct + 60_000)
    await log('workout', 'body', oct + 120_000)
    await log('post', 'social', oct)
    await ctx.db.insert('goals', {
      ownerId,
      title: 'Portuguese',
      area: 'portuguese',
      status: 'active',
      targetValue: 4,
      tile: 'portuguese',
    })
    return null
  },
})

/** Today's THIS WEEK: a lived Monday and Tuesday, from the Monday's
    local midnight the page computed. */
export const todayWeek = mutation({
  args: { weekStart: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireUser(ctx)
    guard()
    const at = (day: number, h: number, m = 0) =>
      args.weekStart + day * DAY + (h * 60 + m) * 60_000
    const row = (
      kind: 'workout' | 'session' | 'post' | 'intake',
      area: string,
      occurredAt: number,
      extra: { value?: number; text?: string; category?: string } = {},
    ) =>
      ctx.db.insert('logs', {
        ownerId,
        kind,
        area,
        occurredAt,
        ...(extra.value !== undefined ? { value: extra.value } : {}),
        ...(extra.text !== undefined ? { text: extra.text } : {}),
        ...(extra.category !== undefined
          ? { meta: { category: extra.category } }
          : {}),
      })
    await row('workout', 'body', at(0, 7, 30), { value: 60, text: 'legs' })
    await row('intake', 'body', at(0, 8), { category: 'supplements' })
    await row('session', 'portuguese', at(0, 19), { value: 25 })
    await row('post', 'social', at(1, 12, 30))
    return null
  },
})
