import { describe, expect, test } from 'vitest'

import { matchesQuery, sortNotes, wasEdited, whenLabel } from './note-meta'

const now = new Date(2026, 8, 24, 15, 0).getTime() // Thursday

describe('whenLabel', () => {
  test('near, today, yesterday, this week, older, another year', () => {
    expect(whenLabel(now - 20_000, now)).toBe('just now')
    expect(whenLabel(new Date(2026, 8, 24, 9, 5).getTime(), now)).toBe('09:05')
    expect(whenLabel(new Date(2026, 8, 23, 22, 0).getTime(), now)).toBe(
      'yesterday',
    )
    expect(whenLabel(new Date(2026, 8, 21, 10, 0).getTime(), now)).toBe('Mon')
    expect(whenLabel(new Date(2026, 8, 3, 10, 0).getTime(), now)).toBe('3 Sep')
    expect(whenLabel(new Date(2025, 8, 3, 10, 0).getTime(), now)).toBe(
      '3 Sep 2025',
    )
  })
})

describe('wasEdited', () => {
  test('not while it was being written, yes later, no when never', () => {
    expect(wasEdited(now, now + 60_000)).toBe(false)
    expect(wasEdited(now, now + 60 * 60_000)).toBe(true)
    expect(wasEdited(now, undefined)).toBe(false)
  })
})

describe('sortNotes', () => {
  const notes = [
    { title: 'banana', _creationTime: 1, updatedAt: 50 },
    { title: 'Apple', _creationTime: 3 },
    { title: 'cherry', _creationTime: 2, updatedAt: 10 },
  ]
  const titles = (xs: Array<{ title: string }>) => xs.map((n) => n.title)

  test('newest first by creation', () => {
    expect(titles(sortNotes(notes, 'new'))).toEqual([
      'Apple',
      'cherry',
      'banana',
    ])
  })

  test('recently edited, or created when never edited', () => {
    expect(titles(sortNotes(notes, 'edited'))).toEqual([
      'banana',
      'cherry',
      'Apple',
    ])
  })

  test('A–Z ignoring case', () => {
    expect(titles(sortNotes(notes, 'az'))).toEqual([
      'Apple',
      'banana',
      'cherry',
    ])
  })

  test('leaves the list it was given alone', () => {
    sortNotes(notes, 'az')
    expect(titles(notes)).toEqual(['banana', 'Apple', 'cherry'])
  })
})

describe('matchesQuery', () => {
  const note = {
    title: 'Гоління — перехід на T-подібну бритву',
    body: 'ПОКУПКИ (~70-80€ на старті)\nCafé Merkur razor',
  }

  test('empty matches everything', () => {
    expect(matchesQuery(note, '  ')).toBe(true)
  })

  test('every word, anywhere, any order, any case', () => {
    expect(matchesQuery(note, 'бритву покупки')).toBe(true)
    expect(matchesQuery(note, 'RAZOR merkur')).toBe(true)
    expect(matchesQuery(note, 'razor gillette')).toBe(false)
  })

  test('accents do not matter', () => {
    expect(matchesQuery(note, 'cafe')).toBe(true)
  })
})
