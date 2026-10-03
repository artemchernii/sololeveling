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
        had: false,
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
        likely: null,
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

test('a file that cannot go in fails alone; the rest is written and the batch opens again', async () => {
  const { t, me } = setup()
  const { bpi, act } = await accountsOf(me)
  const batchId = await emptyBatch(t)
  const usd = await readFile(t, batchId, {
    name: 'bpi-usd.pdf',
    institution: 'Banco BPI',
    accountTail: '4410',
    rows: [row(9, 2, 'EDP', -50)],
  })
  await t.run((ctx) =>
    ctx.db.patch(usd, {
      balance: { currency: 'USD', value: 10, asOf: day(9, 30) },
    }),
  )
  await readFile(t, batchId, {
    name: 'act.pdf',
    institution: 'ActivoBank',
    accountTail: '3402',
    rows: [row(9, 2, 'Vodafone', -10)],
  })
  await me.mutation(api.intake.applyBatch, { batchId, dayStart: day(10, 3) })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const logs = await t.run((ctx) => ctx.db.query('logs').collect())
  expect(logs.map((l) => [l.text, l.accountId])).toEqual([['Vodafone', act]])
  const failed = await t.run((ctx) => ctx.db.get(usd))
  expect(failed).toMatchObject({
    status: 'failed',
    error: 'Not applied: BPI does not hold USD.',
  })
  const r = await me.query(api.intake.batchReview, { batchId })
  expect(r.status).toBe('open')
  expect(r.asks).toMatchObject([{ kind: 'failed', intakeId: usd }])
  expect(bpi).toBeDefined()
})

test('a file read by an older reader is read again, not reused', async () => {
  const { t, me } = setup()
  const first = await stored(t, 'extrato.pdf')
  const a = await me.mutation(api.intake.start, { files: [first] })
  if (!a.ok) throw new Error(a.error)
  await t.mutation(internal.intake.finish, {
    intakeId: a.intakeId,
    kind: 'transactions',
    title: 'ActivoBank',
    transactions: [row(9, 1, 'TRF. P/O ARTEM CHERNII', 100)],
    positions: undefined,
    balance: undefined,
  })
  /* The same bytes again: reused while the reader is the same… */
  const same = await t.run((ctx) =>
    ctx.storage.store(new Blob([`file ${bytes}`], { type: 'application/pdf' })),
  )
  const b = await me.mutation(api.intake.start, {
    files: [{ ...first, storageId: same }],
  })
  if (!b.ok) throw new Error(b.error)
  expect((await t.run((ctx) => ctx.db.get(b.intakeId)))?.status).toBe('ready')
  /* …and read again once the reading came from an older one. */
  await t.run((ctx) => ctx.db.patch(a.intakeId, { reader: 1 }))
  await t.run((ctx) => ctx.db.patch(b.intakeId, { reader: 1 }))
  const again = await t.run((ctx) =>
    ctx.storage.store(new Blob([`file ${bytes}`], { type: 'application/pdf' })),
  )
  const c = await me.mutation(api.intake.start, {
    files: [{ ...first, storageId: again }],
  })
  if (!c.ok) throw new Error(c.error)
  expect((await t.run((ctx) => ctx.db.get(c.intakeId)))?.status).toBe('reading')
})

