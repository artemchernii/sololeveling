/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const HOUR = 3_600_000
const NOON = new Date(2026, 9, 12, 12).getTime()
const DAY_START = new Date(2026, 9, 12).getTime()

/* Trading 212 connected (12 Oct). The account is the mock one of
   e2eBank.t212 — €1,280.30 free, 8 Nvidia, 1 ASML, from a file three days
   old — and Trading 212 is the canned one of t212Api.ts (E2E=1). */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function mock() {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const accountId = await me.mutation(api.e2eBank.t212, {})
  const args = { accountId, dayStart: DAY_START }
  const link = () =>
    t.run(async (ctx) =>
      ctx.db
        .query('bankLinks')
        .withIndex('by_owner_account', (q) =>
          q.eq('ownerId', ME).eq('accountId', accountId),
        )
        .unique(),
    )
  const looks = () =>
    t.run(async (ctx) =>
      ctx.db
        .query('holdings')
        .withIndex('by_owner_account', (q) =>
          q.eq('ownerId', ME).eq('accountId', accountId),
        )
        .collect(),
    )
  const cash = () =>
    t.run(async (ctx) =>
      ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q.eq('ownerId', ME).eq('key', `balance:${accountId}:EUR`),
        )
        .order('desc')
        .first(),
    )
  /* The next answer, asked some hours on. */
  const later = async (
    as: 'traded' | 'frozen' | 'cash' | 'refused' | 'down' | 'many',
  ) => {
    await me.mutation(api.e2eBank.answer, { as })
    vi.setSystemTime(Date.now() + 5 * HOUR)
    return await me.action(api.t212.check, args)
  }
  return { t, me, accountId, args, link, looks, cash, later }
}

test('connect: Trading 212 says what the file said — all the same, a look written, no block', async () => {
  const { me, args, link, looks, cash } = await mock()
  /* €1,200.30 to trade, €50 in pies, €30 held for orders: €1,280.30. */
  expect(await me.action(api.t212.connect, args)).toEqual({
    same: 3,
    changed: 0,
  })
  const l = await link()
  expect(l).toMatchObject({ status: 'linked', via: 't212', checkedAt: NOON })
  expect(l?.changed).toBeUndefined()
  expect(l?.checking).toBeUndefined()
  expect((await looks()).filter((h) => h.asOf === NOON)).toHaveLength(2)
  expect(await cash()).toMatchObject({ value: 1280.3, source: 'statement' })
})

test('bought and sold: saved with no press, and the block says what each was and is', async () => {
  const { me, args, link, looks, cash, later } = await mock()
  await me.action(api.t212.connect, args)
  expect(await later('traded')).toBe('checked')
  const at = NOON + 5 * HOUR

  const rows = (await me.query(api.aggregate.positions, {})).rows
  expect(rows.map((r) => [r.symbol, r.shares])).toEqual([['NVDA', 10]])
  expect(await cash()).toMatchObject({
    value: 1620.3,
    source: 'sync',
    recordedAt: at,
  })
  const changed = (await link())?.changed
  /* e2eBank.answer made the last answer five hours old. */
  expect(changed).toMatchObject({ at: NOON - 5 * HOUR, cashWas: 1280.3 })
  expect(changed?.lines.map((x) => [x.was, x.now]).sort()).toEqual([
    [1, 0],
    [8, 10],
  ])

  /* The same answer again writes nothing and the block stays as it is. */
  const before = await looks()
  vi.setSystemTime(at + 5 * HOUR)
  expect(await me.action(api.t212.check, args)).toBe('checked')
  expect(await looks()).toEqual(before)
  expect((await cash())?.recordedAt).toBe(at)
  expect((await link())?.changed).toEqual(changed)

  /* ✕: seen. It stays closed, and what was saved stays. */
  await me.mutation(api.t212.close, { accountId: args.accountId })
  vi.setSystemTime(at + 10 * HOUR)
  await me.action(api.t212.check, args)
  expect((await link())?.changed).toBeUndefined()
  expect((await me.query(api.aggregate.positions, {})).rows).toHaveLength(1)
})

test('a share no market prices is saved at Trading 212’s own price', async () => {
  const { t, me, args, link, later } = await mock()
  await me.action(api.t212.connect, args)
  await later('frozen')
  const [line] = (await link())?.changed?.lines ?? []
  expect(line).toMatchObject({ was: 0, now: 4 })
  const price = await t.run(async (ctx) => ({
    inst: await ctx.db.get(line.instrumentId),
    price: await ctx.db
      .query('prices')
      .withIndex('by_owner_instrument_time', (q) =>
        q.eq('ownerId', ME).eq('instrumentId', line.instrumentId),
      )
      .first(),
  }))
  expect(price.inst).toMatchObject({ symbol: 'FRZN', type: 'UNPRICED' })
  expect(price.price).toMatchObject({ price: 20, source: 'Trading 212' })
})

