import { describe, expect, it } from 'vitest'

import { spendingOf } from './spending'
import type { FlowMonth } from './spending'

const month = (
  start: number,
  groups: Array<[string | null, number]>,
): FlowMonth => ({
  start,
  in: 0,
  out: groups.reduce((n, [, s]) => n + s, 0),
  rows: groups.length,
  groups: groups.map(([category, sum]) => ({ category, sum, count: 1 })),
})

describe('spendingOf', () => {
  const months = [
    month(1, [['groceries', 300]]),
    month(2, []),
    month(3, [
      ['home', 800],
      ['groceries', 320],
      ['eating out', 120],
    ]),
    month(4, [
      ['home', 900],
      ['groceries', 330],
      ['eating out', 200],
      [null, 15],
    ]),
  ]

  it('lines up each group with the month before and six months', () => {
    const s = spendingOf(months, 3)
    expect(s.lines[1]).toEqual({
      category: 'groceries',
      now: 330,
      prev: 320,
      count: 1,
      six: [0, 0, 300, 0, 320, 330],
    })
    expect([s.total, s.prevTotal, s.hasPrev]).toEqual([1445, 1240, true])
  })

  it('names what grew most, but not the mortgage moving', () => {
    expect(spendingOf(months, 3).grew).toEqual({
      category: 'eating out',
      now: 200,
      change: 80,
    })
  })

  it('has nothing to say when nothing grew or there is no month', () => {
    expect(
      spendingOf([month(1, [['fun', 5]]), month(2, [['fun', 4]])], 1).grew,
    ).toBeNull()
    expect(spendingOf([], 0)).toMatchObject({ lines: [], total: 0, grew: null })
  })
})