describe('his first real drop (3 Oct)', () => {
  test('a bank he has not added is its own block, kept with one tap', async () => {
    const { t, me } = setup()
    await accountsOf(me)
    await t.run(async (ctx) => {
      const all = await ctx.db.query('accounts').collect()
      for (const a of all.filter((x) => x.name === 'BPI'))
        await ctx.db.delete(a._id)
    })
    const batchId = await emptyBatch(t)
    const intakeId = await readFile(t, batchId, {
      name: 'attachment.pdf',
      institution: 'BPI',
      accountTail: '0120',
      rows: [row(8, 25, 'BNP PARIBAS', 2638.36), row(8, 25, 'EDP', -29.11)],
      balance: { m: 9, d: 23, value: 5084.68 },
    })
    const r = await me.query(api.intake.batchReview, { batchId })
    expect(r.asks).toEqual([])
    expect(r.accounts).toMatchObject([
      {
        accountId: null,
        product: { id: 'bpi', name: 'BPI', accountTail: '0120' },
        fresh: 2,
        last: { value: 5084.68 },
      },
    ])
    const bpi = await me.mutation(api.accounts.create, {
      name: 'BPI',
      kinds: ['bank'],
      currencies: ['EUR'],
      product: 'bpi',
      ibanTails: ['0120'],
    })
    await me.mutation(api.intake.batchAnswer, {
      batchId,
      answer: { kind: 'place', intakeIds: [intakeId], accountId: bpi },
    })
    const kept = await me.query(api.intake.batchReview, { batchId })
    expect(kept.accounts.map((a) => [a.accountId, a.product])).toEqual([
      [bpi, null],
    ])
  })

  test('a gap the pending rows explain is not asked; it is said', async () => {
    const { t, me } = setup()
    const { act } = await accountsOf(me)
    const batchId = await emptyBatch(t)
    await readFile(t, batchId, {
      name: 'extrato.pdf',
      institution: 'ActivoBank',
      accountTail: '3402',
      rows: [row(9, 28, 'Vodafone', -10)],
      balance: { m: 9, d: 30, value: 435.66 },
    })
    await readFile(t, batchId, {
      name: 'IMG_9238.PNG',
      institution: 'ActivoBank',
      accountTail: '3402',
      rows: [
        row(10, 1, 'TRF P/O OLEKSANDR SAKHNO', 100),
        row(10, 1, 'VIAVERDE', -2.25),
        row(10, 2, 'TRF P/O FRIEND', 1000),
        row(10, 2, 'TRF P/ COND', -175),
        { ...row(10, 3, 'Pending', -1205.2), pending: true },
      ],
      balance: { m: 10, d: 3, value: 153.21 },
    })
    const r = await me.query(api.intake.batchReview, { batchId })
    expect(r.asks).toEqual([])
    const block = r.accounts.find((a) => a.accountId === act)
    expect(block).toMatchObject({ gaps: 0, pending: -1205.2, fresh: 5 })
  })

  test("212's two screens go in as one: positions from one, cash from the other", async () => {
    const { t, me } = setup()
    const t212 = await me.mutation(api.accounts.create, {
      name: 'Trading 212',
      kinds: ['broker'],
      currencies: ['EUR'],
      product: 'trading-212',
    })
    const batchId = await emptyBatch(t)
    const screen = (name: string, extra: Record<string, unknown>) =>
      t.run((ctx) =>
        ctx.db.insert('intakes', {
          ownerId: ME,
          batchId,
          accountId: t212,
          storageIds: [],
          status: 'ready',
          kind: 'holdings',
          title: 'Invest',
          files: [{ name, size: 1, contentType: 'image/png' }],
          ...extra,
        }),
      )
    await screen('IMG_9239.PNG', {
      positions: [
        {
          name: 'iShares Physical Gold',
          shares: 7.36542714,
          valueEur: 526.21,
          changePct: -4.01,
          preferred: 0,
          candidates: [
            {
              symbol: 'IGLN.L',
              name: 'iShares Physical Gold ETC',
              exchange: 'LSE',
              type: 'ETF',
            },
          ],
        },
      ],
      totalEur: 2014.04,
    })
    await screen('IMG_9240.PNG', {
      positions: [],
      cashEur: 12994.22,
      totalEur: 15008.26,
    })
    const r = await me.query(api.intake.batchReview, { batchId })
    expect(r.asks).toEqual([])
    expect(r.accounts[0].holdings).toEqual({
      positions: 1,
      investedEur: 526.21,
      cashEur: 12994.22,
      totalEur: 15008.26,
      complete: true,
    })
    await me.mutation(api.intake.applyBatch, { batchId, dayStart: day(10, 3) })
    for (let i = 0; i < 4; i++)
      await t.mutation(internal.intake.applyStep, {
        batchId,
        dayStart: day(10, 3),
        names: [],
      })
    const holdings = await t.run((ctx) => ctx.db.query('holdings').collect())
    expect(holdings.map((h) => [h.accountId, h.shares, h.paidEur])).toEqual([
      [t212, 7.365427, 548.19],
    ])
    const bal = await me.query(api.aggregate.balances, {})
    expect(bal.accounts.find((a) => a.accountId === t212)?.cashEur).toBe(
      12994.22,
    )
    const left = await t.run((ctx) => ctx.db.query('intakes').collect())
    expect(left.map((i) => i.status)).toEqual(['done', 'done'])
  })

  test('a broker screen it cannot complete waits for the check screen', async () => {
    const { t, me } = setup()
    const t212 = await me.mutation(api.accounts.create, {
      name: 'Trading 212',
      kinds: ['broker'],
      currencies: ['EUR'],
    })
    const batchId = await emptyBatch(t)
    const intakeId = await t.run((ctx) =>
      ctx.db.insert('intakes', {
        ownerId: ME,
        batchId,
        accountId: t212,
        storageIds: [],
        status: 'ready',
        kind: 'holdings',
        title: 'Invest',
        files: [{ name: 'IMG.PNG', size: 1, contentType: 'image/png' }],
        positions: [
          { name: 'Vanguard S&P 500 (Acc)', valueEur: 261.53, candidates: [] },
        ],
      }),
    )
    const r = await me.query(api.intake.batchReview, { batchId })
    expect(r.asks).toEqual([
      {
        kind: 'holdings',
        intakeId,
        name: 'IMG.PNG',
        accountId: t212,
        missing: 1,
        positions: 1,
      },
    ])
  })
})