test('cash only: every company is a look of none, twenty new ones are twenty lines', async () => {
  const { me, args, link, later } = await mock()
  await me.action(api.t212.connect, args)
  await later('cash')
  expect((await me.query(api.aggregate.positions, {})).rows).toEqual([])
  expect((await link())?.changed).toMatchObject({ cashWas: 1280.3 })
  await me.mutation(api.t212.close, { accountId: args.accountId })
  await later('many')
  /* Nvidia and ASML are back, and twenty the account never held. */
  expect((await link())?.changed?.lines).toHaveLength(22)
})

test.each(['refused', 'down'] as const)(
  'Trading 212 %s: nothing is written, the link keeps why, the next answer clears it',
  async (why) => {
    const { me, args, link, looks, cash, later } = await mock()
    await me.action(api.t212.connect, args)
    const before = { looks: await looks(), cash: await cash() }
    expect(await later(why)).toBe(why)
    expect({ looks: await looks(), cash: await cash() }).toEqual(before)
    expect(await link()).toMatchObject({
      checkedAt: NOON - 5 * HOUR,
      failed: { why, at: NOON + 5 * HOUR },
    })
    expect((await link())?.checking).toBeUndefined()
    expect(await later('traded')).toBe('checked')
    expect((await link())?.failed).toBeUndefined()
  },
)

test('half an answer writes nothing: positions failed after the cash came', async () => {
  const { t, me, args, link, looks, cash } = await mock()
  await me.action(api.t212.connect, args)
  const before = { looks: await looks(), cash: await cash() }
  /* Only `arrive` writes, and a failed call never reaches it. */
  await t.mutation(internal.t212.begin, {
    ownerId: ME,
    accountId: args.accountId,
    connect: false,
  })
  await t.mutation(internal.t212.fail, {
    ownerId: ME,
    accountId: args.accountId,
    why: 'down',
  })
  expect({ looks: await looks(), cash: await cash() }).toEqual(before)
  expect((await link())?.failed?.why).toBe('down')
})

test('connect with no key on the backend, or a key not accepted: no link is kept', async () => {
  const { t, me, args, link } = await mock()
  vi.stubEnv('E2E', '')
  await expect(me.action(api.t212.connect, args)).rejects.toThrow(
    'The key is not on the backend yet. Nothing changed.',
  )
  expect(await link()).toBeNull()

  vi.stubEnv('E2E', '1')
  /* A first look that fails removes the link it began with. */
  await t.mutation(internal.t212.begin, {
    ownerId: ME,
    accountId: args.accountId,
    connect: true,
  })
  await t.mutation(internal.t212.fail, {
    ownerId: ME,
    accountId: args.accountId,
    why: 'refused',
  })
  expect(await link()).toBeNull()
})

test('refusals: another owner’s account, one that is not Trading 212, not connected, a look while one runs', async () => {
  const { t, me, args, link } = await mock()
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  await expect(other.action(api.t212.connect, args)).rejects.toThrow(
    'No such account.',
  )
  await expect(me.action(api.t212.check, args)).rejects.toThrow(
    'This account is not connected.',
  )
  const bank: Id<'accounts'> = await t.run(async (ctx) =>
    ctx.db.insert('accounts', {
      ownerId: ME,
      name: 'ActivoBank',
      kinds: ['bank'],
      currencies: ['EUR'],
      institution: 'activo',
      order: 1,
    }),
  )
  await expect(
    me.action(api.t212.connect, { ...args, accountId: bank }),
  ).rejects.toThrow('ActivoBank is not Trading 212.')

  await me.action(api.t212.connect, args)
  await expect(other.action(api.t212.check, args)).rejects.toThrow(
    'No such account.',
  )
  await expect(
    other.mutation(api.t212.close, { accountId: args.accountId }),
  ).rejects.toThrow('This account is not connected.')
  const id = (await link())?._id
  await t.run(async (ctx) => {
    if (id) await ctx.db.patch(id, { checking: Date.now() })
  })
  expect(await me.action(api.t212.check, args)).toBe('busy')
})

test('the card reads what changed in euros: shares × the stored price, then and now', async () => {
  const { t, me, args, later } = await mock()
  await me.action(api.t212.connect, args)
  expect((await me.query(api.bank.links, {}))[0]).toMatchObject({
    via: 't212',
    failed: null,
    changed: null,
  })
  await later('traded')
  const [link] = await me.query(api.bank.links, {})
  expect(link.changed).toEqual({
    at: NOON - 5 * HOUR,
    cash: { currency: 'EUR', was: 1280.3, now: 1620.3 },
    /* The larger move first. */
    lines: [
      {
        symbol: 'ASML.AS',
        name: 'ASML Holding N.V.',
        type: 'EQUITY',
        was: 1,
        now: 0,
        wasEur: 640,
        nowEur: 0,
      },
      {
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        type: 'EQUITY',
        was: 8,
        now: 10,
        wasEur: 1200,
        nowEur: 1500,
      },
    ],
  })
  await later('refused')
  expect((await me.query(api.bank.links, {}))[0].failed).toBe('refused')
  /* Nobody else's link is listed. */
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  expect(await other.query(api.bank.links, {})).toEqual([])
})
