import { describe, expect, it } from 'vitest'

import {
  bandOf,
  detail,
  dropAt,
  isFuture,
  pressAt,
  weekCells,
  weekRows,
} from './weekGrid'

const at = (day: number, h: number, m = 0) =>
  new Date(2026, 9, 12 + day, h, m).getTime()
const days = Array.from({ length: 7 }, (_, i) => at(i, 0))
const from = days[0]
const to = at(7, 0)
const log = (kind: string, area: string, when: number, extra: object = {}) => ({
  _id: `${kind}${when}`,
  kind,
  area,
  occurredAt: when,
  ...extra,
})

describe('weekRows', () => {
  it('keeps the six, drops the rest and what is outside the week', () => {
    const rows = weekRows(
      [
        log('workout', 'body', at(0, 7), { value: 60, text: 'legs' }),
        log('intake', 'body', at(0, 8), { meta: { category: 'supplements' } }),
        log('intake', 'body', at(0, 9), { meta: { category: 'vitamins' } }),
        log('session', 'portuguese', at(1, 19), { value: 25 }),
        log('session', 'guitar', at(1, 20)),
        log('post', 'social', at(2, 15)),
        log('expense', 'money', at(2, 16)),
        log('workout', 'body', at(-1, 7)),
        log('workout', 'body', at(7, 7)),
      ],
      [
        { repo: 'a', authoredAt: at(3, 11) },
        { repo: 'a', authoredAt: at(3, 12), isMerge: true },
      ],
      ['portuguese'],
      from,
      to,
    )
    expect(rows.map((r) => r.kind)).toEqual([
      'workout',
      'shake',
      'langs',
      'post',
      'commits',
    ])
  })
})

describe('a ticked task', () => {
  it('is a TASK where it was ticked, with no id to drag and its title', () => {
    const rows = weekRows(
      [log('task_done', 'life', at(2, 14), { text: 'Bank fix' })],
      [],
      ['portuguese'],
      from,
      to,
    )
    expect(rows).toEqual([
      { kind: 'task', area: 'life', at: at(2, 14), text: 'Bank fix' },
    ])
    const cells = weekCells(rows, days)
    expect(cells[1][2]).toHaveLength(1)
    expect(detail(cells[1][2][0])).toBe('Bank fix')
  })
})

describe('weekCells', () => {
  it('puts a row in its band and day, in time order, commits as one', () => {
    const rows = weekRows(
      [
        log('workout', 'body', at(0, 9)),
        log('intake', 'body', at(0, 8), { meta: { category: 'supplements' } }),
        log('workout', 'body', at(4, 18, 30)),
      ],
      [
        { repo: 'a', authoredAt: at(4, 13) },
        { repo: 'a', authoredAt: at(4, 14) },
      ],
      [],
      from,
      to,
    )
    const cells = weekCells(rows, days)
    expect(cells[0][0].map((b) => b.kind)).toEqual(['shake', 'workout'])
    expect(cells[1][4]).toHaveLength(1)
    expect(cells[1][4][0]).toMatchObject({ kind: 'commits', count: 2 })
    expect(cells[2][4][0].kind).toBe('workout')
    expect(cells[0][1]).toEqual([])
  })
  it('says what each block is', () => {
    const b = (o: object) =>
      ({ kind: 'workout', area: 'body', at: 0, count: 1, ...o }) as never
    expect(detail(b({ value: 60, text: 'legs' }))).toBe('60 MIN · LEGS')
    expect(detail(b({ kind: 'shake' }))).toBe('1 SHAKE')
    expect(detail(b({ kind: 'commits', count: 4 }))).toBe('4 COMMITS')
    expect(detail(b({}))).toBe('WORKOUT')
  })
})

describe('where a press or a drop lands', () => {
  it('bands', () => {
    expect([5, 11.9, 12, 17.9, 18, 23].map(bandOf)).toEqual([0, 0, 1, 1, 2, 2])
  })
  it('a drop keeps its time inside the band, else takes the start', () => {
    expect(dropAt(at(0, 7, 30), days[1], 0)).toBe(at(1, 7, 30))
    expect(dropAt(at(0, 7, 30), days[1], 2)).toBe(at(1, 18))
    expect(dropAt(at(0, 19), days[2], 1)).toBe(at(2, 12))
  })
  it('a press is now in the current cell, else the start', () => {
    const now = at(2, 15, 30)
    expect(pressAt(now, days[2], 1)).toBe(now)
    expect(pressAt(now, days[2], 0)).toBe(at(2, 6))
    expect(pressAt(now, days[0], 2)).toBe(at(0, 18))
  })
  it('a cell that has not started is the future', () => {
    const now = at(2, 15, 30)
    expect(isFuture(now, days[2], 1)).toBe(false)
    expect(isFuture(now, days[2], 2)).toBe(true)
    expect(isFuture(now, days[3], 0)).toBe(true)
    expect(isFuture(now, days[1], 2)).toBe(false)
  })
})
