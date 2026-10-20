/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const DAY = 86_400_000
const NOON = new Date(2026, 9, 19, 12).getTime()
const DAY_START = new Date(2026, 9, 19).getTime()

/* Trade Republic's cash from the bank (19 Oct): a broker Enable Banking
   reaches gives its balance and nothing else — its rows are buys the bank
   calls payments. A screenshot after that brings positions, not cash.
   The canned bank of bankApi.ts: €727.49, then €685.09 with two rows. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
  vi.stubEnv('E2E', '1')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function connected(kinds: Array<'bank' | 'broker'>, product: string) {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const accountId = await me.mutation(api.accounts.create, {
    name: 'Trade Republic',
    kinds,
    currencies: ['EUR'],
    product,
  })
  await me.mutation(api.accounts.setBalance, {
    accountId,
    currency: 'EUR',
    value: 300,
    dayStart: DAY_START - 8 * DAY,
    asOf: NOON - 8 * DAY,
  })
  const url = await me.action(api.bank.connect, { accountId })
  const state = new URL(url, 'http://app').searchParams.get('state') as string
  await me.action(api.bank.finish, { code: 'one', state, dayStart: DAY_START })
  const balance = () =>
    t.run(async (ctx) => {
      const s = await ctx.db
        .query('stateSnapshots')
        .withIndex('by_owner_key_time', (q) =>
          q.eq('ownerId', ME).eq('key', `balance:${accountId}:EUR`),
        )
        .order('desc')
        .first()
      return s === null ? null : { value: s.value, source: s.source }
    })
  const rows = () =>
    t.run(async (ctx) =>
      ctx.db
        .query('logs')
        .withIndex('by_owner_account_time', (q) =>
          q.eq('ownerId', ME).eq('accountId', accountId),
        )
        .collect(),
    )
  /** The canned bank's next answer, `two`, a day on. */
  const checkAgain = async () => {
    vi.setSystemTime(NOON + DAY)
    await t.run(async (ctx) => {
      const l = await ctx.db
        .query('bankLinks')
        .withIndex('by_owner_account', (q) => q.eq('ownerId', ME))
        .unique()
      if (l === null || l.uids === undefined) throw new Error('no link')
      await ctx.db.patch(l._id, {
        uids: l.uids.map((u) => ({ ...u, uid: `${u.uid}:two` })),
      })
    })
    await me.action(api.bankRows.check, {
      accountId,
      dayStart: DAY_START + DAY,
    })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
  }
  return { t, me, accountId, balance, rows, checkAgain }
}

test('a broker connects: the bank’s balance is its free cash', async () => {
  const { balance } = await connected(['broker'], 'trade-republic')
  expect(await balance()).toEqual({ value: 727.49, source: 'sync' })
})

test('a broker’s next check asks for the balance only: no rows saved', async () => {
  const { t, accountId, balance, rows, checkAgain } = await connected(
    ['broker'],
    'trade-republic',
  )
  const begun = await t.mutation(internal.bankRows.begin, {
    ownerId: ME,
    accountId,
  })
  expect(begun).toMatchObject({ status: 'go', asks: [{ from: null }] })
  /* The check begun above is let go, as a failed one is. */
  await t.run(async (ctx) => {
    const l = await ctx.db
      .query('bankLinks')
      .withIndex('by_owner_account', (q) => q.eq('ownerId', ME))
      .unique()
    if (l !== null) await ctx.db.patch(l._id, { checking: undefined })
  })

  await checkAgain()
  expect(await balance()).toEqual({ value: 685.09, source: 'sync' })
  expect(await rows()).toEqual([])
})

test('a bank still asks for its rows', async () => {
  const { t, accountId } = await connected(['bank'], 'activo')
  const begun = await t.mutation(internal.bankRows.begin, {
    ownerId: ME,
    accountId,
  })
  expect(begun).toMatchObject({ status: 'go', asks: [{ from: '2026-10-18' }] })
})

test('a screenshot of a connected broker saves positions and leaves the bank’s cash', async () => {
  const { t, me, accountId, balance } = await connected(
    ['broker'],
    'trade-republic',
  )
  const intakeId = await t.run((ctx) =>
    ctx.db.insert('intakes', {
      ownerId: ME,
      storageIds: [],
      status: 'ready',
      kind: 'holdings',
      title: 'Trade Republic screenshot',
      positions: [],
      cashEur: 120,
    }),
  )
  await me.mutation(api.intake.confirmHoldings, {
    intakeId,
    accountId,
    asOf: NOON,
    dayStart: DAY_START,
    rows: [],
    cashEur: 120,
  })
  expect(await balance()).toEqual({ value: 727.49, source: 'sync' })
})

test('a screenshot of a broker not connected still writes its cash', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const accountId = await me.mutation(api.accounts.create, {
    name: 'Trade Republic',
    kinds: ['broker'],
    currencies: ['EUR'],
    product: 'trade-republic',
  })
  const intakeId = await t.run((ctx) =>
    ctx.db.insert('intakes', {
      ownerId: ME,
      storageIds: [],
      status: 'ready',
      kind: 'holdings',
      title: 'Trade Republic screenshot',
      positions: [],
      cashEur: 120,
    }),
  )
  await me.mutation(api.intake.confirmHoldings, {
    intakeId,
    accountId,
    asOf: NOON,
    dayStart: DAY_START,
    rows: [],
    cashEur: 120,
  })
  const s = await t.run((ctx) =>
    ctx.db
      .query('stateSnapshots')
      .withIndex('by_owner_key_time', (q) =>
        q.eq('ownerId', ME).eq('key', `balance:${accountId}:EUR`),
      )
      .first(),
  )
  expect(s?.value).toBe(120)
})
