/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { expect, test } from 'vitest'

import schema from './schema'
import { applyRow, forDrop } from './transferMatch'
import type { DropRow } from './transferMatch'
import type { Doc, Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const oct = (d: number) => new Date(2026, 9, d, 12).getTime()

type Log = Partial<Doc<'logs'>> & { value: number; occurredAt: number }

/* His three accounts as they stood on 11 Oct: ActivoBank, Revolut (which
   holds the card ending 2789) and Trade Republic, each with one file. */
async function setup() {
  const t = convexTest(schema, modules)
  const ids = await t.run(async (ctx) => {
    const account = (name: string, order: number, cardTails: Array<string>) =>
      ctx.db.insert('accounts', {
        ownerId: ME,
        name,
        kinds: ['bank'],
        currencies: ['EUR'],
        ibanTails: [],
        cardTails,
        order,
      })
    const activo = await account('ActivoBank', 0, [])
    const revolut = await account('Revolut', 1, ['2789'])
    const tr = await account('Trade Republic', 2, [])
    const file = (accountId: Id<'accounts'>) =>
      ctx.db.insert('intakes', {
        ownerId: ME,
        accountId,
        storageIds: [],
        status: 'done',
        kind: 'transactions',
      })
    return {
      activo,
      revolut,
      tr,
      activoFile: await file(activo),
      revolutFile: await file(revolut),
      trFile: await file(tr),
    }
  })
  const log = (accountId: Id<'accounts'>, l: Log, ownerId = ME) =>
    t.run((ctx) =>
      ctx.db.insert('logs', {
        ownerId,
        area: 'money',
        kind: 'move',
        unit: 'eur',
        accountId,
        ...l,
      }),
    )
  const logs = (accountId: Id<'accounts'>) =>
    t.run(async (ctx) =>
      (await ctx.db.query('logs').collect())
        .filter((l) => l.accountId === accountId)
        .sort(
          (a, b) =>
            a.occurredAt - b.occurredAt || a._creationTime - b._creationTime,
        ),
    )
  const drop = (rows: Array<DropRow>, dismissed: Array<string> = []) =>
    t.run(async (ctx) =>
      forDrop(
        ctx,
        ME,
        await ctx.db
          .query('accounts')
          .withIndex('by_owner_order', (q) => q.eq('ownerId', ME))
          .take(10),
        rows,
        dismissed,
      ),
    )
  const apply = (row: DropRow, sideId: string) =>
    t.run(async (ctx) => {
      const account = await ctx.db.get(row.accountId)
      if (account === null) throw new Error('no account')
      return applyRow(ctx, ME, {
        account,
        intakeId: row.intakeId,
        row,
        sideId,
      })
    })
  /* ActivoBank's screenshot of 11 Oct: the top-up, booked on the 6th. */
  const compra: DropRow = {
    key: `${ids.activoFile}:1`,
    intakeId: ids.activoFile,
    accountId: ids.activo,
    occurredAt: oct(6),
    amount: -700,
    currency: 'EUR',
    merchant: 'COMPRA 2789 REVOLUT',
    move: false,
  }
  /* Trade Republic's file: what arrived of the €505.20. */
  const arrived: DropRow = {
    key: `${ids.trFile}:0`,
    intakeId: ids.trFile,
    accountId: ids.tr,
    occurredAt: oct(2),
    amount: 500.63,
    currency: 'EUR',
    merchant: 'Deposit',
    move: false,
  }
  /* ActivoBank's row of it, as his data has it: no side on Trade Republic. */
  const sent = () =>
    log(ids.activo, {
      occurredAt: oct(6),
      value: -505.2,
      text: 'Trade Republic',
      meta: {
        merchant: 'Trade Republic',
        intakeId: ids.activoFile,
        otherAccountId: ids.tr,
      },
    })
  return { t, ids, log, logs, drop, apply, compra, arrived, sent }
}

test("his €700 top-up, written by Revolut's file on 3 Oct: already added, and saving it writes nothing", async () => {
  const { ids, log, logs, drop, apply, compra } = await setup()
  const out = await log(ids.activo, {
    occurredAt: oct(3),
    value: -700,
    text: 'Top-up by *2789',
    meta: {
      merchant: 'Top-up by *2789',
      intakeId: ids.revolutFile,
      otherAccountId: ids.revolut,
    },
  })
  await log(ids.revolut, {
    occurredAt: oct(3),
    value: 700,
    text: 'Top-up by *2789',
    meta: {
      intakeId: ids.revolutFile,
      otherAccountId: ids.activo,
      pairOf: out,
    },
  })
  const [found, ...rest] = await drop([compra])
  expect(rest).toEqual([])
  expect(found).toMatchObject({
    key: compra.key,
    state: 'sure',
    chosen: out,
    sides: [
      {
        id: out,
        here: true,
        fee: 0,
        occurredAt: oct(3),
        amount: -700,
        merchant: 'Top-up by *2789',
        stored: true,
      },
    ],
  })
  expect(await apply(compra, out)).toBe('skipped')
  expect((await logs(ids.activo)).map((l) => l.value)).toEqual([-700])
})

test('€500.63 arrived of his €505.20: asked, and "same transfer" writes one side and the fee', async () => {
  const { ids, logs, drop, apply, arrived, sent } = await setup()
  const out = await sent()
  const [found] = await drop([arrived])
  expect(found).toMatchObject({
    state: 'ask',
    chosen: null,
    sides: [{ id: out, here: false, fee: 4.57, amount: -505.2 }],
  })
  const same = `same:${arrived.key}:${out}`
  expect((await drop([arrived], [same]))[0]).toMatchObject({
    state: 'same',
    chosen: out,
  })
  expect((await drop([arrived], [`apart:${arrived.key}`]))[0]).toMatchObject({
    state: 'apart',
    chosen: null,
  })

  expect(await apply(arrived, out)).toBe('written')
  const tr = await logs(ids.tr)
  expect(tr.map((l) => [l.kind, l.value, l.meta?.category ?? null])).toEqual([
    ['move', 505.2, null],
    ['expense', 4.57, 'fees'],
  ])
  expect(tr[0].meta).toMatchObject({
    pairOf: out,
    otherAccountId: ids.activo,
    intakeId: ids.trFile,
  })
  expect(tr[1].meta?.intakeId).toBe(ids.trFile)
  /* ActivoBank gains no row. */
  const activo = await logs(ids.activo)
  expect(activo.map((l) => l.value)).toEqual([-505.2])
  /* Paired now: the same file dropped again is offered nothing. */
  expect(await drop([{ ...arrived, key: 'again:0' }])).toEqual([])
})

test('the other order: the arrival was saved as money in, the sending file comes later', async () => {
  const { ids, log, logs, drop, apply } = await setup()
  const had = await log(ids.tr, {
    kind: 'income',
    occurredAt: oct(2),
    value: 500.63,
    text: 'Deposit',
    meta: { merchant: 'Deposit', intakeId: ids.trFile },
  })
  const row: DropRow = {
    key: `${ids.activoFile}:2`,
    intakeId: ids.activoFile,
    accountId: ids.activo,
    occurredAt: oct(6),
    amount: -505.2,
    currency: 'EUR',
    merchant: 'Trade Republic',
    move: true,
  }
  expect((await drop([row]))[0]).toMatchObject({
    state: 'ask',
    sides: [{ id: had, fee: 4.57, amount: 500.63 }],
  })
  expect(await apply(row, had)).toBe('written')
  const activo = await logs(ids.activo)
  expect(activo.map((l) => [l.kind, l.value])).toEqual([['move', -505.2]])
  const tr = await logs(ids.tr)
  expect(tr.map((l) => [l.kind, l.value])).toEqual([
    ['move', 505.2],
    ['expense', 4.57],
  ])
  expect(tr[0].meta?.pairOf).toBe(activo[0]._id)
  /* Trade Republic's balance is what it was: 505.20 − 4.57 = 500.63. */
  expect(Math.round((505.2 - 4.57) * 100)).toBe(50063)
})

test("ActivoBank's file wrote both sides as €505.20: Trade Republic's own €500.63 adds only the fee", async () => {
  const { ids, log, logs, drop, apply, arrived, sent } = await setup()
  const out = await sent()
  const side = await log(ids.tr, {
    occurredAt: oct(6),
    value: 505.2,
    text: 'Trade Republic',
    meta: { intakeId: ids.activoFile, otherAccountId: ids.activo, pairOf: out },
  })
  expect((await drop([arrived]))[0]).toMatchObject({
    state: 'ask',
    sides: [{ id: side, here: true, fee: 4.57 }],
  })
  expect(await apply(arrived, side)).toBe('skipped')
  expect((await logs(ids.tr)).map((l) => [l.kind, l.value])).toEqual([
    ['expense', 4.57],
    ['move', 505.2],
  ])
})

test('both files in one drop: each row names the other; the first saved is written as its file shows, the second pairs with it', async () => {
  const { t, ids, log, logs, drop, apply, compra } = await setup()
  const topUp: DropRow = {
    key: `${ids.revolutFile}:0`,
    intakeId: ids.revolutFile,
    accountId: ids.revolut,
    occurredAt: oct(3),
    amount: 700,
    currency: 'EUR',
    merchant: 'Top-up by *2789',
    move: true,
  }
  await t.run((ctx) =>
    ctx.db.patch(ids.revolutFile, {
      transactions: [
        {
          occurredAt: oct(3),
          amount: 700,
          currency: 'EUR',
          merchant: 'Top-up by *2789',
          raw: '',
          pending: false,
          self: false,
        },
      ],
    }),
  )
  const found = await drop([topUp, compra])
  expect(found.map((f) => [f.key, f.state, f.chosen])).toEqual(
    [
      [topUp.key, 'sure', compra.key],
      [compra.key, 'sure', topUp.key],
    ].sort((a, b) => a[0].localeCompare(b[0])),
  )
  expect(found[0].sides[0].stored).toBe(false)
  /* Nothing of the other file is saved yet. */
  expect(await apply(compra, topUp.key)).toBeNull()
  /* Revolut's row saved as its file shows it… */
  await log(ids.revolut, {
    occurredAt: oct(3),
    value: 700,
    text: 'Top-up by *2789',
    meta: { intakeId: ids.revolutFile },
  })
  /* …then ActivoBank's is its other side. */
  expect(await apply(compra, topUp.key)).toBe('written')
  const [activo] = await logs(ids.activo)
  const [revolut] = await logs(ids.revolut)
  expect([activo.kind, activo.value]).toEqual(['move', -700])
  expect(revolut.meta).toMatchObject({
    pairOf: activo._id,
    otherAccountId: ids.activo,
  })
})

test('refused: another person, another currency, six days, a fee too large, a side that has its pair', async () => {
  const { ids, log, drop, apply, arrived } = await setup()
  const theirs = await log(
    ids.activo,
    { occurredAt: oct(6), value: -505.2, meta: { otherAccountId: ids.tr } },
    OTHER,
  )
  await log(ids.activo, { occurredAt: oct(6), value: -505.2, unit: 'usd' })
  await log(ids.activo, { occurredAt: oct(8) + 1, value: -505.2 })
  await log(ids.activo, { occurredAt: oct(4), value: -520 })
  const out = await log(ids.activo, { occurredAt: oct(3), value: -505.2 })
  await log(ids.tr, { occurredAt: oct(3), value: 505.2, meta: { pairOf: out } })
  /* It names another account: Revolut's, not Trade Republic's. */
  await log(ids.activo, {
    occurredAt: oct(5),
    value: -505.2,
    meta: { otherAccountId: ids.revolut },
  })
  expect(await drop([arrived])).toEqual([])
  expect(await apply(arrived, theirs)).toBeNull()
  expect(await apply(arrived, 'not-an-id')).toBeNull()
  /* A side that no longer fits is not paired. */
  const far = await log(ids.activo, { occurredAt: oct(20), value: -505.2 })
  expect(await apply(arrived, far)).toBeNull()
})
