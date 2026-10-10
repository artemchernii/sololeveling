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

test('readHistory refuses anywhere but the test backend', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await expect(me.mutation(api.e2e.readHistory, { days })).rejects.toThrow(
    'E2E functions run only on the test backend.',
  )
})

test('on the test backend: a ready history in an update of its own', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const batchId = await me.mutation(api.e2e.readHistory, { days })
  expect(await me.query(api.intake.openBatch, {})).toBe(batchId)
  const rows = await t.run((ctx) => ctx.db.query('intakeTrades').collect())
  expect(rows).toHaveLength(31)
})

test('the update mocks refuse anywhere but the test backend', async () => {
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const batchId = await t.run((ctx) =>
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
  const refused = 'E2E functions run only on the test backend.'
  await expect(me.mutation(api.e2eUpdate.holdRead, {})).rejects.toThrow(refused)
  await expect(
    me.mutation(api.e2eUpdate.failRead, { batchId }),
  ).rejects.toThrow(refused)
  await expect(me.mutation(api.e2eUpdate.badFile, { batchId })).rejects.toThrow(
    refused,
  )
  await expect(me.mutation(api.e2eUpdate.stuckApply, { days })).rejects.toThrow(
    refused,
  )
})

test('a read held open, then failed: nothing in it can be applied', async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const batchId = await me.mutation(api.e2eUpdate.holdRead, {})
  expect((await me.query(api.intake.batch, { batchId })).files[0].status).toBe(
    'reading',
  )
  await me.mutation(api.e2eUpdate.failRead, { batchId })
  const review = await me.query(api.intake.batchReview, { batchId })
  expect(review.ready).toBe(true)
  expect(review.accounts).toHaveLength(0)
  expect(review.asks.map((a) => a.kind)).toEqual(['failed'])
})

test('a save that stopped is finished once, however often it is pressed', async () => {
  vi.useFakeTimers()
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days })
  const batchId = await me.mutation(api.e2eUpdate.stuckApply, { days })
  /* Stuck: nothing is scheduled, so nothing moves by itself. */
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect((await me.query(api.intake.batch, { batchId })).status).toBe(
    'applying',
  )
  const dayStart = days[3] + DAY
  await me.mutation(api.intake.resumeApply, { batchId, dayStart })
  await me.mutation(api.intake.resumeApply, { batchId, dayStart })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect((await me.query(api.intake.batch, { batchId })).status).toBe('done')
  const trades = await t.run((ctx) => ctx.db.query('trades').collect())
  expect(trades).toHaveLength(31)
  /* Done: pressing again is a no-op, not a second save. */
  await me.mutation(api.intake.resumeApply, { batchId, dayStart })
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await t.run((ctx) => ctx.db.query('trades').collect())).toHaveLength(
    31,
  )
  vi.useRealTimers()
})

test("resumeApply cannot touch another person's update", async () => {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  const batchId = await me.mutation(api.e2eUpdate.stuckApply, { days })
  const other = t.withIdentity({ tokenIdentifier: 'https://clerk.test|other' })
  await expect(
    other.mutation(api.intake.resumeApply, { batchId, dayStart: days[3] }),
  ).rejects.toThrow('No such batch')
})