test("a listing whose price doesn't fit the screen is asked, not filed (212's SHLD, 3 Oct)", async () => {
  const { t, me } = setup()
  const t212 = await me.mutation(api.accounts.create, {
    name: 'Trading 212',
    kinds: ['broker'],
    currencies: ['EUR'],
  })
  const batchId = await emptyBatch(t)
  const intakeId = await t.run((ctx) =>
    ctx.db.insert('intakes', {
      ownerId: ME,
      batchId,
      accountId: t212,
      storageIds: [],
      status: 'ready',
      kind: 'holdings',
      title: 'Invest',
      files: [{ name: 'IMG_9239.PNG', size: 1, contentType: 'image/png' }],
      positions: [
        {
          name: 'iShares Digital Security (Digital Identity)',
          shares: 21.86787796,
          valueEur: 284.01,
          preferred: -1,
          candidates: [
            {
              symbol: 'SHLD',
              name: 'Global X Defense Tech ETF',
              exchange: 'NYSEArca',
              type: 'ETF',
            },
          ],
        },
      ],
    }),
  )
  const r = await me.query(api.intake.batchReview, { batchId })
  expect(r.asks).toEqual([
    {
      kind: 'holdings',
      intakeId,
      name: 'IMG_9239.PNG',
      accountId: t212,
      missing: 1,
      positions: 1,
    },
  ])
})

test('read again: his account named to the reader; another owner refused; start over throws the drop away', async () => {
  const { t, me, them } = setup()
  const { act } = await accountsOf(me)
  const started = await me.mutation(api.intake.startBatch, {
    files: [
      await stored(t, 'IMG_9238.PNG', 'image/png'),
      await stored(t, 'b.pdf'),
    ],
  })
  if (!started.ok) throw new Error(started.error)
  const [img, pdf] = (
    await me.query(api.intake.batch, { batchId: started.batchId })
  ).files
  expect(img.image).toBe(true)
  await t.run((ctx) =>
    ctx.db.patch(img.intakeId, { status: 'ready', accountId: act }),
  )
  await expect(
    them.mutation(api.intake.readAgain, { intakeId: img.intakeId }),
  ).rejects.toThrow('No such intake')
  await me.mutation(api.intake.readAgain, { intakeId: img.intakeId })
  const again = await t.run((ctx) => ctx.db.get(img.intakeId))
  expect(again).toMatchObject({ status: 'reading', hint: 'ActivoBank' })
  await expect(
    them.mutation(api.intake.discardBatch, { batchId: started.batchId }),
  ).rejects.toThrow('No such batch')
  await me.mutation(api.intake.discardBatch, { batchId: started.batchId })
  expect(await t.run((ctx) => ctx.db.query('intakes').collect())).toEqual([])
  expect(pdf.image).toBe(false)
  expect(await me.query(api.intake.openBatch, {})).toBeNull()
})

