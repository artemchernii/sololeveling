/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const DAY = 86_400_000
const days = [4, 3, 2, 1].map((n) => Date.UTC(2026, 9, 5) - n * DAY)

afterEach(() => {
  vi.unstubAllEnvs()
})

test('reset refuses anywhere but the test backend — his data is never touched', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.accounts.create, {
    name: 'Mine',
    kinds: ['bank'],
    currencies: ['EUR'],
  })
  await expect(me.mutation(api.e2e.reset, { days })).rejects.toThrow(
    'E2E functions run only on the test backend.',
  )
  expect(await me.query(api.accounts.list, {})).toHaveLength(1)
})

test('reset refuses a caller who is not signed in', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  await expect(t.mutation(api.e2e.reset, { days })).rejects.toThrow(
    'Not signed in',
  )
})

test('on the test backend: the bad day — old balances, Revolut EUR and USD', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days })
  const accounts = await me.query(api.accounts.list, {})
  expect(accounts.map((a) => a.name)).toEqual(['Revolut', 'ActivoBank', 'Cash'])
  expect(accounts[0].currencies).toEqual(['EUR', 'USD'])
  /* Again: replaced, never doubled. */
  await me.mutation(api.e2e.reset, { days })
  expect(await me.query(api.accounts.list, {})).toHaveLength(3)
})

test('readHoldings refuses anywhere but the test backend', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await expect(me.mutation(api.e2e.readHoldings, {})).rejects.toThrow(
    'E2E functions run only on the test backend.',
  )
})

test('on the test backend: a ready holdings reading, two shares and cash', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const id = await me.mutation(api.e2e.readHoldings, {})
  const intake = await t.run((ctx) => ctx.db.get(id))
  expect(intake).toMatchObject({
    ownerId: ME,
    status: 'ready',
    kind: 'holdings',
    cashEur: 120,
  })
  expect(intake?.positions).toHaveLength(2)
})

test('readTrades refuses anywhere but the test backend', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await expect(me.mutation(api.e2e.readTrades, { days })).rejects.toThrow(
    'E2E functions run only on the test backend.',
  )
})

test('on the test backend: a ready trades reading, none of them crypto', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const id = await me.mutation(api.e2e.readTrades, { days })
  const intake = await t.run((ctx) => ctx.db.get(id))
  expect(intake).toMatchObject({ ownerId: ME, status: 'ready', kind: 'trades' })
  expect(intake?.trades).toHaveLength(3)
  expect(intake?.trades?.some((x) => x.crypto)).toBe(false)
})

test('paySalary refuses anywhere but the test backend', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await expect(
    me.mutation(api.e2e.paySalary, { day: days[0] - DAY }),
  ).rejects.toThrow('E2E functions run only on the test backend.')
})

test('paySalary: the salary landed, so Spending has a pay month', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days })
  await me.mutation(api.e2e.paySalary, { day: days[0] - DAY })
  const p = await me.query(api.aggregate.payMonth, { today: days[3] + DAY })
  expect(p?.salaryName).toBe('Acme Payroll')
})
