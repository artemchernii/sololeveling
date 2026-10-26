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

/* 13 Oct, his Revolut: few bank rows and 3,700 trades. The page took the
   trades whole whenever the bank rows fitted on it. */
test("a broker's trades come a page at a time with the rows", async () => {
  const { t, me, accountId } = await revolutWith(5)
  await t.run(async (ctx) => {
    const account = await ctx.db.get(accountId)
    if (account === null) throw new Error('no account')
    if (!account.kinds.includes('broker'))
      await ctx.db.patch(accountId, { kinds: [...account.kinds, 'broker'] })
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId: ME,
      symbol: 'NVDA',
      name: 'NVIDIA',
      exchange: 'NMS',
      currency: 'USD',
      type: 'EQUITY',
    })
    for (let i = 0; i < 300; i++)
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId,
        instrumentId,
        side: 'buy',
        shares: 1,
        priceEur: 10,
        occurredAt: Date.UTC(2024, 0, 1) + i * DAY,
      })
  })
  const whole = (await me.query(api.aggregate.accountSheet, { accountId }))!
  const page = (await me.query(api.sheetRows.page, { accountId, show: 60 }))!
  expect(page.rows.length).toBe(60)
  expect(page.older).toBe(true)
  expect(page.rows).toEqual(whole.rows.slice(0, 60))
  const more = (await me.query(api.sheetRows.page, { accountId, show: 180 }))!
  expect(more.rows).toEqual(whole.rows.slice(0, 180))
  const all = (await me.query(api.sheetRows.page, { accountId, show: 2000 }))!
  expect(all.older).toBe(false)
  expect(all.rows).toEqual(whole.rows)
  /* A day of trades comes through the same index. */
  const from = Date.UTC(2024, 0, 10)
  const rows = await me.query(api.sheetRows.day, {
    accountId,
    from,
    to: from + DAY - 1,
  })
  expect(rows).toEqual(
    whole.rows.filter((r) => r.at >= from && r.at < from + DAY),
  )
})

/* 25 Oct, his "BUY/SELL badge rows for every broker's trades, Revolut
   too": a trade is a line as the card shows it — badge, company, shares
   at their price, euros. */
test("a broker's trade is a BUY or SELL line with its company", async () => {
  const { t, me, accountId } = await revolutWith(0)
  await t.run(async (ctx) => {
    await ctx.db.patch(accountId, { kinds: ['bank', 'broker'] })
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId: ME,
      symbol: 'NVDA',
      name: 'NVIDIA',
      exchange: 'NMS',
      currency: 'USD',
      type: 'EQUITY',
    })
    for (const [side, at] of [
      ['buy', 1],
      ['sell', 2],
    ] as const)
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId,
        instrumentId,
        side,
        shares: 2,
        priceEur: 150,
        occurredAt: Date.UTC(2026, 9, at),
      })
  })
  const page = (await me.query(api.sheetRows.page, { accountId, show: 20 }))!
  const lines = page.rows.filter((r) => r.kind === 'buy' || r.kind === 'sell')
  expect(lines.map((r) => [r.kind, r.amount, r.line])).toEqual([
    [
      'sell',
      300,
      {
        kind: 'sell',
        at: Date.UTC(2026, 9, 2),
        name: 'NVIDIA',
        symbol: 'NVDA',
        shares: 2,
        each: 150,
        amount: 300,
        currency: 'EUR',
        other: null,
      },
    ],
    [
      'buy',
      -300,
      expect.objectContaining({ kind: 'buy', name: 'NVIDIA', amount: -300 }),
    ],
  ])
})

/* 26 Oct: his ADA staking rewards read `BUY · −€0`. A reward and a split
   are their own lines, coins and no money. */
