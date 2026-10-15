import { describe, expect, it } from 'vitest'

import { countIn, dayIndex, projectWeek, spentWeek, weekChange } from './review'
import type { CommitRow, MoneyRow } from './review'

const DAY = 86_400_000
const MON = new Date(2026, 9, 12).getTime()
const starts = Array.from({ length: 7 }, (_, i) => MON + i * DAY)
const end = MON + 7 * DAY
const at = (day: number) => starts[0] + day * DAY + 10 * 3_600_000

let n = 0
const spend = (day: number, value: number, r: Partial<MoneyRow> = {}) =>
  ({
    _id: `m${n++}`,
    kind: 'expense',
    occurredAt: at(day),
    value,
    unit: 'eur',
    ...r,
  }) satisfies MoneyRow

describe('dayIndex', () => {
  it('finds the day, and nothing before the week or at its end', () => {
    expect(dayIndex(starts, end, at(0))).toBe(0)
    expect(dayIndex(starts, end, at(6))).toBe(6)
    expect(dayIndex(starts, end, MON - 1)).toBe(-1)
    expect(dayIndex(starts, end, end)).toBe(-1)
  })
})

describe('spentWeek', () => {
  it('is zero in a week with no rows', () => {
    const w = spentWeek([], starts, end)
    expect(w).toMatchObject({ spent: 0, bills: 0, count: 0, biggest: [] })
    expect(w.byDay).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('adds expenses in cents, by day, biggest three by name', () => {
    const w = spentWeek(
      [
        spend(0, 0.1, { meta: { payee: 'Preply' } }),
        spend(0, 0.2, { meta: { merchant: 'Bolt' } }),
        spend(2, 37.86, { text: 'Veiga e Seabra', meta: { category: 'car' } }),
        spend(6, 25, { text: 'Andrei' }),
      ],
      starts,
      end,
    )
    expect(w.spent).toBe(63.16)
    expect(w.byDay).toEqual([0.3, 0, 37.86, 0, 0, 0, 25])
    expect(w.count).toBe(4)
    expect(w.biggest.map((b) => [b.name, b.category, b.amount])).toEqual([
      ['Veiga e Seabra', 'car', 37.86],
      ['Andrei', null, 25],
      ['Bolt', null, 0.2],
    ])
  })

  it('leaves bills out and sums them apart', () => {
    const w = spentWeek(
      [
        spend(1, 22.14, { text: 'Anthropic', meta: { recurringId: 'r1' } }),
        spend(2, 5.98),
      ],
      starts,
      end,
    )
    expect(w.spent).toBe(5.98)
    expect(w.bills).toBe(22.14)
    expect(w.count).toBe(1)
  })

  it('adds no income, lent money, other currencies or rows outside the week', () => {
    const w = spentWeek(
      [
        spend(0, 2900, { kind: 'income' }),
        spend(0, 100, { meta: { category: 'lent' } }),
        spend(0, 40, { unit: 'usd' }),
        { ...spend(0, 9), occurredAt: MON - 1 },
        { ...spend(0, 9), occurredAt: end },
      ],
      starts,
      end,
    )
    expect(w.spent).toBe(0)
    expect(w.count).toBe(0)
  })
})

describe('projectWeek', () => {
  const lastWeekStart = MON - 7 * DAY
  const commit = (t: number, r: Partial<CommitRow> = {}): CommitRow => ({
    repo: 'me/app',
    message: `c${t}`,
    authoredAt: t,
    ...r,
  })

  it('counts this week by day and last week, with the two newest messages', () => {
    const w = projectWeek(
      [
        commit(at(0)),
        commit(at(0) + 1),
        commit(at(3), { message: 'newest' }),
        commit(lastWeekStart + DAY),
        commit(at(1), { isMerge: true }),
        commit(at(1), { repo: 'me/other' }),
      ],
      'me/app',
      lastWeekStart,
      starts,
      end,
    )
    expect(w.thisWeek).toBe(3)
    expect(w.lastWeek).toBe(1)
    expect(w.days).toEqual([2, 0, 0, 1, 0, 0, 0])
    expect(w.messages).toEqual(['newest', `c${at(0) + 1}`])
  })

  it('is zero for a project with no repo', () => {
    const w = projectWeek(
      [commit(at(0))],
      undefined,
      lastWeekStart,
      starts,
      end,
    )
    expect(w).toEqual({
      thisWeek: 0,
      lastWeek: 0,
      days: [0, 0, 0, 0, 0, 0, 0],
      messages: [],
    })
  })
})

describe('countIn', () => {
  it('counts rows in the period that pass', () => {
    const rows = [
      { occurredAt: at(0), k: 'a' },
      { occurredAt: at(1), k: 'b' },
    ]
    expect(countIn(rows, MON, end, (r) => r.k === 'a')).toBe(1)
    expect(countIn(rows, at(1), end, () => true)).toBe(1)
  })
})

describe('weekChange', () => {
  it('less spent is good, more worth is good', () => {
    expect(weekChange(5.98, 74.05, false)).toEqual({
      amount: 68.07,
      dir: 'down',
      good: true,
    })
    expect(weekChange(45135, 45317, true)).toEqual({
      amount: 182,
      dir: 'down',
      good: false,
    })
    expect(weekChange(10, 10, true)).toEqual({
      amount: 0,
      dir: 'same',
      good: null,
    })
  })
})
