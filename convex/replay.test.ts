/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import { lastSync } from '../src/lib/bankLink'
import { samePayment } from '../src/lib/transferMatch'
import schema from './schema'
import type { Doc, Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'

/* A month and a bit of his money, replayed through UPDATE ALL (4 Oct:
   "I'm very worried that I will need to come back to a lot of bugs later.
   We need to make sure everything adds up when I upload statements").

   The statements are shaped like his — BPI with the salary, the mortgage
   in two rows, insurances and electricity on direct debit; ActivoBank with
   a gym every two weeks, phone top-ups, transfers in and out, money lent
   and paid back, a transfer still pending; Revolut topped up from
   ActivoBank, a monthly subscription, cafés — with made-up numbers and
   names, because the repo is public. Each step ends with `addsUp`, which
   checks what must always hold. */

/* Statement rows sit at noon UTC, as the reader writes them. */
const at = (m: number, d: number) => Date.UTC(2026, m - 1, d, 12)
const local = (m: number, d: number) => new Date(2026, m - 1, d).getTime()

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(at(10, 4)) })
})
afterEach(() => {
  vi.useRealTimers()
})

type Row = {
  occurredAt: number
  merchant: string
  raw: string
  amount: number
  currency: string
  pending: boolean
  self: boolean
  counterparty?: string
  category?: string
}
const row = (
  m: number,
  d: number,
  raw: string,
  amount: number,
  more: Partial<Row> = {},
): Row => ({
  occurredAt: at(m, d),
  merchant: raw,
  raw,
  amount,
  currency: 'EUR',
  pending: false,
  self: false,
  ...more,
})
/* A transfer between his own accounts, as the reader marks it. */
const own = (m: number, d: number, raw: string, amount: number) =>
  row(m, d, raw, amount, { self: true, counterparty: 'ARTEM CHERNII' })

type File = {
  name: string
  institution: string
  accountTail: string
  rows: Array<Row>
  balance: { m: number; d: number; value: number }
}

/* ── His banks, August and September ─────────────────────────────── */

