import { describe, expect, test } from 'vitest'

import {
  LATE_MS,
  historySums,
  sharesCheck,
  sharesWords,
  timesWords,
} from './sharesCheck'
import type { HistoryRow } from './sharesCheck'

const DAY = 86_400_000
const END = new Date(2026, 9, 9, 15).getTime()
const row = (
  name: string,
  side: HistoryRow['side'],
  shares: number,
  daysBack: number,
): HistoryRow => ({ name, side, shares, occurredAt: END - daysBack * DAY })

/* A history as his Revolut file is: NVIDIA bought and sold over years,
   Apple with a split, Tesla sold completely. */
const FILE = [
  row('NVDA', 'buy', 4, 900),
  row('NVDA', 'buy', 3, 400),
  row('NVDA', 'sell', 2, 30),
  row('AAPL', 'buy', 3, 800),
  row('AAPL', 'split', 9, 600),
  row('TSLA', 'buy', 2, 700),
  row('TSLA', 'sell', 2, 200),
  row('AAPL', 'buy', 2, 0),
]
const held = (sum: number, symbol: string, shares: number) => ({
  sum,
  name: symbol,
  symbol,
  shares,
  calculated: false,
})

describe('historySums', () => {
  test('one line a company: bought, split and sold', () => {
    const { sums, to } = historySums(FILE)
    expect(to).toBe(END)
    expect(sums.map((s) => [s.name, s.net, s.buys, s.sells, s.rows])).toEqual([
      ['NVDA', 5, 2, 1, 3],
      ['AAPL', 14, 2, 0, 3],
      ['TSLA', 0, 1, 1, 2],
    ])
    /* Only the last days are kept row by row. */
    expect(sums[0].late).toEqual([{ at: END - 30 * DAY, shares: -2 }])
  })
  test('an empty file', () => {
    expect(historySums([])).toEqual({ sums: [], from: null, to: null })
  })
})

describe('sharesCheck', () => {
  const { sums, to } = historySums(FILE)
  test('every company the same, one sold completely', () => {
    const c = sharesCheck(
      sums,
      to,
      [held(0, 'NVDA', 5), held(1, 'AAPL', 14)],
      END + DAY,
    )
    expect(c.state).toBe('checked')
    expect(c.lines.every((l) => l.same)).toBe(true)
    expect(c.sold).toBe(1)
    expect(c.after).toEqual([])
  })
  test('the file has fewer: that company differs, first in the list', () => {
    const c = sharesCheck(
      sums,
      to,
      [held(1, 'AAPL', 14), held(0, 'NVDA', 6)],
      END + DAY,
    )
    expect(c.lines[0]).toMatchObject({
      n: 0,
      symbol: 'NVDA',
      file: 5,
      account: 6,
      same: false,
      buys: 2,
      sells: 1,
    })
    expect(c.lines[1].same).toBe(true)
  })
  test('the file has more, and a company the account has none of', () => {
    const c = sharesCheck(sums, to, [held(0, 'NVDA', 3)], END + DAY)
    expect(c.lines.map((l) => [l.name, l.file, l.account, l.same])).toEqual([
      ['NVDA', 5, 3, false],
      ['AAPL', 14, 0, false],
    ])
  })
  test('bought after the screenshot: saved, not compared', () => {
    const c = sharesCheck(
      sums,
      to,
      [held(0, 'NVDA', 5), held(1, 'AAPL', 12)],
      END - DAY,
    )
    expect(c.lines.every((l) => l.same)).toBe(true)
    expect(c.after).toEqual([{ name: 'AAPL', shares: 2, at: END }])
  })
  test('a screen rounds its shares; a worked-out count is rougher', () => {
    const one = historySums([row('VWCE', 'buy', 42.1034, 10)])
    const at = (shares: number, calculated = false) =>
      sharesCheck(
        one.sums,
        one.to,
        [{ ...held(0, 'VWCE', shares), calculated }],
        END,
      ).lines[0].same
    expect(at(42.1)).toBe(true)
    expect(at(41.5)).toBe(false)
    expect(at(41.5, true)).toBe(true)
  })
  test('no screenshot, and one older than the file keeps rows for', () => {
    expect(sharesCheck(sums, to, [], null).state).toBe('none')
    const old = sharesCheck(sums, to, [held(0, 'NVDA', 5)], END - LATE_MS)
    expect(old).toMatchObject({ state: 'old', lines: [] })
  })
})

test('the words', () => {
  expect(sharesWords(5)).toBe('5 shares')
  expect(sharesWords(1)).toBe('1 share')
  expect(sharesWords(42.1034)).toBe('42.1034 shares')
  expect(timesWords(11, 3)).toBe('bought 11 times, sold 3 times')
  expect(timesWords(1, 0)).toBe('bought once, never sold')
})
