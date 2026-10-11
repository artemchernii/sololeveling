import { describe, expect, test } from 'vitest'

import { insideReadings, printedBalance, trail } from './rowBalance'

const H = 3_600_000
const day = (d: number) => new Date(2026, 9, d, 12).getTime()
const row = (d: number, amount: number, balanceAfter?: number) => ({
  occurredAt: day(d),
  amount,
  pending: false,
  balanceAfter,
})

/* His ActivoBank screen of 12 Oct, newest on top. */
const SCREEN = [
  row(12, -25, 90.35),
  row(10, -37.86, 115.35),
  row(6, -505.2, 153.21),
  row(6, -700, 658.41),
]

describe('printedBalance', () => {
  test('the newest row’s balance, newest on top', () => {
    expect(printedBalance(SCREEN)).toEqual({ value: 90.35, asOf: day(12) })
  })

  test('the same from a statement, oldest on top', () => {
    expect(printedBalance([...SCREEN].reverse())).toEqual({
      value: 90.35,
      asOf: day(12),
    })
  })

  test('rows of one day: the balances say which way they run', () => {
    const oneDay = [row(6, -505.2, 153.21), row(6, -700, 658.41)]
    expect(printedBalance(oneDay)?.value).toBe(153.21)
    expect(printedBalance([...oneDay].reverse())?.value).toBe(153.21)
  })

  test('a pending row’s balance is not the account’s', () => {
    const rows = [{ ...row(12, -9, 81.35), pending: true }, ...SCREEN]
    expect(printedBalance(rows)?.value).toBe(90.35)
  })

  test('no balance printed anywhere: none', () => {
    expect(printedBalance([row(12, -25), row(10, -37.86)])).toBeNull()
    expect(trail([])).toEqual([])
  })
})

describe('insideReadings', () => {
  const had = { at: day(3) + 6 * H, value: 153.21 }

  test('rows up to the point the trail shows the old balance', () => {
    expect([...insideReadings(SCREEN, [had], 12 * H)].sort()).toEqual([2, 3])
  })

  test('again after it landed: the same two, whatever is newest', () => {
    const now = { at: day(12) + 6 * H, value: 90.35 }
    expect([...insideReadings(SCREEN, [had, now], 12 * H)].sort()).toEqual([
      2, 3,
    ])
  })

  test('a row dated before the balance is history, not counted twice', () => {
    const later = { at: day(8), value: 153.21 }
    expect(insideReadings(SCREEN, [later], 12 * H).size).toBe(0)
  })

  test('the trail never shows the old balance: nothing is claimed', () => {
    expect(
      insideReadings(SCREEN, [{ at: day(3), value: 200 }], 12 * H).size,
    ).toBe(0)
  })

  test('money that came back to the same balance later is still new', () => {
    const rows = [row(9, 20, 153.21), row(8, -20, 133.21), ...SCREEN.slice(2)]
    expect([...insideReadings(rows, [had], 12 * H)].sort()).toEqual([2, 3])
  })

  test('no printed balances: nothing can be told', () => {
    expect(insideReadings([row(6, -700)], [had], 12 * H).size).toBe(0)
  })
})
