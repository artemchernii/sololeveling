/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
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
        /* Every two weeks, and top-ups (4 Oct): bills whose amount varies. */
        ['Gym Light', 'expense', 2],
        ['Juros Emprestimo', 'expense', 1],
        ['Seguro Allianz', 'expense', 1],
        ['Vodafone', 'expense', 14],
      ].sort(),
    )
  })
})