const bpiAug: File = {
  name: 'bpi-2026-08.pdf',
  institution: 'Banco BPI',
  accountTail: '4410',
  rows: [
    row(8, 1, 'AMORTIZACAO DE CAPITAL - 00650-165-0', -400, {
      merchant: 'Habitação e Rendas',
      category: 'home',
    }),
    row(8, 1, 'JUROS DE EMPRESTIMO - 00650-165-001', -700, {
      merchant: 'Habitação e Rendas',
      category: 'home',
    }),
    row(8, 1, 'SEGURO ALLIANZ - MULTI-RISCOS-HABITACAO-', -25, {
      merchant: 'Seguros',
      category: 'home',
    }),
    row(8, 25, 'TRF CR SEPA+ 0000017 DE ACME CORP', 2500, {
      merchant: 'Receitas',
    }),
    row(8, 25, 'DD EDP COMERCIAL COMERCIALIZACAO DE ENER 1601', -30, {
      merchant: 'Energia e Água',
      category: 'home',
    }),
    own(8, 27, 'TRF SEPA+ INST 19 P/ PT50002300004547', -300),
  ],
  balance: { m: 8, d: 31, value: 4000 },
}
const bpiSep: File = {
  ...bpiAug,
  name: 'bpi-2026-09.pdf',
  rows: [
    row(9, 1, 'AMORTIZACAO DE CAPITAL - 00650-165-0', -400, {
      merchant: 'Habitação e Rendas',
      category: 'home',
    }),
    row(9, 1, 'JUROS DE EMPRESTIMO - 00650-165-001', -698, {
      merchant: 'Habitação e Rendas',
      category: 'home',
    }),
    row(9, 1, 'SEGURO ALLIANZ - MULTI-RISCOS-HABITACAO-', -25, {
      merchant: 'Seguros',
      category: 'home',
    }),
    own(9, 1, 'TRF SEPA+ INST 20 P/ PT50002300004547', -1000),
    row(9, 25, 'TRF CR SEPA+ 0000021 DE ACME CORP', 2520, {
      merchant: 'Receitas',
    }),
    row(9, 25, 'DD EDP COMERCIAL COMERCIALIZACAO DE ENER 1612', -31, {
      merchant: 'Energia e Água',
      category: 'home',
    }),
    own(9, 28, 'TRF SEPA+ INST 22 P/ PT50002300004547', -400),
  ],
  balance: { m: 9, d: 30, value: 3966 },
}
const actAug: File = {
  name: 'activo-2026-08.pdf',
  institution: 'ActivoBank',
  accountTail: '3402',
  rows: [
    row(8, 3, 'PAG. 919703708 - VODAFONE', -10, {
      merchant: 'Vodafone',
      category: 'home',
    }),
    row(8, 5, 'DD GYM LIGHT, 00003262677 PT131077', -6, {
      merchant: 'Gym Light',
      category: 'health',
    }),
    row(8, 9, 'COMPRA 2789 EST SERVICO VEIGA', -55, { category: 'transport' }),
    row(8, 19, 'DD GYM LIGHT, 00003262677 PT131077', -6, {
      merchant: 'Gym Light',
      category: 'health',
    }),
    row(8, 21, 'PAG. 919703708 - VODAFONE', -10, {
      merchant: 'Vodafone',
      category: 'home',
    }),
    own(8, 27, 'TRF. P/O ARTEM CHERNII', 300),
  ],
  balance: { m: 8, d: 31, value: 413 },
}
const actSep: File = {
  ...actAug,
  name: 'activo-2026-09.pdf',
  rows: [
    own(9, 1, 'TRF. P/O ARTEM CHERNII', 1000),
    row(9, 2, 'DD GYM LIGHT 00003262677 PT1310755', -6, {
      merchant: 'Gym Light',
      category: 'health',
    }),
    own(9, 3, 'COMPRA 2789 REVOLUT 8134 DUBLIN IE', -900),
    row(9, 9, 'COMPRA 2789 EST SERVICO VEIGA', -57, { category: 'transport' }),
    row(9, 14, 'PAG. 919703708 - VODAFONE', -10, {
      merchant: 'Vodafone',
      category: 'home',
    }),
    row(9, 16, 'DD GYM LIGHT 00003262677 PT1310755', -6, {
      merchant: 'Gym Light',
      category: 'health',
    }),
    own(9, 27, 'TRF. P/O ARTEM CHERNII', 400),
    row(9, 28, 'TRF MB WAY P/ FRIEND NAME', -100, { category: 'other' }),
    row(9, 30, 'DD GYM LIGHT, 00003262677 PT13107755', -6, {
      merchant: 'Gym Light',
      category: 'health',
    }),
  ],
  balance: { m: 9, d: 30, value: 728 },
}
const revSep: File = {
  name: 'revolut-2026-09.pdf',
  institution: 'Revolut',
  accountTail: '9001',
  rows: [
    own(9, 3, 'Top-up by *2789 From: *2789', 900),
    row(9, 5, 'Anthropic To: Anthropic* Claude Sub, Dub', -22.14, {
      merchant: 'Anthropic',
      category: 'subscriptions',
    }),
    row(9, 18, 'Bnp Toc To: Bnp Toc, Lisboa Card: 5167', -6.7, {
      merchant: 'Bnp Toc',
      category: 'eating out',
    }),
    row(9, 24, 'Bnp Toc To: Bnp Toc, Lisboa Card: 5167', -6.7, {
      merchant: 'Bnp Toc',
      category: 'eating out',
    }),
  ],
  balance: { m: 9, d: 30, value: 864.46 },
}
const revAug: File = {
  ...revSep,
  name: 'revolut-2026-08.pdf',
  rows: [
    row(8, 5, 'Anthropic To: Anthropic* Claude Sub, Dub', -22.14, {
      merchant: 'Anthropic',
      category: 'subscriptions',
    }),
  ],
  balance: { m: 8, d: 31, value: 0 },
}

/* October, read on the 4th: the friend paid back, the €500 to Trade
   Republic still pending. Overlaps September on purpose. */
const actOct: File = {
  ...actAug,
  name: 'activo-2026-10.pdf',
  rows: [
    row(9, 30, 'DD GYM LIGHT, 00003262677 PT13107755', -6, {
      merchant: 'Gym Light',
      category: 'health',
    }),
    row(10, 1, 'TRF. P/O FRIEND NAME', 100),
    row(10, 4, 'TRF P/ TRADE REPUBLIC', -500, { pending: true }),
  ],
  balance: { m: 10, d: 4, value: 828 },
}

/* ── The harness ─────────────────────────────────────────────────── */

function setup() {
  const t = convexTest(schema, modules)
  return { t, me: t.withIdentity({ tokenIdentifier: ME }) }
}
type T = ReturnType<typeof setup>['t']
type Me = ReturnType<typeof setup>['me']

async function accounts(me: Me) {
  const make = (name: string, tail: string) =>
    me.mutation(api.accounts.create, {
      name,
      kinds: ['bank'],
      currencies: ['EUR'],
      ibanTails: [tail],
    })
  return {
    bpi: await make('BPI', '4410'),
    act: await make('ActivoBank', '3402'),
    rev: await make('Revolut', '9001'),
  }
}

/* One UPDATE ALL: the files as the reader leaves them, reviewed and
   applied, every scheduled step run. */
