/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* UPDATE ALL (3 Oct): many statements dropped at once, one intake each,
   reviewed per account and applied together. Fake timers so no scheduled
   reading reaches the model. */
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 3, 12) })
})
afterEach(() => {
  vi.useRealTimers()
})

let bytes = 0

function setup() {
  const t = convexTest(schema, modules)
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

type T = ReturnType<typeof setup>['t']

async function stored(t: T, name: string, contentType = 'application/pdf') {
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([`file ${++bytes}`], { type: contentType })),
  )
  return { storageId, contentType, name, size: 10 }
}

const day = (m: number, d: number) => new Date(2026, m - 1, d, 12).getTime()

describe('startBatch', () => {
  test('one intake per file, tied to the batch; the batch shows each', async () => {
    const { t, me } = setup()
    const files = [
      await stored(t, 'extrato_BPI_2026-08.pdf'),
      await stored(t, 'extrato_BPI_2026-09.pdf'),
      await stored(t, 'revolut.csv', 'text/csv'),
    ]
    const started = await me.mutation(api.intake.startBatch, { files })
    if (!started.ok) throw new Error(started.error)
    const view = await me.query(api.intake.batch, { batchId: started.batchId })
    expect(view.status).toBe('open')
    expect(view.files.map((f) => [f.name, f.status])).toEqual([
      ['extrato_BPI_2026-08.pdf', 'reading'],
      ['extrato_BPI_2026-09.pdf', 'reading'],
      ['revolut.csv', 'reading'],
    ])
    expect(await me.query(api.intake.openBatch, {})).toBe(started.batchId)
  })

  test('refused whole when one file cannot be read — and its files are gone', async () => {
    const { t, me } = setup()
    const good = await stored(t, 'a.pdf')
    const bad = await stored(t, 'notes.txt', 'text/plain')
    const r = await me.mutation(api.intake.startBatch, { files: [good, bad] })
    expect(r).toEqual({
      ok: false,
      error: 'notes.txt is not a PDF, a CSV or a screenshot.',
    })
    const left = await t.run((ctx) => ctx.db.system.get(good.storageId))
    expect(left).toBeNull()
    const intakes = await t.run((ctx) => ctx.db.query('intakes').collect())
    expect(intakes).toEqual([])
  })

  test('counts only the files the model reads against the month', async () => {
    const { t, me } = setup()
    /* 38 PDFs read this month already. */
    await t.run(async (ctx) => {
      for (let i = 0; i < 38; i++)
        await ctx.db.insert('intakes', {
          ownerId: ME,
          storageIds: [],
          status: 'done',
          files: [{ name: 'x.pdf', size: 1, contentType: 'application/pdf' }],
        })
    })
    const csvs = [
      await stored(t, 'a.csv', 'text/csv'),
      await stored(t, 'b.csv', 'text/csv'),
      await stored(t, 'c.csv', 'text/csv'),
    ]
    const two = [await stored(t, 'a.pdf'), await stored(t, 'b.pdf')]
    const ok = await me.mutation(api.intake.startBatch, {
      files: [...csvs, ...two],
    })
    expect(ok.ok).toBe(true)
    const one = await stored(t, 'c.pdf')
    const over = await me.mutation(api.intake.startBatch, { files: [one] })
    expect(over).toEqual({
      ok: false,
      error:
        "That's 1 files to read and 0 reads left this month (40 in 30 days).",
    })
  })

  test('another owner cannot open my batch', async () => {
    const { t, me, them } = setup()
    const started = await me.mutation(api.intake.startBatch, {
      files: [await stored(t, 'a.pdf')],
    })
    if (!started.ok) throw new Error(started.error)
    await expect(
      them.query(api.intake.batch, { batchId: started.batchId }),
    ).rejects.toThrow('No such batch')
    expect(await them.query(api.intake.openBatch, {})).toBeNull()
  })

  test('a read file shows the account it is heading for and the days it covers', async () => {
    const { t, me } = setup()
    const bpi = await me.mutation(api.accounts.create, {
      name: 'BPI',
      kinds: ['bank'],
      currencies: ['EUR'],
      ibanTails: ['4410'],
    })
    const started = await me.mutation(api.intake.startBatch, {
      files: [await stored(t, 'extrato.pdf')],
    })
    if (!started.ok) throw new Error(started.error)
    const [file] = (
      await me.query(api.intake.batch, { batchId: started.batchId })
    ).files
    await t.mutation(internal.intake.finish, {
      intakeId: file.intakeId,
      kind: 'transactions',
      title: 'BPI statement',
      institution: 'Banco BPI',
      accountTail: '4410',
      transactions: [
        row(9, 2, 'Pingo Doce', -31.74),
        row(9, 28, 'EDP Comercial', -48.2),
      ],
      positions: undefined,
      balance: undefined,
    })
    const [read] = (
      await me.query(api.intake.batch, { batchId: started.batchId })
    ).files
    expect(read).toMatchObject({
      status: 'ready',
      accountId: bpi,
      rows: 2,
      from: day(9, 2),
      to: day(9, 28),
    })
  })
})

