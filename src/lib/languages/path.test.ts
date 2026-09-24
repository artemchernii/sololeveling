import { describe, expect, test } from 'vitest'

import { CEFR_MEANING, languageByCode, nextCefr, parseCefr } from './catalog'
import { nextTopic, pathFor, pathLevels } from './path'
import type { TopicProgress } from './path'

describe('parseCefr', () => {
  test('reads the rung from what he typed', () => {
    expect(parseCefr('B1')).toBe('B1')
    expect(parseCefr(' b2+ ')).toBe('B2')
    expect(parseCefr('B1 (almost B2)')).toBe('B1')
  })
  test('anything else is not a rung', () => {
    expect(parseCefr('good')).toBeNull()
    expect(parseCefr(null)).toBeNull()
    expect(parseCefr('D1')).toBeNull()
  })
  test('the ladder steps up and stops at C2', () => {
    expect(nextCefr('B1')).toBe('B2')
    expect(nextCefr('C2')).toBeNull()
    expect(CEFR_MEANING.B1.name).toBe('Intermediate')
  })
})

describe('the European Portuguese path', () => {
  const path = pathFor('pt-PT')

  test('covers A1 to C1, in order, with unique permanent ids', () => {
    expect(pathLevels(path)).toEqual(['A1', 'A2', 'B1', 'B2', 'C1'])
    expect(new Set(path.map((t) => t.id)).size).toBe(path.length)
    for (const t of path) {
      expect(t.id.startsWith(t.level.toLowerCase())).toBe(true)
      expect(t.examples.length).toBeGreaterThan(0)
    }
  })

  test('a language with no built-in path has none', () => {
    expect(pathFor('de')).toEqual([])
    expect(pathFor(undefined)).toEqual([])
    expect(languageByCode('pt-PT')?.flag).toBe('🇵🇹')
  })
})

describe('nextTopic', () => {
  const path = pathFor('pt-PT')
  const b1 = path.filter((t) => t.level === 'B1')
  const b2 = path.filter((t) => t.level === 'B2')

  test('nothing done: the first topic of his level', () => {
    expect(nextTopic(path, 'B1', () => undefined)?.id).toBe(b1[0].id)
  })

  test('no level recorded: starts at A1', () => {
    expect(nextTopic(path, null, () => undefined)?.level).toBe('A1')
  })

  test('skips solid and practised topics for a fresh one', () => {
    const seen = new Map<string, TopicProgress>([
      [b1[0].id, { solid: true, total: 3, lastAt: 1 }],
      [b1[1].id, { solid: false, total: 1, lastAt: 5 }],
    ])
    expect(nextTopic(path, 'B1', (id) => seen.get(id))?.id).toBe(b1[2].id)
  })

  test('all practised: the one practised longest ago', () => {
    const seen = new Map<string, TopicProgress>()
    ;[...b1, ...b2].forEach((t, i) =>
      seen.set(t.id, { solid: false, total: 1, lastAt: 100 + i }),
    )
    seen.set(b2[3].id, { solid: false, total: 2, lastAt: 5 })
    expect(nextTopic(path, 'B1', (id) => seen.get(id))?.id).toBe(b2[3].id)
  })

  test('both levels solid: nothing to suggest', () => {
    const solid = () => ({ solid: true, total: 1, lastAt: 1 })
    expect(nextTopic(path, 'B1', solid)).toBeNull()
  })
})