async function updateAll(t: T, me: Me, files: Array<File>) {
  const batchId = await t.run((ctx) =>
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
  for (const f of files) {
    await t.run((ctx) =>
      ctx.db.insert('intakes', {
        ownerId: ME,
        batchId,
        storageIds: [],
        status: 'ready',
        kind: 'transactions',
        title: f.name,
        institution: f.institution,
        accountTail: f.accountTail,
        files: [{ name: f.name, size: 1, contentType: 'application/pdf' }],
        transactions: f.rows,
        balance: {
          currency: 'EUR',
          value: f.balance.value,
          asOf: at(f.balance.m, f.balance.d),
        },
      }),
    )
  }
  const review = await me.query(api.intake.batchReview, { batchId })
  await me.mutation(api.intake.applyBatch, { batchId, dayStart: local(10, 4) })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  return review
}

const logsOf = (t: T) =>
  t.run(async (ctx) =>
    (await ctx.db.query('logs').collect()).filter((l) => l.area === 'money'),
  )

const cents = (n: number) => Math.round(n * 100)

/**
 * What must always hold after an update:
 * 1. each account's balance is the statement's closing balance;
 * 2. no statement row is in twice;
 * 3. every transfer between his accounts shows from one to the other;
 * 4. every month's in and out is the sum of its rows, moves left out;
 * 5. a pending row is never written.
 */
async function addsUp(
  t: T,
  me: Me,
  ids: Awaited<ReturnType<typeof accounts>>,
  closing: Record<'bpi' | 'act' | 'rev', number>,
) {
  const bal = await me.query(api.aggregate.balances, {})
  for (const [k, id] of Object.entries(ids) as Array<
    [keyof typeof ids, Id<'accounts'>]
  >) {
    const a = bal.accounts.find((x) => x.accountId === id)
    expect(a?.cashEur, `balance of ${k}`).toBe(closing[k])
  }

  const logs = await logsOf(t)
  const seen = new Map<string, Doc<'logs'>>()
  for (const l of logs) {
    const key = `${l.accountId}|${l.occurredAt}|${l.value}|${l.meta?.raw ?? l.text}`
    expect(seen.has(key), `twice: ${key}`).toBe(false)
    seen.set(key, l)
  }
  expect(logs.some((l) => (l.meta?.raw ?? '').includes('TRADE REPUBLIC'))).toBe(
    false,
  )

  const moves = await me.query(api.logs.movements, {
    start: local(8, 1),
    end: local(10, 5),
  })
  for (const m of moves.items) {
    if (m.type !== 'move') continue
    expect(m.from, `move ${m.text} has a from`).not.toBeNull()
    expect(m.to, `move ${m.text} has a to`).not.toBeNull()
    expect(m.from).not.toBe(m.to)
  }

  const spans = [8, 9, 10].map((m) => ({
    start: local(m, 1),
    end: local(m + 1, 1),
  }))
  const months = await me.query(api.aggregate.flowMonths, { months: spans })
  for (const [i, s] of spans.entries()) {
    const inside = logs.filter(
      (l) => l.occurredAt >= s.start && l.occurredAt < s.end,
    )
    const sum = (kind: string) =>
      inside
        .filter((l) => l.kind === kind)
        .reduce((n, l) => n + cents(l.value ?? 0), 0) / 100
    expect(months[i].in, `in, month ${i}`).toBe(sum('income'))
    expect(months[i].out, `out, month ${i}`).toBe(sum('expense'))
  }
  return { logs, moves }
}

describe('replay: his statements through UPDATE ALL', () => {
  test('August and September in one drop: balances right, transfers paired, nothing twice', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    const review = await updateAll(t, me, [
      bpiAug,
      bpiSep,
      actAug,
      actSep,
      revAug,
      revSep,
    ])
    expect(review.asks).toEqual([])

    const { moves } = await addsUp(t, me, ids, {
      bpi: 3966,
      act: 728,
      rev: 864.46,
    })
    expect(
      moves.items
        .flatMap((m) => (m.type === 'move' ? [[m.from, m.to, m.amount]] : []))
        .sort(),
    ).toEqual(
      [
        [ids.act, ids.rev, 900],
        [ids.bpi, ids.act, 1000],
        [ids.bpi, ids.act, 300],
        [ids.bpi, ids.act, 400],
      ].sort(),
    )
  })

  test('the same files again change nothing', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    const files = [bpiAug, bpiSep, actAug, actSep, revAug, revSep]
    await updateAll(t, me, files)
    const before = (await logsOf(t)).length
    await updateAll(t, me, files)
    expect((await logsOf(t)).length).toBe(before)
    await addsUp(t, me, ids, { bpi: 3966, act: 728, rev: 864.46 })
  })

  test('a later statement that overlaps adds only what is new; pending stays out', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    await updateAll(t, me, [bpiAug, bpiSep, actAug, actSep, revAug, revSep])
    const before = (await logsOf(t)).length
    await updateAll(t, me, [actOct])
    const after = await logsOf(t)
    /* Only the friend paying back: the 30 Sep gym is had, the €500 pending. */
    expect(after.length - before).toBe(1)
    await addsUp(t, me, ids, { bpi: 3966, act: 828, rev: 864.46 })
  })

  test('month by month, the way he uploads: each drop adds up', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    await updateAll(t, me, [bpiAug, actAug, revAug])
    await addsUp(t, me, ids, { bpi: 4000, act: 413, rev: 0 })
    await updateAll(t, me, [bpiSep, actSep, revSep])
    await addsUp(t, me, ids, { bpi: 3966, act: 728, rev: 864.46 })
    await updateAll(t, me, [actOct])
    await addsUp(t, me, ids, { bpi: 3966, act: 828, rev: 864.46 })
  })

  test('the two sides of a transfer in two different drops are still one move', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    await updateAll(t, me, [bpiAug, bpiSep])
    await updateAll(t, me, [actAug, actSep, revAug, revSep])
    const { moves } = await addsUp(t, me, ids, {
      bpi: 3966,
      act: 728,
      rev: 864.46,
    })
    expect(moves.items.filter((m) => m.type === 'move')).toHaveLength(4)
  })

  test('Flow finds his bills, named by payee, and nothing everyday', async () => {
    const { t, me } = setup()
    await accounts(me)
    await updateAll(t, me, [bpiAug, bpiSep, actAug, actSep, revAug, revSep])
    const bills = await t.run((ctx) => ctx.db.query('recurring').collect())
    expect(bills.map((b) => [b.name, b.kind, b.day]).sort()).toEqual(
      [
        ['Acme Corp', 'income', 25],
        ['Amortizacao Capital', 'expense', 1],
        ['Anthropic', 'expense', 5],
        ['Edp Comercial', 'expense', 25],
        /* Every two weeks (from 30 Sep), and phone top-ups that vary. */
        ['Gym Light', 'expense', 30],
        ['Juros Emprestimo', 'expense', 1],
        ['Seguro Allianz', 'expense', 1],
        ['Vodafone', 'expense', 14],
      ].sort(),
    )
  })
})

