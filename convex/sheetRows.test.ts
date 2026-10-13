/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const OTHER = 'https://clerk.test|user_other'
const DAY = 86_400_000
const days = [4, 3, 2, 1].map((n) => Date.UTC(2026, 9, 5) - n * DAY)

afterEach(() => {
  vi.unstubAllEnvs()
})

async function revolutWith(count: number) {
  vi.stubEnv('E2E', '1')
  const t = convexTest(schema, modules)
  const me = t.withIdentity({ tokenIdentifier: ME })
  await me.mutation(api.e2e.reset, { days })
  const before = await me.query(api.accounts.list, {})
  const revolut = before.find((a) => a.name === 'Revolut')
  if (!revolut) throw new Error('no Revolut in the mock')
  const had = (await me.query(api.aggregate.accountSheet, {
    accountId: revolut._id,
  }))!.rows.length
  await me.mutation(api.e2eUpdate.manyRows, { count })
  return { t, me, accountId: revolut._id, had }
}

test('a page is the newest rows, and says older ones are saved', async () => {
  const { me, accountId, had } = await revolutWith(400)
  const page = await me.query(api.sheetRows.page, { accountId, show: 60 })
  if (page === null) throw new Error('no page')
  expect(page.older).toBe(true)
  expect(page.rows.length).toBeLessThanOrEqual(60)
  expect(page.rows.length).toBeGreaterThan(50)
  expect(page.rows.map((r) => r.at)).toEqual(
    [...page.rows.map((r) => r.at)].sort((a, b) => b - a),
  )
  /* The same rows the whole sheet starts with. */
  const whole = await me.query(api.aggregate.accountSheet, { accountId })
  expect(page.rows).toEqual(whole!.rows.slice(0, page.rows.length))
  expect(whole!.total).toBe(400 + had)

  const all = await me.query(api.sheetRows.page, { accountId, show: 2000 })
  expect(all!.older).toBe(false)
  expect(all!.rows).toEqual(whole!.rows)
})

test('the head has no rows, and the same check, total and start as the whole sheet', async () => {
  const { me, accountId } = await revolutWith(400)
  const whole = await me.query(api.aggregate.accountSheet, { accountId })
  const head = await me.query(api.aggregate.accountSheet, {
    accountId,
    head: true,
  })
  expect(head!.rows).toEqual([])
  expect(head).toEqual({ ...whole!, rows: [] })
  /* Some 290 rows between the two balances, most of them not on the first
     page: the check still counts them. */
  const check = head!.checks.find((c) => c.rows > 200)
  expect(check).toMatchObject({ missing: 0 })
  expect(head!.first).toBe(Math.min(...whole!.rows.map((r) => r.at)))
})

test("another user gets nothing of this account's rows; signed out is refused", async () => {
  const { t, accountId } = await revolutWith(5)
  const them = t.withIdentity({ tokenIdentifier: OTHER })
  expect(await them.query(api.sheetRows.page, { accountId, show: 60 })).toBe(
    null,
  )
  await expect(
    t.query(api.sheetRows.page, { accountId, show: 60 }),
  ).rejects.toThrow()
})

test("a day is that day's rows of the whole sheet, and nobody else's", async () => {
  const { t, me, accountId } = await revolutWith(400)
  const whole = (await me.query(api.aggregate.accountSheet, { accountId }))!
  /* A day in the middle of what the sheet holds. */
  const mid = whole.rows[Math.floor(whole.rows.length / 2)].at
  const from = Math.floor(mid / DAY) * DAY
  const to = from + DAY - 1
  const rows = await me.query(api.sheetRows.day, { accountId, from, to })
  if (rows === null) throw new Error('no day')
  expect(rows.length).toBeGreaterThan(0)
  expect(rows).toEqual(whole.rows.filter((r) => r.at >= from && r.at <= to))

  /* A day with nothing: an empty list, not the account's other rows. */
  const far = Date.UTC(2020, 0, 1)
  expect(
    await me.query(api.sheetRows.day, { accountId, from: far, to: far + DAY }),
  ).toEqual([])

  /* Another owner gets nothing of it. */
  const them = t.withIdentity({ tokenIdentifier: OTHER })
  expect(
    await them.query(api.sheetRows.day, { accountId, from, to }),
  ).toBeNull()
})
