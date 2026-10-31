import { expect, test } from 'vitest'

import { dayLine } from './sheetDays'

const DAY = 86_400_000
const START = Date.UTC(2026, 9, 23)

test("a day says what went out and that day's own balance", () => {
  const rows = [
    { amount: -13.9, currency: 'EUR' },
    { amount: -2.5, currency: 'EUR' },
    { amount: -15, currency: 'EUR' },
    { amount: 50, currency: 'EUR' },
  ]
  const readings = [
    { at: START + 10 * 3_600_000, value: 1010, currency: 'EUR' },
    { at: START + 20 * 3_600_000, value: 1003.5, currency: 'EUR' },
    { at: START + DAY + 3_600_000, value: 990, currency: 'EUR' },
    { at: START + 21 * 3_600_000, value: 0, currency: 'USD' },
  ]
  expect(dayLine(rows, readings, START, START + DAY)).toEqual({
    currency: 'EUR',
    outCount: 3,
    outSum: -31.4,
    balance: 1003.5,
  })
})

test('no reading that day: no balance; no rows: no line', () => {
  expect(
    dayLine([{ amount: -4, currency: 'EUR' }], [], START, START + DAY)?.balance,
  ).toBeNull()
  expect(dayLine([], [], START, START + DAY)).toBeNull()
})
