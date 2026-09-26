import { describe, expect, test } from 'vitest'

import {
  arrange,
  byMonth,
  dueForRevisit,
  kindCounts,
  matches,
} from './vault-library'
import type { LibrarySheet } from './vault-library'

const DAY = 86_400_000
const NOW = new Date(2026, 8, 26, 12).getTime()

function sheet(over: Partial<LibrarySheet> & { id: string }): LibrarySheet {
  return {
    title: 'Sheet',
    kind: 'other',
    tags: [],
    at: NOW,
    addedAt: NOW,
    read: true,
    haystack: '',
    ...over,
  }
}

describe('matches — search ignores accents and case, every word must hit', () => {
  const s = sheet({
    id: 'a',
    title: 'Present subjunctive',
    tags: ['conjuntivo presente'],
    haystack: 'Você deve estudar',
  })
  test('title, tags and text', () => {
    expect(matches(s, 'SUBJUNCTIVE')).toBe(true)
    expect(matches(s, 'conjuntivo')).toBe(true)
    expect(matches(s, 'voce estudar')).toBe(true)
    expect(matches(s, 'voce futuro')).toBe(false)
    expect(matches(s, '   ')).toBe(true)
  })
})

describe('arrange, kindCounts, byMonth', () => {
  const sheets = [
    sheet({ id: 'g1', kind: 'grammar', at: NOW - 40 * DAY }),
    sheet({ id: 'v1', kind: 'vocabulary', at: NOW - 2 * DAY }),
    sheet({ id: 'g2', kind: 'grammar', at: NOW - 1 * DAY }),
  ]

  test('filter by kind, newest or oldest first', () => {
    expect(
      arrange(sheets, { kind: 'grammar', query: '', order: 'newest' }).map(
        (s) => s.id,
      ),
    ).toEqual(['g2', 'g1'])
    expect(
      arrange(sheets, { kind: 'all', query: '', order: 'oldest' }).map(
        (s) => s.id,
      ),
    ).toEqual(['g1', 'v1', 'g2'])
  })

  test('counts only the kinds that have a sheet, in the fixed order', () => {
    expect(kindCounts(sheets)).toEqual([
      { kind: 'grammar', count: 2 },
      { kind: 'vocabulary', count: 1 },
    ])
  })

  test('months follow the order given', () => {
    const groups = byMonth(
      arrange(sheets, { kind: 'all', query: '', order: 'newest' }),
    )
    expect(groups.map((g) => [g.label, g.sheets.length])).toEqual([
      ['September 2026', 2],
      ['August 2026', 1],
    ])
  })
})

describe('dueForRevisit — a few settled sheets, longest untouched first', () => {
  test('new sheets settle first; revised ones rest a week', () => {
    const due = dueForRevisit(
      [
        sheet({ id: 'today', addedAt: NOW - DAY / 2 }),
        sheet({ id: 'old-never', addedAt: NOW - 10 * DAY }),
        sheet({ id: 'settled', addedAt: NOW - 3 * DAY }),
        sheet({
          id: 'rested',
          addedAt: NOW - 30 * DAY,
          revisedAt: NOW - 8 * DAY,
        }),
        sheet({
          id: 'fresh',
          addedAt: NOW - 30 * DAY,
          revisedAt: NOW - 2 * DAY,
        }),
        sheet({ id: 'unread', addedAt: NOW - 30 * DAY, read: false }),
      ],
      NOW,
    )
    expect(due.map((s) => s.id)).toEqual(['old-never', 'rested', 'settled'])
  })

  test('never more than three', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      sheet({ id: `s${i}`, addedAt: NOW - (10 + i) * DAY }),
    )
    expect(dueForRevisit(many, NOW)).toHaveLength(3)
  })
})