/* ── 19 Oct: the same money through several doors ──────────────────

   Each bug of the day, replayed from the shape of his data as it stood —
   bank sync, statement, screenshot, the other bank's file writing its
   side of a transfer — with made-up numbers and names. */

const openBatch = (t: T) =>
  t.run((ctx) =>
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

/** A screenshot's rows: dated by their day, at noon, as the reader does. */
async function screenshot(
  t: T,
  me: Me,
  f: Omit<File, 'name'>,
  answer?: (
    review: Awaited<ReturnType<typeof updateAll>>,
    batchId: Id<'batches'>,
  ) => Promise<void>,
) {
  const batchId = await openBatch(t)
  await t.run((ctx) =>
    ctx.db.insert('intakes', {
      ownerId: ME,
      batchId,
      storageIds: [],
      status: 'ready',
      kind: 'transactions',
      title: `${f.institution} screenshot`,
      institution: f.institution,
      accountTail: f.accountTail,
      files: [
        { name: 'IMG_9310.PNG', size: 400_000, contentType: 'image/png' },
      ],
      transactions: f.rows,
      balance: {
        currency: 'EUR',
        value: f.balance.value,
        asOf: Date.now(),
      },
    }),
  )
  const review = await me.query(api.intake.batchReview, { batchId })
  if (answer) await answer(review, batchId)
  await me.mutation(api.intake.applyBatch, {
    batchId,
    dayStart: local(10, 4),
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  return { review, batchId }
}

/** A bank Enable Banking reaches, linked a while ago. */
async function linked(t: T, accountId: Id<'accounts'>) {
  await t.run((ctx) =>
    ctx.db.insert('bankLinks', {
      ownerId: ME,
      accountId,
      status: 'linked',
      uids: [{ uid: `uid-${accountId}`, currency: 'EUR' }],
      startedAt: at(9, 1),
      validUntil: at(12, 31),
    }),
  )
}

/** The bank's answer at this moment, as `bankRows.pull` lays it down. */
async function bankAnswers(
  t: T,
  accountId: Id<'accounts'>,
  value: number,
  rows: Array<{
    status: 'BOOK' | 'PDNG'
    amount: number
    day: string
    name: string
  }> = [],
) {
  const begun = await t.mutation(internal.bankRows.begin, {
    ownerId: ME,
    accountId,
  })
  await t.mutation(internal.bankRows.arrive, {
    ownerId: ME,
    accountId,
    dayStart: local(10, 4),
    names: ['Artem Chernii'],
    readings: [
      {
        currency: 'EUR',
        value,
        /* As `pull` asks: no rows from a check that asks from no day. */
        rows: (begun.status === 'go' && begun.asks[0].from === null
          ? []
          : rows
        ).map((r) => ({
          status: r.status,
          amount: Math.abs(r.amount).toFixed(2),
          currency: 'EUR',
          indicator: r.amount < 0 ? 'DBIT' : 'CRDT',
          bookingDate: r.status === 'BOOK' ? r.day : undefined,
          transactionDate: r.day,
          creditor: r.amount < 0 ? r.name : undefined,
          debtor: r.amount > 0 ? r.name : undefined,
          remittance: [r.name],
        })),
      },
    ],
  })
  return begun
}

const statements = [bpiAug, bpiSep, actAug, actSep, revAug, revSep]

describe('replay: 19 Oct, the same money through several doors', () => {
  beforeEach(() => {
    vi.stubEnv('E2E', '1')
    /* Saved positions ask for their prices: never from a test. */
    vi.stubGlobal('fetch', () => Promise.reject(new Error('no network here')))
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  /* Revolut Invest for its broker cash: six of his many positions on the
     screen, every one already held from the statement's trades — gold
     as XAU on the screen, GC=F in the app — and a total the six and the
     cash cannot reach, the rest being behind Show more. */
  test('a Revolut Invest screenshot of positions the statement holds saves only the broker cash', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    await updateAll(t, me, statements)
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.rev, { kinds: ['bank', 'broker'] })
      const held: Array<[string, string, string]> = [
        ['VUAA.L', 'Vanguard S&P 500', 'ETF'],
        ['NVDA', 'NVIDIA Corporation', 'EQUITY'],
        ['MSFT', 'Microsoft Corporation', 'EQUITY'],
        ['ASML', 'ASML Holding N.V.', 'EQUITY'],
        ['NVO', 'Novo Nordisk A/S', 'EQUITY'],
        ['GC=F', 'Gold', 'FUTURE'],
        ['AMZN', 'Amazon.com, Inc.', 'EQUITY'],
        ['KO', 'The Coca-Cola Company', 'EQUITY'],
        ['SAP', 'SAP SE', 'EQUITY'],
      ]
      for (const [symbol, name, type] of held) {
        const instrumentId = await ctx.db.insert('instruments', {
          ownerId: ME,
          symbol,
          name,
          exchange: 'NMS',
          currency: 'EUR',
          type,
        })
        await ctx.db.insert('trades', {
          ownerId: ME,
          accountId: ids.rev,
          instrumentId,
          side: 'buy',
          shares: 2,
          priceEur: 100,
          occurredAt: at(8, 10),
        })
      }
    })
    const screen: Array<[string, string, string, number, number]> = [
      ['VUAA.L', 'Vanguard S&P 500', 'ETF', 40, 4210.4],
      ['NVDA', 'NVIDIA', 'EQUITY', 30, 4050.3],
      ['MSFT', 'Microsoft', 'EQUITY', 8, 3402.16],
      ['ASML', 'ASML', 'EQUITY', 3, 2690.1],
      ['NVO', 'Novo Nordisk', 'EQUITY', 25, 1620.5],
      ['XAU', 'Gold', 'COMMODITY', 2.4, 6408.14],
    ]
    const batchId = await openBatch(t)
    await t.run(async (ctx) => {
      await ctx.db.insert('intakes', {
        ownerId: ME,
        batchId,
        accountId: ids.rev,
        storageIds: [],
        status: 'ready',
        kind: 'holdings',
        title: 'Revolut screenshot',
        institution: 'Revolut',
        readAt: Date.now(),
        files: [
          { name: 'IMG_9301.PNG', size: 400_000, contentType: 'image/png' },
        ],
        positions: screen.map(([symbol, name, type, shares, valueEur]) => ({
          name,
          shares,
          valueEur,
          preferred: 0,
          todayPriceEur: Math.round((valueEur / shares) * 100) / 100,
          todayAsOf: Date.now(),
          candidates: [{ symbol, name, exchange: 'NMS', type }],
        })),
        cashEur: 1560,
        totalEur: 30425.07,
      })
    })

    const review = await me.query(api.intake.batchReview, { batchId })
    const block = review.accounts.find((a) => a.accountId === ids.rev)
    expect(block?.held).toBe(false)
    expect(block?.holdings?.total).toMatchObject({
      state: 'none',
      known: 6,
      answer: null,
    })
    expect(review.asks).toEqual([])

    await me.mutation(api.intake.applyBatch, {
      batchId,
      dayStart: local(10, 4),
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const saved = await t.run(async (ctx) => ({
      positions: (await ctx.db.query('holdings').collect()).length,
      broker: (await ctx.db.query('stateSnapshots').collect())
        .filter((s) => s.key === `brokerCash:${ids.rev}:EUR`)
        .map((s) => s.value),
    }))
    expect(saved).toEqual({ positions: 0, broker: [1560] })
    await addsUp(t, me, ids, { bpi: 3966, act: 728, rev: 864.46 })
  })

  /* His BPI screenshot: −€1,000 on 2 Oct as "Diversos", an IBAN and no
     name. ActivoBank's statement had already written BPI's side of that
     move. It is the same payment, in BPI already: nothing new. */
  test('a BPI row with only an IBAN, whose side ActivoBank wrote, is the same payment', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    await updateAll(t, me, statements)
    await updateAll(t, me, [
      {
        ...actAug,
        name: 'activo-2026-10.pdf',
        rows: [own(10, 2, 'TRF. P/O ARTEM CHERNII BPI', 1000)],
        balance: { m: 10, d: 3, value: 1728 },
      },
    ])
    const before = await logsOf(t)
    expect(
      before.filter(
        (l) => l.accountId === ids.bpi && l.occurredAt >= at(10, 1),
      ),
    ).toHaveLength(1)

    const { review } = await screenshot(
      t,
      me,
      {
        institution: 'Banco BPI',
        accountTail: '4410',
        rows: [
          row(10, 2, 'TRF SEPA+ INST 23 P/ PT50000000000000001', -1000, {
            merchant: 'Diversos',
          }),
        ],
        balance: { m: 10, d: 4, value: 2966 },
      },
      async (asked, batchId) => {
        const tr = asked.accounts.flatMap((a) => a.transfers)
        expect(tr).toHaveLength(1)
        expect(tr[0].sides).toHaveLength(1)
        expect(tr[0].sides[0]).toMatchObject({
          accountId: ids.bpi,
          here: true,
          fee: 0,
        })
        expect(samePayment(tr[0].sides[0], tr[0].sides.length > 1)).toBe(true)
        await me.mutation(api.intake.batchAnswer, {
          batchId,
          answer: {
            kind: 'sum',
            key: `same:${tr[0].key}:${tr[0].sides[0].id}`,
            on: true,
          },
        })
      },
    )
    expect(review.asks).toEqual([])
    expect((await logsOf(t)).length).toBe(before.length)
    await addsUp(t, me, ids, { bpi: 2966, act: 1728, rev: 864.46 })
  })

  /* He sent €422 from BPI to ActivoBank on 3 Oct, in the evening.
     ActivoBank's bank answered at 15:01, before the money came. BPI's
     screenshot then wrote the arrival on ActivoBank, dated the day at
     noon — a screenshot has no time. Nothing is missing. */
  test('an arrival dated the day of the bank’s earlier answer is not missing', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    await updateAll(t, me, statements)
    await linked(t, ids.act)
    vi.setSystemTime(new Date(2026, 9, 3, 15, 1))
    await bankAnswers(t, ids.act, 728)
    vi.setSystemTime(at(10, 4))

    await screenshot(t, me, {
      institution: 'Banco BPI',
      accountTail: '4410',
      rows: [own(10, 3, 'TRF SEPA+ INST 24 P/ ACTIVOBANK', -422)],
      balance: { m: 10, d: 4, value: 3544 },
    })
    const arrival = (await logsOf(t)).filter(
      (l) => l.accountId === ids.act && l.occurredAt === at(10, 3),
    )
    expect(arrival.map((l) => l.value)).toEqual([422])

    const sheet = await me.query(api.aggregate.accountSheet, {
      accountId: ids.act,
      head: true,
    })
    expect(sheet?.readings.map((r) => [r.source, r.value])).toContainEqual([
      'sync',
      728,
    ])
    expect(sheet?.checks.filter((c) => c.missing !== 0)).toEqual([])
    /* The bank's 15:01 balance had not seen it; its next answer will. */
    await addsUp(t, me, ids, { bpi: 3544, act: 728, rev: 864.46 })
  })

  /* 20 Oct, the same €422 through the bank's own door: its next answer
     brings the arrival (already saved from BPI's screenshot) and a new
     −€10. The open question said "€422 came in with no row" against the
     15:01 balance that had not seen it. Saved with no question. */
  test('the bank’s next answer with that arrival already saved asks nothing', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    await updateAll(t, me, statements)
    await linked(t, ids.act)
    vi.setSystemTime(new Date(2026, 9, 3, 15, 1))
    await bankAnswers(t, ids.act, 728)
    vi.setSystemTime(at(10, 4))
    await screenshot(t, me, {
      institution: 'Banco BPI',
      accountTail: '4410',
      rows: [own(10, 3, 'TRF SEPA+ INST 24 P/ ACTIVOBANK', -422)],
      balance: { m: 10, d: 4, value: 3544 },
    })

    vi.setSystemTime(new Date(2026, 9, 4, 18, 30))
    await bankAnswers(t, ids.act, 1140, [
      { status: 'BOOK', amount: 422, day: '2026-10-03', name: 'Artem Chernii' },
      { status: 'BOOK', amount: -10, day: '2026-10-04', name: 'Bolt' },
    ])
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const link = await t.run((ctx) =>
      ctx.db
        .query('bankLinks')
        .withIndex('by_owner_account', (q) =>
          q.eq('ownerId', ME).eq('accountId', ids.act),
        )
        .unique(),
    )
    expect(link?.questions ?? []).toEqual([])
    const arrival = (await logsOf(t)).filter(
      (l) => l.accountId === ids.act && Math.abs(l.value ?? 0) === 422,
    )
    expect(arrival).toHaveLength(1)
    vi.setSystemTime(at(10, 5))
    await addsUp(t, me, ids, { bpi: 3544, act: 1140, rev: 864.46 })
  })

  /* 20 Oct, one rule for every door: the same €422 then reaches
     ActivoBank's balance by its statement and by its screenshot. Each
     door's sum card and landed card add up (src/lib/balanceRule.ts). */
  const after422 = async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    await updateAll(t, me, statements)
    await linked(t, ids.act)
    vi.setSystemTime(new Date(2026, 9, 3, 15, 1))
    await bankAnswers(t, ids.act, 728)
    vi.setSystemTime(at(10, 4))
    await screenshot(t, me, {
      institution: 'Banco BPI',
      accountTail: '4410',
      rows: [own(10, 3, 'TRF SEPA+ INST 24 P/ ACTIVOBANK', -422)],
      balance: { m: 10, d: 4, value: 3544 },
    })
    vi.setSystemTime(new Date(2026, 9, 4, 18, 30))
    return { t, me, ids }
  }
  const actRows = [
    own(10, 3, 'TRF. P/O ARTEM CHERNII', 422),
    row(10, 4, 'COMPRA 2789 BOLT', -10, { category: 'transport' }),
  ]
  const landedOf = (t: T, accountTail: string) =>
    t.run(async (ctx) =>
      (await ctx.db.query('intakes').collect())
        .filter((i) => i.accountTail === accountTail)
        .map((i) => i.landed?.gap ?? null),
    )

  test('the €422 by ActivoBank’s statement: sum card and landed card add up', async () => {
    const { t, me, ids } = await after422()
    const review = await updateAll(t, me, [
      {
        ...actSep,
        name: 'activo-2026-10.pdf',
        rows: actRows,
        balance: { m: 10, d: 4, value: 1140 },
      },
    ])
    const block = review.accounts.find((a) => a.accountId === ids.act)
    expect(block?.check).toMatchObject({ state: 'ok', gap: 0 })
    expect(review.asks.filter((a) => a.kind === 'gap')).toEqual([])
    expect((await landedOf(t, '3402')).at(-1)).toBe(0)
    vi.setSystemTime(at(10, 5))
    await addsUp(t, me, ids, { bpi: 3544, act: 1140, rev: 864.46 })
  })

  test('the €422 by ActivoBank’s screenshot: sum card and landed card add up', async () => {
    const { t, me, ids } = await after422()
    const { review } = await screenshot(t, me, {
      institution: 'ActivoBank',
      accountTail: '3402',
      rows: actRows,
      balance: { m: 10, d: 4, value: 1140 },
    })
    const block = review.accounts.find((a) => a.accountId === ids.act)
    expect(block?.check).toMatchObject({ state: 'ok', gap: 0 })
    expect((await landedOf(t, '3402')).at(-1)).toBe(0)
    vi.setSystemTime(at(10, 5))
    await addsUp(t, me, ids, { bpi: 3544, act: 1140, rev: 864.46 })
  })

  /* 20 Oct, after the deploy: ActivoBank's question, held before the
     €422 was saved, now read "was · out · now ✓" and still waited for
     APPLY. "Why after simple fetch data from bank i see all these
     crap?" The next check saves it with no press. */
  test('a held bank question that adds up now is saved by the next check', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    await updateAll(t, me, statements)
    await linked(t, ids.act)
    vi.setSystemTime(new Date(2026, 9, 3, 15, 1))
    await bankAnswers(t, ids.act, 728)
    vi.setSystemTime(new Date(2026, 9, 4, 9))
    await bankAnswers(t, ids.act, 1140, [
      { status: 'BOOK', amount: -10, day: '2026-10-04', name: 'Bolt' },
    ])
    const link = () =>
      t.run((ctx) =>
        ctx.db
          .query('bankLinks')
          .withIndex('by_owner_account', (q) =>
            q.eq('ownerId', ME).eq('accountId', ids.act),
          )
          .unique(),
      )
    expect((await link())?.questions).toHaveLength(1)

    vi.setSystemTime(at(10, 4))
    await screenshot(t, me, {
      institution: 'Banco BPI',
      accountTail: '4410',
      rows: [own(10, 3, 'TRF SEPA+ INST 24 P/ ACTIVOBANK', -422)],
      balance: { m: 10, d: 4, value: 3544 },
    })

    const begin = () =>
      t.mutation(internal.bankRows.begin, {
        ownerId: ME,
        accountId: ids.act,
        dayStart: local(10, 4),
        names: ['Artem Chernii'],
      })
    expect((await begin()).status).toBe('question')
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    await t.mutation(internal.bankRows.fail, {
      ownerId: ME,
      accountId: ids.act,
    })
    expect((await begin()).status).toBe('go')
    expect((await link())?.questions).toEqual([])
    const bolt = (await logsOf(t)).filter(
      (l) =>
        l.accountId === ids.act && l.value === 10 && l.occurredAt > at(10, 1),
    )
    expect(bolt).toHaveLength(1)
    vi.setSystemTime(at(10, 5))
    await addsUp(t, me, ids, { bpi: 3544, act: 1140, rev: 864.46 })
  })

  /* Revolut's sheet: "why we see still pending and new? I was those
     already many times." Two answers of the bank, each with a row
     pending: only the last says pending now. */
  test('of two bank answers with pending rows, only the last is pending now', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    await updateAll(t, me, statements)
    await linked(t, ids.rev)
    vi.setSystemTime(new Date(2026, 9, 2, 9, 30))
    await bankAnswers(t, ids.rev, 864.46, [
      { status: 'PDNG', amount: -6.7, day: '2026-10-02', name: 'Bnp Toc' },
    ])
    vi.setSystemTime(new Date(2026, 9, 3, 18, 10))
    await bankAnswers(t, ids.rev, 864.46, [
      { status: 'PDNG', amount: -22.14, day: '2026-10-03', name: 'Anthropic' },
    ])
    vi.setSystemTime(at(10, 4))

    const sheet = await me.query(api.aggregate.accountSheet, {
      accountId: ids.rev,
      head: true,
    })
    const syncs = (sheet?.readings ?? []).filter((r) => r.source === 'sync')
    expect(syncs.map((r) => r.pendingRows.length)).toEqual([1, 1])
    const latest = lastSync(syncs)
    expect(
      syncs.filter(latest).map((r) => r.pendingRows.map((p) => p.merchant)),
    ).toEqual([['Anthropic']])
    await addsUp(t, me, ids, { bpi: 3966, act: 728, rev: 864.46 })
  })

  /* Trade Republic through Enable Banking: a broker, not a bank. Its
     check takes the balance and no rows — its rows are buys the bank
     calls payments. A screenshot afterwards brings positions only. */
  test('a connected broker takes the bank’s balance; its screenshot saves positions only', async () => {
    const { t, me } = setup()
    const ids = await accounts(me)
    await updateAll(t, me, statements)
    const tr = await me.mutation(api.accounts.create, {
      name: 'Trade Republic',
      kinds: ['broker'],
      currencies: ['EUR'],
      product: 'trade-republic',
    })
    await me.mutation(api.accounts.setBalance, {
      accountId: tr,
      currency: 'EUR',
      value: 300,
      dayStart: local(9, 30),
      asOf: at(9, 30),
    })
    await linked(t, tr)
    const begun = await bankAnswers(t, tr, 727.49, [
      { status: 'BOOK', amount: -500.63, day: '2026-10-02', name: 'NVIDIA' },
    ])
    expect(begun).toMatchObject({ status: 'go', asks: [{ from: null }] })

    const batchId = await openBatch(t)
    await t.run(async (ctx) => {
      await ctx.db.insert('intakes', {
        ownerId: ME,
        batchId,
        accountId: tr,
        storageIds: [],
        status: 'ready',
        kind: 'holdings',
        title: 'Trade Republic screenshot',
        institution: 'Trade Republic',
        readAt: Date.now(),
        files: [
          { name: 'IMG_9320.PNG', size: 400_000, contentType: 'image/png' },
        ],
        positions: [
          ['VWCE.DE', 'Vanguard FTSE All-World', 'ETF', 10, 1300.2],
          ['NVDA', 'NVIDIA', 'EQUITY', 4, 540.12],
        ].map(([symbol, name, type, shares, valueEur]) => ({
          name: name as string,
          shares: shares as number,
          valueEur: valueEur as number,
          preferred: 0,
          candidates: [
            {
              symbol: symbol as string,
              name: name as string,
              exchange: 'GER',
              type: type as string,
            },
          ],
        })),
        cashEur: 120,
        totalEur: 1960.32,
      })
    })
    await me.mutation(api.intake.applyBatch, {
      batchId,
      dayStart: local(10, 4),
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const saved = await t.run(async (ctx) => ({
      rows: (await ctx.db.query('logs').collect()).filter(
        (l) => l.accountId === tr,
      ).length,
      positions: (await ctx.db.query('holdings').collect()).filter(
        (h) => h.accountId === tr,
      ).length,
      cash: (await ctx.db.query('stateSnapshots').collect())
        .filter((s) => s.key === `balance:${tr}:EUR`)
        .sort((a, b) => b.recordedAt - a.recordedAt)
        .map((s) => [s.value, s.source])[0],
    }))
    expect(saved).toEqual({ rows: 0, positions: 2, cash: [727.49, 'sync'] })
    await addsUp(t, me, ids, { bpi: 3966, act: 728, rev: 864.46 })
  })
})