test("BPI's transfer pairs with ActivoBank's side already in the app — by the IBAN's last group (3 Oct)", async () => {
  const { t, me } = setup()
  const bpi = await me.mutation(api.accounts.create, {
    name: 'BPI',
    kinds: ['bank'],
    currencies: ['EUR'],
    ibanTails: ['0120'],
  })
  const act = await me.mutation(api.accounts.create, {
    name: 'ActivoBank',
    kinds: ['bank'],
    currencies: ['EUR'],
    ibanTails: ['0989'],
  })
  const kept = await t.run((ctx) =>
    ctx.db.insert('logs', {
      ownerId: ME,
      area: 'money',
      kind: 'move',
      value: 300,
      occurredAt: day(8, 27),
      unit: 'eur',
      text: 'Artem Chernii',
      accountId: act,
    }),
  )
  const batchId = await emptyBatch(t)
  await readFile(t, batchId, {
    name: 'attachment.pdf',
    institution: 'BPI',
    accountTail: '0120',
    rows: [
      self(row(8, 27, 'ARTEM CHERNII', -300), 'PT50002300004547874109894'),
      row(8, 25, 'EDP COMERCIAL', -29.11),
    ],
  })
  /* And ActivoBank's +€1,000 on 2 Oct, after BPI's statement ends: it
     cannot be known — but BPI is offered first. */
  const screen = await readFile(t, batchId, {
    name: 'IMG_9238.PNG',
    institution: 'ActivoBank',
    accountTail: '0989',
    rows: [self(row(10, 2, 'TRF. P/O ARTEM CHERNII', 1000))],
  })
  const r = await me.query(api.intake.batchReview, { batchId })
  expect(r.asks.filter((a) => a.kind === 'oneSide')).toMatchObject([
    { kind: 'oneSide', intakeId: screen, accountId: act, likely: bpi },
  ])
  await me.mutation(api.intake.batchAnswer, {
    batchId,
    answer: { kind: 'move', intakeId: screen, index: 0, otherAccountId: bpi },
  })
  expect(r.moves).toEqual([
    {
      fromAccountId: bpi,
      toAccountId: act,
      amount: 300,
      occurredAt: day(8, 27),
      days: 0,
      had: true,
    },
  ])
  await me.mutation(api.intake.applyBatch, { batchId, dayStart: day(10, 3) })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const moves = (await t.run((ctx) => ctx.db.query('logs').collect())).filter(
    (l) => l.kind === 'move',
  )
  expect(
    moves.map((l) => [l.accountId, l.value, l.meta?.pairOf ?? null]),
  ).toEqual([
    [act, 300, null],
    [bpi, -300, kept],
    [bpi, -1000, null],
    [act, 1000, expect.anything()],
  ])
})

test("'not from here': BPI's side goes, ActivoBank's +€1,000 stays — from outside (3 Oct)", async () => {
  const { t, me, them } = setup()
  const { bpi, act } = await accountsOf(me)
  const batchId = await emptyBatch(t)
  const screen = await readFile(t, batchId, {
    name: 'IMG_9238.PNG',
    institution: 'ActivoBank',
    accountTail: '3402',
    rows: [self(row(10, 2, 'TRF. P/O ARTEM CHERNII', 1000))],
  })
  await me.mutation(api.intake.batchAnswer, {
    batchId,
    answer: { kind: 'move', intakeId: screen, index: 0, otherAccountId: bpi },
  })
  await me.mutation(api.intake.applyBatch, { batchId, dayStart: day(10, 3) })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const sheet = await me.query(api.aggregate.accountSheet, { accountId: bpi })
  const side = sheet?.rows.find((r) => r.kind === 'move')
  expect(side).toMatchObject({ sideOf: 'ActivoBank', amount: -1000 })
  if (!side?.sideLogId) throw new Error('no side')
  await expect(
    them.mutation(api.logs.removeSide, { logId: side.sideLogId }),
  ).rejects.toThrow('No such log')
  await me.mutation(api.logs.removeSide, { logId: side.sideLogId })
  const logs = await t.run((ctx) => ctx.db.query('logs').collect())
  expect(
    logs.map((l) => [
      l.accountId,
      l.value,
      l.meta?.otherAccountId ?? null,
      l.meta?.pairOf ?? null,
    ]),
  ).toEqual([[act, 1000, null, null]])
  const actSheet = await me.query(api.aggregate.accountSheet, {
    accountId: act,
  })
  expect(actSheet?.rows[0].sideOf).toBeNull()
})