test('a reward and a split are REWARD and SPLIT lines, not a BUY at €0', async () => {
  const { t, me, accountId } = await revolutWith(0)
  await t.run(async (ctx) => {
    await ctx.db.patch(accountId, { kinds: ['bank', 'broker'] })
    const instrumentId = await ctx.db.insert('instruments', {
      ownerId: ME,
      symbol: 'ADA',
      name: 'ADA',
      exchange: 'CCC',
      currency: 'EUR',
      type: 'CRYPTOCURRENCY',
    })
    for (const [mark, at] of [
      [{ reward: true }, 1],
      [{ split: true }, 2],
    ] as const)
      await ctx.db.insert('trades', {
        ownerId: ME,
        accountId,
        instrumentId,
        side: 'buy',
        shares: 0.1097,
        priceEur: 0,
        occurredAt: Date.UTC(2026, 9, at),
        ...mark,
      })
  })
  const page = (await me.query(api.sheetRows.page, { accountId, show: 20 }))!
  const lines = page.rows.filter((r) => r.line?.symbol === 'ADA')
  expect(lines.map((r) => [r.line?.kind, r.line?.shares, r.amount])).toEqual([
    ['split', 0.1097, 0],
    ['reward', 0.1097, 0],
  ])
  expect(lines.every((r) => r.line?.each === null)).toBe(true)
})

/* 13 Oct, his ActivoBank: a screenshot read €90.35, then the bank answered
   €90.35 on each of the next two days — and all three balances showed the
   screenshot as their file. */
test("a file is one balance's, and never the bank's own answer", async () => {
  const { t, me, accountId } = await revolutWith(0)
  const at = Date.UTC(2026, 9, 20, 12)
  const ids = await t.run(async (ctx) => {
    const file = (asOf: number) =>
      ctx.db.insert('intakes', {
        ownerId: ME,
        accountId,
        storageIds: [],
        status: 'done',
        balance: { asOf, currency: 'EUR', value: 90.35 },
      })
    const shot = await file(at)
    const fromBank = await file(at + 3 * DAY)
    const snap = (
      recordedAt: number,
      source: 'screenshot' | 'sync',
      intakeId?: typeof shot,
    ) =>
      ctx.db.insert('stateSnapshots', {
        ownerId: ME,
        area: 'money',
        key: `balance:${accountId}:EUR`,
        value: 90.35,
        unit: 'eur',
        recordedAt,
        source,
        ...(intakeId ? { intakeId } : {}),
      })
    await snap(at, 'screenshot')
    await snap(at + DAY, 'sync')
    await snap(at + 2 * DAY, 'sync')
    await snap(at + 3 * DAY, 'sync', fromBank)
    return { shot, fromBank }
  })
  const sheet = (await me.query(api.aggregate.accountSheet, {
    accountId,
    head: true,
  }))!
  const read = sheet.readings
    .filter((r) => r.at >= at)
    .sort((a, b) => a.at - b.at)
  expect(read.map((r) => r.fileId)).toEqual([
    ids.shot,
    null,
    null,
    ids.fromBank,
  ])
  /* Nothing moved between them: what the sheet leaves unsaid. */
  for (const r of read.slice(1))
    expect(
      sheet.checks.find((c) => c.to === r.at && c.currency === 'EUR'),
    ).toMatchObject({ rows: 0, missing: 0, fromValue: 90.35 })
})

/* 13 Oct, his Trading 212 screenshot: opened, it said "0 rows in the
   file" and listed nothing, though eight positions were read from it. */
test("a broker's file, opened, lists the positions it read", async () => {
  const { t, me, accountId } = await revolutWith(1)
  const intakeId = await t.run((ctx) =>
    ctx.db.insert('intakes', {
      ownerId: ME,
      accountId,
      storageIds: [],
      status: 'done',
      positions: [
        {
          name: 'Vanguard S&P 500 (Acc)',
          shares: 1.97217449,
          valueEur: 261.53,
          preferred: 1,
          candidates: [
            {
              symbol: 'VUSA.L',
              name: 'Vanguard S&P 500',
              exchange: 'LSE',
              type: 'ETF',
            },
            {
              symbol: 'VUAA.L',
              name: 'Vanguard S&P 500 Acc',
              exchange: 'LSE',
              type: 'ETF',
            },
          ],
        },
        { name: 'LUKOIL', valueEur: 11.14, candidates: [] },
      ],
    }),
  )
  const f = await me.query(api.intake.fileRows, { intakeId })
  expect(f.rows).toEqual([])
  expect(f.positions).toEqual([
    {
      name: 'Vanguard S&P 500 (Acc)',
      symbol: 'VUAA.L',
      valueEur: 261.53,
      shares: 1.97217449,
    },
    { name: 'LUKOIL', symbol: null, valueEur: 11.14, shares: null },
  ])
  const them = t.withIdentity({ tokenIdentifier: OTHER })
  await expect(them.query(api.intake.fileRows, { intakeId })).rejects.toThrow()
})
