/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

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

