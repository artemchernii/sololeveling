import { describe, expect, test } from 'vitest'

import { layoutTimeline, midDate } from './timeline-layout'
import type { TimelineNode } from './goal-timeline'

const opts = { width: 1000, minStep: 100, pad: 50, today: '2026-09-10' }

function step(dueDate?: string, id = Math.random().toString()): TimelineNode {
  return {
    kind: 'milestone',
    id,
    number: 1,
    title: id,
    state: 'ahead',
    ...(dueDate ? { dueDate } : {}),
  }
}
const start: TimelineNode = { kind: 'start', date: '2026-09-01' }
const end = (deadline?: string): TimelineNode =>
  deadline ? { kind: 'end', deadline } : { kind: 'end' }

describe('layoutTimeline', () => {
  test('a dated step sits where its date falls', () => {
    const l = layoutTimeline(
      [start, step('2026-09-11'), end('2026-10-01')],
      opts,
    )
    expect(l.dated).toBe(true)
    expect(l.xs[0]).toBe(50)
    expect(l.xs[2]).toBe(950)
    /* 10 of 30 days: a third of the way along 900px. */
    expect(l.xs[1]).toBeCloseTo(350)
  })

  test('today is marked by date', () => {
    const l = layoutTimeline([start, end('2026-09-19')], opts)
    expect(l.todayX).toBeCloseTo(50 + 900 * (9 / 18))
  })

  test('no deadline: evenly spaced, no today', () => {
    const l = layoutTimeline([start, step('2026-09-05'), end()], opts)
    expect(l.dated).toBe(false)
    expect(l.xs).toEqual([50, 500, 950])
    expect(l.todayX).toBeNull()
  })

  test('an undated step sits evenly between dated neighbours', () => {
    const l = layoutTimeline(
      [start, step('2026-09-11'), step(), end('2026-10-01')],
      opts,
    )
    expect(l.xs[2]).toBeCloseTo((l.xs[1] + l.xs[3]) / 2)
  })

  test('his order holds even when a later step has an earlier date', () => {
    const l = layoutTimeline(
      [start, step('2026-09-20'), step('2026-09-05'), end('2026-10-01')],
      opts,
    )
    expect(l.xs[2]).toBeGreaterThanOrEqual(l.xs[1] + 100)
  })

  test('steps never closer than minStep, and the line widens to fit', () => {
    const many = Array.from({ length: 12 }, () => step('2026-09-02'))
    const l = layoutTimeline([start, ...many, end('2026-10-01')], opts)
    expect(l.width).toBe(13 * 100 + 100)
    for (let i = 1; i < l.xs.length; i += 1) {
      expect(l.xs[i] - l.xs[i - 1]).toBeGreaterThanOrEqual(99.999)
    }
    expect(l.xs[l.xs.length - 1]).toBe(l.width - 50)
  })

  test('past the deadline, today sits on the end; before the start, nowhere', () => {
    const late = layoutTimeline([start, end('2026-09-05')], opts)
    expect(late.todayX).toBe(950)
    const early = layoutTimeline([start, end('2026-09-30')], {
      ...opts,
      today: '2026-08-01',
    })
    expect(early.todayX).toBeNull()
  })
})

describe('midDate', () => {
  test('halfway, or nothing when a side has no date', () => {
    expect(midDate('2026-09-01', '2026-09-11')).toBe('2026-09-06')
    expect(midDate('2026-09-01', undefined)).toBeUndefined()
  })
})
