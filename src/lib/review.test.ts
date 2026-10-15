import { describe, expect, it } from 'vitest'

import { countWeek, groupOf, latestRows } from './review'
import type { ReviewRow } from './review'

const DAY = 86_400_000
const MON = new Date(2026, 9, 5).getTime()
const starts = Array.from({ length: 7 }, (_, i) => MON + i * DAY)
const end = MON + 7 * DAY

let n = 0
const row = (day: number, r: Partial<ReviewRow>): ReviewRow => ({
  _id: `r${n++}`,
  kind: 'event',
  area: 'knowledge',
  occurredAt: starts[day] + 10 * 3_600_000,
  ...r,
})

describe('groupOf', () => {
  const langs = new Set(['portuguese', 'deutsch'])
  it('files each area under its tile, and the rest under other', () => {
    expect(groupOf('projects', langs)).toBe('projects')
    expect(groupOf('business', langs)).toBe('projects')
    expect(groupOf('deutsch', langs)).toBe('languages')
    expect(groupOf('body', langs)).toBe('body')
    expect(groupOf('money', langs)).toBe('money')
    expect(groupOf('social', langs)).toBe('social')
    expect(groupOf('knowledge', langs)).toBe('other')
    expect(groupOf('style', langs)).toBe('other')
  })
})

describe('countWeek', () => {
  it('counts nothing in an empty week', () => {
    const w = countWeek([], starts, end, ['portuguese'])
    expect(w.total).toBe(0)
    expect(w.days).toHaveLength(7)
    expect(w.languages).toEqual([
      expect.objectContaining({ slug: 'portuguese', classes: 0, minutes: 0 }),
    ])
    expect(w.body).toEqual([])
  })

  it('counts every row: a plain note is activity under other', () => {
    const rows = [
      row(0, { kind: 'workout', area: 'body', category: 'gym', value: 60 }),
      row(0, { kind: 'workout', area: 'body', category: 'gym', value: 45 }),
      row(2, { kind: 'workout', area: 'body', category: 'hiking' }),
      row(3, { kind: 'intake', area: 'body', category: 'supplements' }),
      row(1, { kind: 'expense', area: 'money', value: 48 }),
      row(4, { kind: 'event', area: 'knowledge', text: 'called Dyson' }),
      row(5, { kind: 'task_done', area: 'projects' }),
      row(5, { kind: 'session', area: 'projects', projectId: 'p1', value: 90 }),
      row(6, {
        kind: 'session',
        area: 'portuguese',
        category: 'class',
        value: 90,
      }),
      row(6, {
        kind: 'session',
        area: 'portuguese',
        category: 'homework',
        value: 30,
      }),
    ]
    const w = countWeek(rows, starts, end, ['portuguese', 'english'])
    expect(w.total).toBe(10)
    expect(w.days[4].other).toBe(1)
    expect(w.days[0].body).toBe(2)
    expect(w.days[6].languages).toBe(2)
    expect(w.tasksDone).toBe(1)
    expect(w.projectMinutes).toBe(90)
    expect(w.workouts).toBe(3)
    expect(w.body).toEqual(
      expect.arrayContaining([
        { category: 'gym', days: [2, 0, 0, 0, 0, 0, 0] },
        { category: 'hiking', days: [0, 0, 1, 0, 0, 0, 0] },
        { category: 'supplements', days: [0, 0, 0, 1, 0, 0, 0] },
      ]),
    )
    const pt = w.languages.find((l) => l.slug === 'portuguese')
    expect(pt).toMatchObject({ classes: 1, minutes: 120 })
    expect(pt?.days).toEqual([0, 0, 0, 0, 0, 0, 2])
    expect(pt?.sessionIds).toHaveLength(2)
    expect(w.languages.find((l) => l.slug === 'english')?.classes).toBe(0)
  })

  it('leaves out rows before the week and from the next one', () => {
    const rows = [
      { ...row(0, {}), occurredAt: MON - 1 },
      { ...row(0, {}), occurredAt: end },
      row(3, {}),
    ]
    expect(countWeek(rows, starts, end, []).total).toBe(1)
  })
})

describe('latestRows', () => {
  it('gives the four newest rows of the week, newest first', () => {
    const rows = [0, 1, 2, 3, 4, 5].map((d) => row(d, { text: `d${d}` }))
    rows.push({ ...row(0, {}), occurredAt: end + 1, text: 'next week' })
    expect(latestRows(rows, MON, end).map((r) => r.text)).toEqual([
      'd5',
      'd4',
      'd3',
      'd2',
    ])
  })
})
