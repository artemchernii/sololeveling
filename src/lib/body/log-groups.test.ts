import { describe, expect, test } from 'vitest'

import { groupByKind, splitSession } from './log-groups'

const row = (kind: string, category?: string, id = kind + category) => ({
  id,
  kind,
  meta: category === undefined ? undefined : { category },
})

describe('groupByKind', () => {
  test('weight first, then the hero order, other words, unsorted last', () => {
    const groups = groupByKind([
      row('intake', 'supplements'),
      row('workout', 'run'),
      row('workout'),
      row('workout', 'gym', 'g1'),
      row('weight'),
      row('workout', 'stretch'),
      row('workout', 'gym', 'g2'),
    ])
    expect(groups.map((g) => g.key)).toEqual([
      'weight',
      'stretch',
      'gym',
      'supplements',
      'run',
      null,
    ])
    /* A group keeps the rows' own order. */
    expect(groups[2].rows.map((r) => r.id)).toEqual(['g1', 'g2'])
  })

  test('no rows, no groups', () => {
    expect(groupByKind([])).toEqual([])
  })
})

describe('splitSession', () => {
  test('a workout and the moves ticked in it', () => {
    expect(splitSession('Back day — Lat pulldown, Face pull')).toEqual({
      title: 'Back day',
      moves: ['Lat pulldown', 'Face pull'],
    })
  })

  test('plain text stays whole', () => {
    expect(splitSession('mobility session')).toEqual({
      title: 'mobility session',
      moves: [],
    })
  })
})
