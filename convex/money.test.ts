/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

const ME = 'https://clerk.test|user_me'
const SOMEONE_ELSE = 'https://clerk.test|user_them'

/* Finances F1: source 1 as widened on 26 Sep — a sum of logged euros over
   a stated period, per category, that opens its rows. */

const DAY = 86_400_000
const START = new Date(2026, 7, 1).getTime()
const END = new Date(2026, 8, 1).getTime()

function setup() {
  const t = convexTest(schema, modules)
  return {
    t,
    me: t.withIdentity({ tokenIdentifier: ME }),
    them: t.withIdentity({ tokenIdentifier: SOMEONE_ELSE }),
  }
}

type Who = ReturnType<typeof setup>['me']

function money(
  who: Who,
  kind: 'expense' | 'income' | 'transfer',
  value: number,
  occurredAt: number,
  extra: { category?: string; unit?: string } = {},
) {
  return who.mutation(api.logs.create, {
    kind,
    area: 'money',
    occurredAt,
    value,
    unit: extra.unit ?? 'eur',
    category: extra.category,
  })
}

describe('aggregate.moneySums', () => {
  test('out and in, apart, per category, biggest first — in whole cents', async () => {
    const { me } = setup()
    await money(me, 'expense', 0.1, START + DAY, { category: 'groceries' })
    await money(me, 'expense', 0.2, START + 2 * DAY, { category: 'groceries' })
    await money(me, 'expense', 12.5, START + 3 * DAY, {
      category: 'eating out',
    })
    await money(me, 'expense', 4, START + 4 * DAY)
    await money(me, 'income', 3000, START + 5 * DAY, { category: 'salary' })

    const sums = await me.query(api.aggregate.moneySums, {
      start: START,
      end: END,
    })
    expect(sums.out).toEqual({ sum: 16.8, count: 4 })
    expect(sums.in).toEqual({ sum: 3000, count: 1 })
    expect(sums.buckets).toEqual([
      { kind: 'expense', category: 'eating out', sum: 12.5, count: 1 },
      { kind: 'expense', category: null, sum: 4, count: 1 },
      { kind: 'expense', category: 'groceries', sum: 0.3, count: 2 },
      { kind: 'income', category: 'salary', sum: 3000, count: 1 },
    ])
    expect(sums.complete).toBe(true)
  })

  test('the period boundary is exact: start in, end out', async () => {
    const { me } = setup()
    await money(me, 'expense', 1, START - 1)
    await money(me, 'expense', 2, START)
    await money(me, 'expense', 4, END - 1)
    await money(me, 'expense', 8, END)
    const sums = await me.query(api.aggregate.moneySums, {
      start: START,
      end: END,
    })
    expect(sums.out.sum).toBe(6)
  })

  test('one currency: a row not in euros is skipped, not converted', async () => {
    const { me } = setup()
    await money(me, 'expense', 10, START + DAY)
    await money(me, 'expense', 300, START + DAY, { unit: 'usd' })
    const sums = await me.query(api.aggregate.moneySums, {
      start: START,
      end: END,
    })
    expect(sums.out.sum).toBe(10)
    expect(sums.skipped).toBe(1)
  })

  test('an investment is neither out nor in', async () => {
    const { me } = setup()
    await money(me, 'transfer', 500, START + DAY)
    const sums = await me.query(api.aggregate.moneySums, {
      start: START,
      end: END,
    })
    expect(sums.out.count + sums.in.count).toBe(0)
  })

  test("another owner's money is never added", async () => {
    const { me, them } = setup()
    await money(them, 'expense', 999, START + DAY)
    await money(me, 'expense', 1, START + DAY)
    const sums = await me.query(api.aggregate.moneySums, {
      start: START,
      end: END,
    })
    expect(sums.out).toEqual({ sum: 1, count: 1 })
  })
})

describe('logs.moneyRows opens the same rows the sum added', () => {
  test('same period, same euro rule, only mine, newest first', async () => {
    const { me, them } = setup()
    await money(me, 'expense', 3, START + DAY)
    await money(me, 'income', 5, START + 2 * DAY)
    await money(me, 'expense', 7, START + DAY, { unit: 'usd' })
    await money(me, 'transfer', 9, START + DAY)
    await money(me, 'expense', 11, END)
    await money(them, 'expense', 13, START + DAY)
    const rows = await me.query(api.logs.moneyRows, { start: START, end: END })
    expect(rows.map((r) => r.value)).toEqual([5, 3])
  })
})

describe('logs.setValue on money', () => {
  test('keeps an amount to the cent', async () => {
    const { me } = setup()
    const id = await money(me, 'expense', 3, START + DAY)
    await me.mutation(api.logs.setValue, { logId: id, value: 12.499 })
    const [row] = await me.query(api.logs.moneyRows, { start: START, end: END })
    expect(row.value).toBe(12.5)
  })

  test("refuses another owner's row", async () => {
    const { me, them } = setup()
    const id = await money(them, 'expense', 3, START + DAY)
    await expect(
      me.mutation(api.logs.setValue, { logId: id, value: 4 }),
    ).rejects.toThrow('No such log')
  })
})

describe('the monthly spending limit', () => {
  test('set, moved on the same goal, cleared', async () => {
    const { me } = setup()
    expect(await me.query(api.goals.spendLimit, {})).toBeNull()
    const a = await me.mutation(api.goals.setSpendLimit, { targetValue: 800 })
    const b = await me.mutation(api.goals.setSpendLimit, { targetValue: 900 })
    expect(b).toBe(a)
    expect(await me.query(api.goals.spendLimit, {})).toBe(900)
    await me.mutation(api.goals.clearSpendLimit, {})
    expect(await me.query(api.goals.spendLimit, {})).toBeNull()
  })

  test('a whole number of euros only', async () => {
    const { me } = setup()
    await expect(
      me.mutation(api.goals.setSpendLimit, { targetValue: 12.5 }),
    ).rejects.toThrow('whole number')
    await expect(
      me.mutation(api.goals.setSpendLimit, { targetValue: 0 }),
    ).rejects.toThrow('whole number')
  })

  test("is not another owner's, and a Money tile target is not one", async () => {
    const { me, them } = setup()
    await them.mutation(api.goals.setSpendLimit, { targetValue: 500 })
    await me.mutation(api.goals.setTileTarget, {
      tile: 'money',
      targetValue: 2,
    })
    expect(await me.query(api.goals.spendLimit, {})).toBeNull()
  })
})
