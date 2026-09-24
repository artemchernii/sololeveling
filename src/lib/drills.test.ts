import { describe, expect, test } from 'vitest'

import type { Doc, Id } from '../../convex/_generated/dataModel'
import { groupDrills } from './drills'

function drill(group: string, title: string, sortOrder: number): Doc<'drills'> {
  return {
    _id: `${group}-${title}` as Id<'drills'>,
    _creationTime: 0,
    ownerId: 'me',
    area: 'body',
    group,
    title,
    sortOrder,
  }
}

describe('groupDrills', () => {
  test('groups keep the order their first drill was added in', () => {
    const groups = groupDrills([
      drill('gym', 'Squat', 3),
      drill('stretch', 'Cat-cow', 1),
      drill('stretch', 'Bird dog', 2),
      drill('gym', 'Row', 4),
    ])
    expect(groups.map((g) => g.group)).toEqual(['stretch', 'gym'])
    expect(groups[0].drills.map((d) => d.title)).toEqual([
      'Cat-cow',
      'Bird dog',
    ])
    expect(groups[1].drills.map((d) => d.title)).toEqual(['Squat', 'Row'])
  })

  test('nothing in, nothing out', () => {
    expect(groupDrills([])).toEqual([])
  })
})
