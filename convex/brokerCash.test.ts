/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'
import type { Id } from './_generated/dataModel'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const NOON = new Date(2026, 9, 10, 12).getTime()
const DAY_START = new Date(2026, 9, 10).getTime()

/* Broker cash (10 Oct): an account that is a bank and a broker keeps the
   broker's cash beside its own — a holdings screen writes there and never
   over the bank's euros. */
beforeEach(() => {
  vi.useFakeTimers({ now: NOON })
})
afterEach(() => {
  vi.useRealTimers()
})

async function setup(kinds: Array<'bank' | 'broker'>) {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const accountId = await me.mutation(api.accounts.create, {
    name: 'Revolut',
    kinds,
    currencies: ['EUR'],
  })
  await me.mutation(api.accounts.setBalance, {
    accountId,
    currency: 'EUR',
    value: 1089,
    dayStart: DAY_START,
  })
  const screen = (ownerId = ME): Promise<Id<'intakes'>> =>
    t.run((ctx) =>
      ctx.db.insert('intakes', {
        ownerId,
        storageIds: [],
        status: 'ready',
        kind: 'holdings',
        title: 'Revolut Invest screenshot',
        positions: [],
        cashEur: 17_893.93,
      }),
    )
  const save = (intakeId: Id<'intakes'>, who = me) =>
    who.mutation(api.intake.confirmHoldings, {
      intakeId,
      accountId,
      asOf: NOON,
      dayStart: DAY_START,
      rows: [],
      cashEur: 17_893.93,
    })
  const keys = () =>
    t.run(async (ctx) =>
      (await ctx.db.query('stateSnapshots').collect())
        .map((r) => `${r.key.split(':')[0]}=${r.value}`)
        .sort(),
    )
  return { t, me, accountId, screen, save, keys }
}

test('a bank that is also a broker: the screen writes broker cash and leaves the bank', async () => {
  const { me, screen, save, keys } = await setup(['bank', 'broker'])
  await save(await screen())
  expect(await keys()).toEqual(['balance=1089', 'brokerCash=17893.93'])

  const b = await me.query(api.aggregate.balances, {})
  const [a] = b.accounts
  expect(a.cashEur).toBe(1089)
  expect(a.pockets).toHaveLength(1)
  expect(a.brokerCash).toMatchObject({ eur: 17_893.93, recordedAt: NOON })
  /* Every euro he has: the total counts both. */
  expect(b.total).toBe(18_982.93)
  expect(b.unread).toBe(0)
})

test('never read: the pocket is there, empty, counted as unread and added to nothing', async () => {
  const { me } = await setup(['bank', 'broker'])
  const b = await me.query(api.aggregate.balances, {})
  expect(b.accounts[0].brokerCash).toEqual({
    eur: null,
    recordedAt: null,
    moved: 0,
    movedRows: 0,
  })
  expect(b.total).toBe(1089)
  expect(b.unread).toBe(1)
})

test('a second screen the same day replaces the first', async () => {
  const { me, screen, save, accountId } = await setup(['bank', 'broker'])
  await save(await screen())
  await me.mutation(api.intake.confirmHoldings, {
    intakeId: await screen(),
    accountId,
    asOf: NOON,
    dayStart: DAY_START,
    rows: [],
    cashEur: 17_000,
  })
  const b = await me.query(api.aggregate.balances, {})
  expect(b.accounts[0].brokerCash?.eur).toBe(17_000)
})

test('a broker that is only a broker is untouched: its one cash line is the broker’s', async () => {
  const { me, screen, save, keys } = await setup(['broker'])
  await save(await screen())
  expect(await keys()).toEqual(['balance=17893.93'])
  const b = await me.query(api.aggregate.balances, {})
  expect(b.accounts[0].brokerCash).toBeNull()
  expect(b.accounts[0].cashEur).toBe(17_893.93)
})

test('a buy after the reading comes out of broker cash, not the bank’s euros', async () => {
  const { t, me, accountId, screen, save } = await setup(['bank', 'broker'])
  await save(await screen())
  await t.run(async (ctx) => {
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId: ME,
      symbol: 'AAPL',
      name: 'Apple',
      exchange: 'NMS',
      currency: 'USD',
      type: 'EQUITY',
    })
    await ctx.db.insert('trades', {
      ownerId: ME,
      accountId,
      instrumentId,
      side: 'buy',
      shares: 2,
      priceEur: 200,
      occurredAt: NOON + 60_000,
    })
  })
  vi.setSystemTime(NOON + 120_000)
  const [a] = (await me.query(api.aggregate.balances, {})).accounts
  expect(a.cashEur).toBe(1089)
  expect(a.brokerCash).toMatchObject({
    eur: 17_493.93,
    moved: -400,
    movedRows: 1,
  })
})

test('the cash line over time has it from the day of the reading', async () => {
  const { me, screen, save } = await setup(['bank', 'broker'])
  await save(await screen())
  const end = DAY_START + 86_400_000 - 1
  const h = await me.query(api.aggregate.cashHistory, {
    dayEnds: [end - 86_400_000, end],
  })
  expect(h.total.at(-1)).toBe(18_982.93)
  expect(h.total[0]).not.toBe(18_982.93)
})

test('another owner can neither write it nor read it', async () => {
  const { t, screen, save } = await setup(['bank', 'broker'])
  const other = t.withIdentity({ tokenIdentifier: OTHER })
  await expect(save(await screen(OTHER), other)).rejects.toThrow()
  await save(await screen())
  const theirs = await other.query(api.aggregate.balances, {})
  expect(theirs.accounts).toHaveLength(0)
  expect(theirs.total).toBe(0)
})

test('deleting the account takes its broker cash readings with it', async () => {
  const { t, me, accountId, screen, save } = await setup(['bank', 'broker'])
  await save(await screen())
  await me.mutation(api.accounts.erase, { accountId })
  expect(
    await t.run(async (ctx) =>
      (await ctx.db.query('stateSnapshots').collect()).filter((r) =>
        r.key.startsWith('brokerCash:'),
      ),
    ),
  ).toHaveLength(0)
})
