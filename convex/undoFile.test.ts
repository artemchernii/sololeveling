/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const NOON = new Date(2026, 9, 11, 12).getTime()
const DAY = 86_400_000

/* Taking a file back (11 Oct), from his ActivoBank as it stood that day:
   €153.21 read on 3 Oct, the −€700 top-up Revolut's file had written
   there, then the screenshot IMG_9282 saved — its rows and €90.35. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function setup() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days: [] })
  const batchId = await me.mutation(api.e2eUpdate.readActivo, { as: 'yours' })
  await me.mutation(api.intake.applyBatch, {
    batchId,
    dayStart: new Date(2026, 9, 11).getTime(),
  })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  const ids = await t.run(async (ctx) => {
    const accounts = await ctx.db.query('accounts').collect()
    const intakes = await ctx.db.query('intakes').collect()
    const named = (n: string) => {
      const a = accounts.find((x) => x.ownerId === ME && x.name === n)
      if (!a) throw new Error(`no ${n}`)
      return a._id
    }
    const screen = intakes.find((i) => i.batchId === batchId)
    const csv = intakes.find((i) => i.ownerId === ME && i !== screen)
    if (!screen || !csv) throw new Error('no files')
    return {
      activo: named('ActivoBank'),
      revolut: named('Revolut'),
      screen: screen._id,
      csv: csv._id,
    }
  })
  const euros = async (accountId: Id<'accounts'>) =>
    (await me.query(api.aggregate.balances, {})).accounts
      .find((a) => a.accountId === accountId)
      ?.pockets.find((p) => p.currency === 'EUR')?.value
  /* The rows files wrote (the mock's typed rows are not in question). */
  const rows = (accountId: Id<'accounts'>) =>
    t.run(async (ctx) =>
      (await ctx.db.query('logs').collect())
        .filter(
          (l) => l.accountId === accountId && l.meta?.intakeId !== undefined,
        )
        .map((l) => ({ text: l.text, value: l.value, meta: l.meta })),
    )
  return { t, me, batchId, euros, rows, ...ids }
}

test('his screenshot of 11 Oct is taken back: €90.35 is €153.21 again', async () => {
  const { t, me, activo, screen, euros, rows } = await setup()
  expect(await euros(activo)).toBe(90.35)
  expect(await rows(activo)).toHaveLength(4)

  expect(await me.query(api.undoFile.preview, { intakeId: screen })).toEqual({
    account: 'ActivoBank',
    /* −€25, −€37.86 and the €505.20 to Trade Republic the old balance
       already had off as pending. */
    rows: 3,
    trades: 0,
    positions: 0,
    elsewhere: [],
    elsewhereRows: 0,
    balanceOf: NOON - 3_600_000,
    cash: {
      currency: 'EUR',
      now: 90.35,
      after: 153.21,
      afterOf: NOON - 8 * DAY,
      newer: false,
    },
  })

  await me.mutation(api.undoFile.takeBack, { intakeId: screen })
  expect(await euros(activo)).toBe(153.21)
  /* Revolut's file wrote the top-up; it is not this file's to take. */
  expect((await rows(activo)).map((r) => r.text)).toEqual(['Top-up by *2789'])
  const sheet = await me.query(api.aggregate.accountSheet, {
    accountId: activo,
  })
  expect(sheet?.files.map((f) => f.id)).not.toContain(screen)
  expect(sheet?.readings.map((r) => r.value)).toEqual([153.21])
  /* The reading is kept, so the same file again is not read twice. */
  const kept = await t.run((ctx) => ctx.db.get(screen))
  expect(kept?.takenBackAt).toBe(NOON)
  expect(kept?.transactions).toHaveLength(4)
  /* The opened file still lists what was read, each row with its group. */
  const file = await me.query(api.intake.fileRows, { intakeId: screen })
  expect(file.rows.map((r) => [r.landed, r.category])).toEqual(
    Array(4).fill([false, null]),
  )
  expect(await me.query(api.undoFile.preview, { intakeId: screen })).toBeNull()
})

test('a balance a file sets carries the file', async () => {
  const { t, screen } = await setup()
  const set = await t.run(async (ctx) =>
    (await ctx.db.query('stateSnapshots').collect()).filter(
      (s) => s.intakeId !== undefined,
    ),
  )
  expect(set.map((s) => [s.value, s.intakeId])).toEqual([[90.35, screen]])
})

