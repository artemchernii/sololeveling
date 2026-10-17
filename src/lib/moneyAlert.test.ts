import { describe, expect, test } from 'vitest'

import {
  approvalWords,
  daysTo,
  missingWords,
  nextMorning,
  salaryWords,
} from './moneyAlert'
import { dayStart } from './remindAt'

/* Vitest runs in Lisbon (vitest.config.ts): new Date(y, m, d, h) is his
   wall clock. */
const at = (m: number, d: number, h: number, min = 0) =>
  new Date(2026, m - 1, d, h, min).getTime()

describe('nextMorning', () => {
  test('before 09:00 → today 09:00', () => {
    expect(nextMorning(at(10, 27, 7))).toBe(at(10, 27, 9))
  })
  test('at or after 09:00 → tomorrow 09:00', () => {
    expect(nextMorning(at(10, 27, 9))).toBe(at(10, 28, 9))
    expect(nextMorning(at(10, 27, 22))).toBe(at(10, 28, 9))
  })
  test('across the clock change (25 Oct) it stays 09:00', () => {
    expect(nextMorning(at(10, 24, 12))).toBe(at(10, 25, 9))
    expect(nextMorning(at(10, 25, 12))).toBe(at(10, 26, 9))
  })
})

describe('daysTo', () => {
  test('counts local days to a time', () => {
    const today = dayStart(at(10, 17, 9))
    expect(daysTo(at(10, 24, 18), today)).toBe(7)
    expect(daysTo(at(10, 18, 0, 30), today)).toBe(1)
    expect(daysTo(at(10, 17, 23), today)).toBe(0)
  })
})

describe('words: badges and numbers', () => {
  test('A · missing for a bill', () => {
    expect(
      missingWords({
        name: 'Preply',
        amount: 123.72,
        t: at(10, 29, 12),
        account: 'ActivoBank',
        held: 78.39,
        missing: 45.33,
      }),
    ).toEqual({
      title: 'Preply · €123.72 · 29 Oct',
      body: 'ActivoBank €78.39 · €45.33 missing',
    })
  })
  test('B · approval ending', () => {
    expect(approvalWords('ActivoBank', at(10, 24, 18), 7)).toEqual({
      title: 'ActivoBank · approval until 24 Oct',
      body: '7 days · APPROVE',
    })
    expect(approvalWords('ActivoBank', at(10, 24, 18), 1).body).toBe(
      '1 day · APPROVE',
    )
  })
  test('C · salary in', () => {
    expect(salaryWords('BPI', 2809.4, at(10, 25, 12))).toEqual({
      title: 'Salary in · €2,809.40',
      body: 'BPI · 25 Oct',
    })
  })
})
