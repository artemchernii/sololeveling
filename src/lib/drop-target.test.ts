import { describe, expect, test } from 'vitest'

import { nearestTarget } from './drop-target'

const targets = [
  { key: 'a', x: 100, y: 50 },
  { key: 'b', x: 250, y: 50 },
]

describe('nearestTarget', () => {
  test('the nearest + within reach', () => {
    expect(nearestTarget({ x: 120, y: 60 }, targets, 48)).toBe('a')
    expect(nearestTarget({ x: 230, y: 40 }, targets, 48)).toBe('b')
  })

  test('nothing within reach is nothing', () => {
    expect(nearestTarget({ x: 175, y: 50 }, targets, 48)).toBeNull()
    expect(nearestTarget({ x: 100, y: 200 }, targets, 48)).toBeNull()
  })

  test('the edge of reach still counts', () => {
    expect(nearestTarget({ x: 148, y: 50 }, targets, 48)).toBe('a')
  })

  test('no targets', () => {
    expect(nearestTarget({ x: 0, y: 0 }, [], 48)).toBeNull()
  })
})