test('refused: not yours, not saved, taken back already', async () => {
  const { t, me, screen, batchId } = await setup()
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  await expect(
    other.mutation(api.undoFile.takeBack, { intakeId: screen }),
  ).rejects.toThrow('No such file')
  await expect(
    other.query(api.undoFile.preview, { intakeId: screen }),
  ).rejects.toThrow('No such file')
  await expect(
    other.mutation(api.undoFile.takeBackBatch, { batchId }),
  ).rejects.toThrow('No such drop')

  const waiting = await t.run((ctx) =>
    ctx.db.insert('intakes', {
      ownerId: ME,
      storageIds: [],
      status: 'ready',
      kind: 'transactions',
    }),
  )
  await expect(
    me.mutation(api.undoFile.takeBack, { intakeId: waiting }),
  ).rejects.toThrow('not saved yet')

  await me.mutation(api.undoFile.takeBack, { intakeId: screen })
  await expect(
    me.mutation(api.undoFile.takeBack, { intakeId: screen }),
  ).rejects.toThrow('already taken back')
  await expect(
    me.mutation(api.undoFile.takeBackBatch, { batchId }),
  ).rejects.toThrow('Nothing of that save is left')
})

test('undo on the landed card takes back what that save wrote', async () => {
  const { me, activo, batchId, euros, rows } = await setup()
  expect(await me.mutation(api.undoFile.takeBackBatch, { batchId })).toBe(1)
  expect(await euros(activo)).toBe(153.21)
  expect(await rows(activo)).toHaveLength(1)
})

test("Revolut's file goes with the row it wrote in ActivoBank; another file's row stays, unpaired", async () => {
  const { t, me, activo, revolut, csv, rows } = await setup()
  const at = NOON - 8 * DAY - 3_600_000
  const base = { ownerId: ME, area: 'money', unit: 'eur' } as const
  await t.run(async (ctx) => {
    /* Revolut's own side of the top-up, and a card payment. */
    await ctx.db.insert('logs', {
      ...base,
      kind: 'move',
      occurredAt: at,
      value: 700,
      text: 'Top-up by *2789',
      accountId: revolut,
      meta: { intakeId: csv, otherAccountId: activo },
    })
    const sent = await ctx.db.insert('logs', {
      ...base,
      kind: 'move',
      occurredAt: at - DAY,
      value: -50,
      text: 'To ActivoBank',
      accountId: revolut,
      meta: { intakeId: csv, otherAccountId: activo },
    })
    /* ActivoBank's own statement read the arriving side two days on. */
    const statement = await ctx.db.insert('intakes', {
      ownerId: ME,
      accountId: activo,
      storageIds: [],
      status: 'done',
      kind: 'transactions',
    })
    await ctx.db.insert('logs', {
      ...base,
      kind: 'move',
      occurredAt: at + DAY,
      value: 50,
      text: 'From Revolut',
      accountId: activo,
      meta: { intakeId: statement, otherAccountId: revolut, pairOf: sent },
    })
  })

  const p = await me.query(api.undoFile.preview, { intakeId: csv })
  expect(p).toMatchObject({
    account: 'Revolut',
    rows: 2,
    elsewhereRows: 1,
    elsewhere: [{ account: 'ActivoBank', amount: -700, currency: 'EUR', at }],
    balanceOf: null,
  })

  await me.mutation(api.undoFile.takeBack, { intakeId: csv })
  expect(await rows(revolut)).toEqual([])
  const left = await rows(activo)
  expect(left.map((r) => r.text).sort()).toEqual(
    [
      'From Revolut',
      'Trade Republic',
      'Transfer to Andrei Pavlov',
      'Veiga e Seabra',
    ].sort(),
  )
  expect(
    left.find((r) => r.text === 'From Revolut')?.meta?.pairOf,
  ).toBeUndefined()
})

test('an older file: its rows go, the newer balance stays', async () => {
  const { t, me, activo, euros } = await setup()
  const old = await t.run(async (ctx) => {
    const id = await ctx.db.insert('intakes', {
      ownerId: ME,
      accountId: activo,
      storageIds: [],
      status: 'done',
      kind: 'transactions',
      balance: { currency: 'EUR', value: 400, asOf: NOON - 20 * DAY },
    })
    await ctx.db.insert('logs', {
      ownerId: ME,
      area: 'money',
      kind: 'expense',
      unit: 'eur',
      occurredAt: NOON - 22 * DAY,
      value: 12,
      text: 'Lidl',
      accountId: activo,
      meta: { intakeId: id },
    })
    /* Saved before balances carried their file: found by amount and day. */
    await ctx.db.insert('stateSnapshots', {
      ownerId: ME,
      area: 'money',
      key: `balance:${activo}:EUR`,
      value: 400,
      unit: 'eur',
      recordedAt: NOON - 20 * DAY + 6 * 3_600_000,
      source: 'statement',
    })
    return id
  })
  expect(await me.query(api.undoFile.preview, { intakeId: old })).toMatchObject(
    {
      rows: 1,
      balanceOf: NOON - 20 * DAY,
      cash: { now: 90.35, after: 90.35, newer: true },
    },
  )
  await me.mutation(api.undoFile.takeBack, { intakeId: old })
  expect(await euros(activo)).toBe(90.35)
  const sheet = await me.query(api.aggregate.accountSheet, {
    accountId: activo,
  })
  expect(sheet?.readings.map((r) => r.value).sort()).toEqual([153.21, 90.35])
})
