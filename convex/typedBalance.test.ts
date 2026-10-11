/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const NOON = new Date(2026, 9, 12, 12).getTime()
const DAY = 86_400_000

/* Removing a typed balance (11 Oct), from his ActivoBank as it stood:
   €153.21 read on 3 Oct off a screenshot, then a number typed by hand. */
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
  await me.mutation(api.e2eUpdate.readActivo, { as: 'yours' })
  const activo = await t.run(async (ctx) => {
    const a = (await ctx.db.query('accounts').collect()).find(
      (x) => x.ownerId === ME && x.name === 'ActivoBank',
    )
    if (!a) throw new Error('no ActivoBank')
    return a._id
  })
  const type = (value: number, asOf?: number) =>
    me.mutation(api.accounts.setBalance, {
      accountId: activo,
      currency: 'EUR',
      value,
      dayStart: new Date(2026, 9, 12).getTime(),
      ...(asOf === undefined ? {} : { asOf }),
    })
  const readings = async () =>
    (await me.query(api.aggregate.accountSheet, { accountId: activo }))
      ?.readings ?? []
  const euros = async () =>
    (await me.query(api.aggregate.balances, {})).accounts
      .find((a) => a.accountId === activo)
      ?.pockets.find((p) => p.currency === 'EUR')?.value
  return { t, me, activo, type, readings, euros }
}

test('the newest typed balance goes and the account stands on the one before', async () => {
  const { me, type, readings, euros } = await setup()
  const before = await euros()
  await type(190.35)
  expect(await euros()).toBe(190.35)
  const mine = (await readings()).find((r) => r.source === 'typed')
  if (!mine) throw new Error('no typed balance')
  const p = await me.query(api.typedBalance.preview, { snapshotId: mine.id })
  expect(p).toMatchObject({
    account: 'ActivoBank',
    now: 190.35,
    after: before,
    newer: false,
  })
  await me.mutation(api.typedBalance.remove, { snapshotId: mine.id })
  expect(await euros()).toBe(before)
  expect((await readings()).some((r) => r.source === 'typed')).toBe(false)
})

test('an older typed balance goes and the amount does not move', async () => {
  const { me, type, readings, euros } = await setup()
  await type(1480, NOON - 17 * DAY)
  const now = await euros()
  const mine = (await readings()).find((r) => r.source === 'typed')
  if (!mine) throw new Error('no typed balance')
  const p = await me.query(api.typedBalance.preview, { snapshotId: mine.id })
  expect(p).toMatchObject({ now, after: now, newer: true })
  await me.mutation(api.typedBalance.remove, { snapshotId: mine.id })
  expect(await euros()).toBe(now)
})

test('the only balance goes: none is left, the rows stay', async () => {
  const { t, me, activo, type, readings, euros } = await setup()
  await t.run(async (ctx) => {
    for (const s of await ctx.db.query('stateSnapshots').collect())
      if (s.key === `balance:${activo}:EUR`) await ctx.db.delete(s._id)
  })
  await type(80)
  const rows = (await me.query(api.aggregate.accountSheet, {
    accountId: activo,
  }))!.rows.length
  const mine = (await readings())[0]
  const p = await me.query(api.typedBalance.preview, { snapshotId: mine.id })
  expect(p).toMatchObject({ now: 80, after: null, afterOf: null })
  await me.mutation(api.typedBalance.remove, { snapshotId: mine.id })
  expect(await euros()).toBeNull()
  expect(
    (await me.query(api.aggregate.accountSheet, { accountId: activo }))!.rows
      .length,
  ).toBe(rows)
})

test('refused: a balance a file set, and one that is not yours', async () => {
  const { t, me, type, readings } = await setup()
  const file = (await readings()).find((r) => r.source === 'screenshot')
  if (!file) throw new Error('no file balance')
  expect(
    await me.query(api.typedBalance.preview, { snapshotId: file.id }),
  ).toBeNull()
  await expect(
    me.mutation(api.typedBalance.remove, { snapshotId: file.id }),
  ).rejects.toThrow(/take the file back/)
  await type(190.35)
  const mine = (await readings()).find((r) => r.source === 'typed')
  if (!mine) throw new Error('no typed balance')
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  expect(
    await other.query(api.typedBalance.preview, { snapshotId: mine.id }),
  ).toBeNull()
  await expect(
    other.mutation(api.typedBalance.remove, { snapshotId: mine.id }),
  ).rejects.toThrow(/No such balance/)
  expect((await readings()).some((r) => r.source === 'typed')).toBe(true)
})
