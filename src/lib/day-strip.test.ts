import { describe, expect, test } from 'vitest'

import {
  blockLabels,
  dayBlocks,
  dayStartsBack,
  isWeekend,
  STRIP_WEEKS,
} from './day-strip'

describe('dayStartsBack', () => {
  test('twelve weeks of local midnights, oldest first, ending today', () => {
    const from = new Date(2026, 8, 21, 14, 30) // 21 Sep 2026, afternoon
    const days = dayStartsBack(STRIP_WEEKS, from)

    expect(days).toHaveLength(84)
    const last = new Date(days[83])
    expect(last.getFullYear()).toBe(2026)
    expect(last.getMonth()).toBe(8)
    expect(last.getDate()).toBe(21)
    expect(last.getHours()).toBe(0)
    expect(last.getMinutes()).toBe(0)
  })

  test('no day is in the future', () => {
    const from = new Date(2026, 8, 21, 14, 30)
    for (const day of dayStartsBack(STRIP_WEEKS, from)) {
      expect(day).toBeLessThanOrEqual(from.getTime())
    }
  })

  test('consecutive days are one calendar day apart, across a DST change', () => {
    /* Built by stepping days, not by subtracting 24 hours: an hour goes
       missing twice a year and a strip built out of milliseconds drifts
       across it. Late October is when it happens in Europe. */
    const days = dayStartsBack(2, new Date(2026, 9, 31, 12, 0))
    for (let i = 1; i < days.length; i += 1) {
      const previous = new Date(days[i - 1])
      const current = new Date(days[i])
      expect(current.getHours()).toBe(0)
      const stepped = new Date(previous)
      stepped.setDate(stepped.getDate() + 1)
      expect(current.getTime()).toBe(stepped.getTime())
    }
  })
})

describe('dayBlocks', () => {
  test('calendar weeks, Monday first, every day kept', () => {
    /* 21 Sep 2026 is a Monday: twelve weeks back from it start on a Tuesday. */
    const days = dayStartsBack(STRIP_WEEKS, new Date(2026, 8, 21))
    const blocks = dayBlocks(days)
    expect(blocks.flat()).toEqual(days)
    expect(blocks).toHaveLength(13)
    expect(blocks[0]).toHaveLength(6)
    for (const block of blocks.slice(1, -1)) {
      expect(block).toHaveLength(7)
      expect(new Date(block[0]).getDay()).toBe(1)
    }
    /* Today, a Monday, opens a week of its own. */
    expect(blocks[12]).toEqual([days[83]])
  })

  test('no days is no blocks', () => {
    expect(dayBlocks([])).toEqual([])
  })
})

describe('isWeekend', () => {
  test('Saturday and Sunday only', () => {
    expect(isWeekend(new Date(2026, 8, 26).getTime())).toBe(true) // Sat
    expect(isWeekend(new Date(2026, 8, 27).getTime())).toBe(true) // Sun
    expect(isWeekend(new Date(2026, 8, 28).getTime())).toBe(false) // Mon
    expect(isWeekend(new Date(2026, 8, 25).getTime())).toBe(false) // Fri
  })
})

describe('blockLabels', () => {
  test("a month's name sits over the block holding its first", () => {
    const days = dayStartsBack(STRIP_WEEKS, new Date(2026, 8, 21))
    const labels = blockLabels(dayBlocks(days))

    expect(labels).toHaveLength(13)
    /* Twelve weeks back from 21 Sep reaches into July, so July, August and
       September each have a first in view — and no block is labelled twice. */
    const named = labels.filter((label) => label.length > 0)
    expect(named).toEqual(['Jul', 'Aug', 'Sep'])
  })

  test('a block containing no first is unlabelled', () => {
    const labels = blockLabels(
      dayBlocks(dayStartsBack(1, new Date(2026, 8, 21))),
    )
    /* 15–21 Sep: a Tuesday-to-Sunday week and a lone Monday, no first. */
    expect(labels).toEqual(['', ''])
  })
})