function row(m: number, d: number, merchant: string, amount: number) {
  return {
    occurredAt: day(m, d),
    merchant,
    raw: merchant,
    amount,
    currency: 'EUR',
    pending: false,
    self: false,
  }
}

/* A read statement in a batch, as the reader leaves it — inserted, so no
   scheduled reading ever runs in a test. */
async function readFile(
  t: T,
  batchId: Id<'batches'>,
  f: {
    name: string
    institution: string
    accountTail?: string
    rows: Array<ReturnType<typeof row>>
    balance?: { m: number; d: number; value: number }
  },
) {
  return await t.run((ctx) =>
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
      balance: f.balance
        ? {
            currency: 'EUR',
            value: f.balance.value,
            asOf: day(f.balance.m, f.balance.d),
          }
        : undefined,
    }),
  )
}

async function emptyBatch(t: T) {
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

const self = (r: ReturnType<typeof row>, counterparty?: string) => ({
  ...r,
  self: true,
  counterparty,
})

async function accountsOf(me: ReturnType<typeof setup>['me']) {
  const bpi = await me.mutation(api.accounts.create, {
    name: 'BPI',
    kinds: ['bank'],
    currencies: ['EUR'],
    ibanTails: ['4410'],
  })
  const act = await me.mutation(api.accounts.create, {
    name: 'ActivoBank',
    kinds: ['bank'],
    currencies: ['EUR'],
    ibanTails: ['3402'],
  })
  return { bpi, act }
}

describe('batchReview and apply', () => {
  test('per account: months, new rows, balances; a transfer across two files paired and written once', async () => {
    const { t, me } = setup()
    const { bpi, act } = await accountsOf(me)
    const batchId = await emptyBatch(t)
    await readFile(t, batchId, {
      name: 'bpi-aug.pdf',
      institution: 'Banco BPI',
      accountTail: '4410',
      rows: [row(8, 4, 'Pingo Doce', -40)],
      balance: { m: 8, d: 31, value: 1000 },
    })
    await readFile(t, batchId, {
      name: 'bpi-sep.pdf',
      institution: 'Banco BPI',
      accountTail: '4410',
      rows: [row(9, 2, 'EDP', -50), self(row(9, 3, 'TRF P/ ACTIVOBANK', -500))],
      balance: { m: 9, d: 30, value: 450 },
    })
    await readFile(t, batchId, {
      name: 'act-sep.pdf',
      institution: 'ActivoBank',
      accountTail: '3402',
      rows: [self(row(9, 4, 'TRF FROM BPI', 500)), row(9, 9, 'Vodafone', -10)],
      balance: { m: 9, d: 30, value: 690 },
    })
    const r = await me.query(api.intake.batchReview, { batchId })
    expect(r.ready).toBe(true)
    expect(r.months.at(-1)).toBe('2026-09')
    const [b, a] = r.accounts
    expect(b).toMatchObject({
      accountId: bpi,
      fresh: 3,
      had: 0,
      first: { value: 1000 },
      last: { value: 450 },
      gaps: 0,
    })
    expect(b.months.slice(-2)).toEqual(['add', 'add'])
    expect(a).toMatchObject({ accountId: act, fresh: 2 })
    expect(r.moves).toEqual([
      {
        fromAccountId: bpi,
        toAccountId: act,
        amount: 500,
        occurredAt: day(9, 3),
        days: 1,
      },
    ])
    expect(r.asks).toEqual([])

    await me.mutation(api.intake.applyBatch, { batchId, dayStart: day(10, 3) })
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    const logs = await t.run((ctx) => ctx.db.query('logs').collect())
    const moves = logs.filter((l) => l.kind === 'move')
    expect(moves.map((l) => [l.accountId, l.value])).toEqual([
      [bpi, -500],
      [act, 500],
    ])
    expect(logs.filter((l) => l.kind === 'expense')).toHaveLength(3)
    const view = await me.query(api.intake.batch, { batchId })
    expect(view.status).toBe('done')
    expect(view.applied).toMatchObject({ intakes: 3, accounts: 2 })
    const bal = await me.query(api.aggregate.balances, {})
    expect(bal.accounts.map((x) => x.cashEur)).toEqual([450, 690])
  })

  test('a missing month is asked, and a quiet one is not', async () => {
    const { t, me } = setup()
    const { bpi } = await accountsOf(me)
    const batchId = await emptyBatch(t)
    await readFile(t, batchId, {
      name: 'feb.pdf',
      institution: 'Banco BPI',
      accountTail: '4410',
      rows: [row(2, 4, 'A', -1)],
    })
    await readFile(t, batchId, {
      name: 'apr.pdf',
      institution: 'Banco BPI',
      accountTail: '4410',
      rows: [row(4, 4, 'B', -1)],
    })
    const r = await me.query(api.intake.batchReview, { batchId })
    expect(r.asks).toEqual([{ kind: 'hole', accountId: bpi, month: '2026-03' }])
    await me.mutation(api.intake.batchAnswer, {
      batchId,
      answer: { kind: 'quiet', accountId: bpi, month: '2026-03' },
    })
    const again = await me.query(api.intake.batchReview, { batchId })
    expect(again.asks).toEqual([])
  })

  test("balances that don't add up: where, and the row he adds is written with the rest", async () => {
    const { t, me } = setup()
    const { act } = await accountsOf(me)
    const batchId = await emptyBatch(t)
    await readFile(t, batchId, {
      name: 'a.pdf',
      institution: 'ActivoBank',
      accountTail: '3402',
      rows: [row(9, 2, 'X', -10)],
      balance: { m: 9, d: 3, value: 742.36 },
    })
    await readFile(t, batchId, {
      name: 'b.pdf',
      institution: 'ActivoBank',
      accountTail: '3402',
      rows: [row(9, 5, 'PayPal', -121)],
      balance: { m: 9, d: 10, value: 521.36 },
    })
    const r = await me.query(api.intake.batchReview, { batchId })
    const gap = r.asks.find((x) => x.kind === 'gap')
    expect(gap).toMatchObject({ accountId: act, gap: -100 })
    if (gap?.kind !== 'gap') throw new Error('no gap')
    await me.mutation(api.intake.batchAnswer, {
      batchId,
      answer: {
        kind: 'extra',
        key: gap.key,
        accountId: act,
        occurredAt: gap.to,
        amount: gap.gap,
      },
    })
    expect((await me.query(api.intake.batchReview, { batchId })).asks).toEqual(
      [],
    )
    await me.mutation(api.intake.applyBatch, { batchId, dayStart: day(10, 3) })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const logs = await t.run((ctx) => ctx.db.query('logs').collect())
    expect(
      logs
        .map((l) => [l.text, l.kind, l.value])
        .filter((x) => x[0] === 'Missing from the file'),
    ).toEqual([['Missing from the file', 'expense', 100]])
  })

  test('a move with one side is asked; outside the app writes it on its own', async () => {
    const { t, me } = setup()
    const { act } = await accountsOf(me)
    const batchId = await emptyBatch(t)
    const intakeId = await readFile(t, batchId, {
      name: 'a.pdf',
      institution: 'ActivoBank',
      accountTail: '3402',
      rows: [self(row(9, 27, 'TRF. P/O A. CHERNII', 250))],
    })
    const r = await me.query(api.intake.batchReview, { batchId })
    expect(r.asks).toEqual([
      {
        kind: 'oneSide',
        intakeId,
        index: 0,
        accountId: act,
        amount: 250,
        occurredAt: day(9, 27),
        merchant: 'TRF. P/O A. CHERNII',
      },
    ])
    await me.mutation(api.intake.batchAnswer, {
      batchId,
      answer: { kind: 'move', intakeId, index: 0, otherAccountId: null },
    })
    expect((await me.query(api.intake.batchReview, { batchId })).asks).toEqual(
      [],
    )
    await me.mutation(api.intake.applyBatch, { batchId, dayStart: day(10, 3) })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const logs = await t.run((ctx) => ctx.db.query('logs').collect())
    expect(logs.map((l) => [l.kind, l.value, l.accountId])).toEqual([
      ['move', 250, act],
    ])
  })

  test('a left-out account keeps waiting; the batch opens again', async () => {
    const { t, me } = setup()
    const { bpi } = await accountsOf(me)
    const batchId = await emptyBatch(t)
    await readFile(t, batchId, {
      name: 'bpi.pdf',
      institution: 'Banco BPI',
      accountTail: '4410',
      rows: [row(9, 2, 'EDP', -50)],
    })
    await readFile(t, batchId, {
      name: 'act.pdf',
      institution: 'ActivoBank',
      accountTail: '3402',
      rows: [row(9, 2, 'Vodafone', -10)],
    })
    await me.mutation(api.intake.batchAnswer, {
      batchId,
      answer: { kind: 'leaveOut', accountId: bpi, out: true },
    })
    await me.mutation(api.intake.applyBatch, { batchId, dayStart: day(10, 3) })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const logs = await t.run((ctx) => ctx.db.query('logs').collect())
    expect(logs.map((l) => l.text)).toEqual(['Vodafone'])
    const view = await me.query(api.intake.batch, { batchId })
    expect(view.status).toBe('open')
    expect(view.files.map((f) => f.status).sort()).toEqual(['done', 'ready'])
  })

  test('refused: still reading; another owner answering or applying', async () => {
    const { t, me, them } = setup()
    await accountsOf(me)
    const batchId = await emptyBatch(t)
    await readFile(t, batchId, {
      name: 'a.pdf',
      institution: 'Banco BPI',
      accountTail: '4410',
      rows: [row(9, 2, 'EDP', -50)],
    })
    await t.run((ctx) =>
      ctx.db.insert('intakes', {
        ownerId: ME,
        batchId,
        storageIds: [],
        status: 'reading',
      }),
    )
    await expect(
      me.mutation(api.intake.applyBatch, { batchId, dayStart: day(10, 3) }),
    ).rejects.toThrow('Some files are still being read.')
    await expect(
      them.mutation(api.intake.applyBatch, { batchId, dayStart: day(10, 3) }),
    ).rejects.toThrow('No such batch')
    await expect(
      them.mutation(api.intake.batchAnswer, {
        batchId,
        answer: { kind: 'dismiss', key: 'x' },
      }),
    ).rejects.toThrow('No such batch')
  })

  test("a file it cannot place is asked; placing it into another owner's account is refused", async () => {
    const { t, me, them } = setup()
    const { bpi } = await accountsOf(me)
    const theirs = await them.mutation(api.accounts.create, {
      name: 'Theirs',
      kinds: ['bank'],
      currencies: ['EUR'],
    })
    const batchId = await emptyBatch(t)
    const intakeId = await readFile(t, batchId, {
      name: 'IMG_4412.PNG',
      institution: 'Unknown app',
      rows: [row(9, 2, 'Bnp Toc', -6.7)],
    })
    const r = await me.query(api.intake.batchReview, { batchId })
    expect(r.asks).toMatchObject([{ kind: 'whose', intakeId, rows: 1 }])
    await expect(
      me.mutation(api.intake.batchAnswer, {
        batchId,
        answer: { kind: 'place', intakeIds: [intakeId], accountId: theirs },
      }),
    ).rejects.toThrow()
    await me.mutation(api.intake.batchAnswer, {
      batchId,
      answer: { kind: 'place', intakeIds: [intakeId], accountId: bpi },
    })
    const again = await me.query(api.intake.batchReview, { batchId })
    expect(again.asks).toEqual([])
    expect(again.accounts.map((a) => a.accountId)).toEqual([bpi])
  })
})

describe('around a batch', () => {
  test('more files join an open update; not another owner’s', async () => {
    const { t, me, them } = setup()
    const first = await me.mutation(api.intake.startBatch, {
      files: [await stored(t, 'feb.pdf')],
    })
    if (!first.ok) throw new Error(first.error)
    const more = await me.mutation(api.intake.startBatch, {
      files: [await stored(t, 'mar.pdf')],
      batchId: first.batchId,
    })
    expect(more).toEqual({ ok: true, batchId: first.batchId })
    const view = await me.query(api.intake.batch, { batchId: first.batchId })
    expect(view.files.map((f) => f.name)).toEqual(['feb.pdf', 'mar.pdf'])
    const theirs = await them.mutation(api.intake.startBatch, {
      files: [await stored(t, 'x.pdf')],
      batchId: first.batchId,
    })
    expect(theirs).toEqual({
      ok: false,
      error: 'That update is closed — start a new one.',
    })
  })

  test("a batch's files stay off Overview's open list; one opens by id, only mine", async () => {
    const { t, me, them } = setup()
    const started = await me.mutation(api.intake.startBatch, {
      files: [await stored(t, 'a.pdf')],
    })
    if (!started.ok) throw new Error(started.error)
    expect(await me.query(api.intake.open, {})).toEqual([])
    const [file] = (
      await me.query(api.intake.batch, { batchId: started.batchId })
    ).files
    expect(
      (await me.query(api.intake.one, { intakeId: file.intakeId }))?._id,
    ).toBe(file.intakeId)
    expect(
      await them.query(api.intake.one, { intakeId: file.intakeId }),
    ).toBeNull()
  })
})