test("BPI's screenshots (3 Oct): own transfers by his name on other files and ActivoBank's bank code; a renamed row is already had", async () => {
  const { t, me } = setup()
  const bpi = await me.mutation(api.accounts.create, {
    name: 'BPI',
    kinds: ['bank'],
    currencies: ['EUR'],
    product: 'bpi',
  })
  const act = await me.mutation(api.accounts.create, {
    name: 'ActivoBank',
    kinds: ['bank'],
    currencies: ['EUR'],
    product: 'activo',
  })
  await t.run(async (ctx) => {
    /* His name, as an earlier statement printed it. */
    await ctx.db.insert('intakes', {
      ownerId: ME,
      storageIds: [],
      status: 'done',
      holderName: 'ARTEM CHERNII',
    })
    await ctx.db.insert('logs', {
      ownerId: ME,
      area: 'money',
      kind: 'expense',
      value: 24.95,
      occurredAt: day(9, 1),
      unit: 'eur',
      text: 'Seguro Allianz',
      accountId: bpi,
      meta: { merchant: 'Seguro Allianz', raw: 'SEGURO ALLIANZ MULTI-RISCOS' },
    })
  })
  const intakeId = await t.run((ctx) =>
    ctx.db.insert('intakes', {
      ownerId: ME,
      accountId: bpi,
      storageIds: [],
      status: 'ready',
      kind: 'transactions',
      title: 'BPI',
      transactions: [
        {
          ...row(10, 2, 'SEPA Transfer', -1000),
          raw: 'TRF SEPA+ INST 23 P/ PT50002300004547874109 8894 ARTEM CHERNII',
          counterparty: 'PT50002300004547874109',
        },
        {
          ...row(9, 1, 'Insurance', -24.95),
          raw: 'SEGURO ALLIANZ - MULTI-RISCOS-HABITACAO-CERTIF.: 201120549',
        },
      ],
    }),
  )
  const r = await me.query(api.intake.review, { intakeId })
  expect(
    r?.rows.map((x) => [x.kind, x.otherAccountId, x.duplicateOf !== null]),
  ).toEqual([
    ['move', act, false],
    ['spend', null, true],
  ])
})

test('dedupeMoney: lists first, removes only with apply, only his', async () => {
  const { t, me } = setup()
  const { act } = await accountsOf(me)
  const theirs = await t.run((ctx) =>
    ctx.db.insert('accounts', {
      ownerId: SOMEONE_ELSE,
      name: 'Theirs',
      kinds: ['bank'],
      currencies: ['EUR'],
      order: 0,
    } as never),
  )
  const log = (
    owner: string,
    accountId: Id<'accounts'>,
    merchant: string,
    raw: string,
  ) =>
    t.run((ctx) =>
      ctx.db.insert('logs', {
        ownerId: owner,
        area: 'money',
        kind: 'expense',
        value: 10,
        occurredAt: day(9, 1),
        unit: 'eur',
        text: merchant,
        accountId,
        meta: { merchant, raw },
      }),
    )
  await log(ME, act, 'Vodafone', 'Vodafone')
  const second = await log(
    ME,
    act,
    'PAG. 919703708 - VODAFONE',
    'PAG. 919703708 - VODAFONE',
  )
  await log(SOMEONE_ELSE, theirs, 'Vodafone', 'Vodafone')
  await log(SOMEONE_ELSE, theirs, 'PAG. VODAFONE', 'PAG. VODAFONE')
  const dry = await t.mutation(internal.migrations.dedupeMoney, {
    ownerId: ME,
    apply: false,
  })
  expect(dry.map((x) => x.id)).toEqual([second])
  expect(await t.run((ctx) => ctx.db.query('logs').collect())).toHaveLength(4)
  await t.mutation(internal.migrations.dedupeMoney, {
    ownerId: ME,
    apply: true,
  })
  const left = await t.run((ctx) => ctx.db.query('logs').collect())
  expect(left.map((l) => [l.ownerId === ME, l.text])).toEqual([
    [true, 'Vodafone'],
    [false, 'Vodafone'],
    [false, 'PAG. VODAFONE'],
  ])
})

test('relist: SHLD moves to SHLD.L — lists first, writes only with apply, only his', async () => {
  const { t, me } = setup()
  const { act } = await accountsOf(me)
  const setupOwner = (owner: string, accountId: Id<'accounts'>) =>
    t.run(async (ctx) => {
      const instrumentId = await ctx.db.insert('instruments', {
        ownerId: owner,
        symbol: 'SHLD',
        name: 'Global X Defense Tech ETF',
        exchange: 'NYSEArca',
        currency: 'USD',
        type: 'ETF',
      })
      await ctx.db.insert('holdings', {
        ownerId: owner,
        accountId,
        instrumentId,
        shares: 21.867878,
        asOf: day(10, 3),
      })
      return instrumentId
    })
  await setupOwner(ME, act)
  const theirs = await t.run((ctx) =>
    ctx.db.insert('accounts', {
      ownerId: SOMEONE_ELSE,
      name: 'Theirs',
      kinds: ['broker'],
      currencies: ['EUR'],
      order: 0,
    } as never),
  )
  await setupOwner(SOMEONE_ELSE, theirs)
  const to = {
    symbol: 'SHLD.L',
    name: 'iShares Digital Security UCITS ETF USD Dist',
    exchange: 'London',
    type: 'ETF',
  }
  const dry = await t.mutation(internal.migrations.relist, {
    ownerId: ME,
    from: 'SHLD',
    to,
    apply: false,
  })
  expect(dry).toEqual({
    holdings: [{ shares: 21.867878, day: expect.any(String) }],
    trades: 0,
  })
  const held = () =>
    t.run(async (ctx) =>
      Promise.all(
        (await ctx.db.query('holdings').collect()).map(async (h) => [
          h.ownerId === ME,
          (await ctx.db.get(h.instrumentId))?.symbol,
        ]),
      ),
    )
  expect(await held()).toEqual([
    [true, 'SHLD'],
    [false, 'SHLD'],
  ])
  await t.mutation(internal.migrations.relist, {
    ownerId: ME,
    from: 'SHLD',
    to,
    apply: true,
  })
  expect(await held()).toEqual([
    [true, 'SHLD.L'],
    [false, 'SHLD'],
  ])
})

test("a frozen share is valued as 212's screen shows it, attributed to the screen (LUKOIL, 3 Oct)", async () => {
  const { t, me } = setup()
  const t212 = await me.mutation(api.accounts.create, {
    name: 'Trading 212',
    kinds: ['broker'],
    currencies: ['EUR'],
  })
  const batchId = await emptyBatch(t)
  await t.run((ctx) =>
    ctx.db.insert('intakes', {
      ownerId: ME,
      batchId,
      accountId: t212,
      storageIds: [],
      status: 'ready',
      kind: 'holdings',
      title: 'Invest',
      files: [{ name: 'IMG_9241.PNG', size: 1, contentType: 'image/png' }],
      positions: [
        {
          name: 'LUKOIL',
          shares: 1.775508,
          valueEur: 11.14,
          changePct: -55.37,
          preferred: 0,
          candidates: [
            {
              symbol: 'LUKOY',
              name: 'LUKOIL',
              exchange: 'Trading 212',
              type: 'UNPRICED',
            },
          ],
        },
      ],
    }),
  )
  const r = await me.query(api.intake.batchReview, { batchId })
  expect(r.asks).toEqual([])
  await me.mutation(api.intake.applyBatch, { batchId, dayStart: day(10, 3) })
  for (let i = 0; i < 4; i++)
    await t.mutation(internal.intake.applyStep, {
      batchId,
      dayStart: day(10, 3),
      names: [],
    })
  const prices = await t.run((ctx) => ctx.db.query('prices').collect())
  expect(prices.map((p) => [p.currency, p.source])).toEqual([
    ['EUR', 'Trading 212 screen'],
  ])
  const pos = await me.query(api.aggregate.positions, {})
  expect(pos.rows.map((p) => [p.symbol, p.type, p.valueEur])).toEqual([
    ['LUKOY', 'UNPRICED', 11.14],
  ])
  expect(pos.totalEur).toBe(11.14)
})
