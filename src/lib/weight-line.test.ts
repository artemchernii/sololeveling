import { describe, expect, test } from 'vitest'

import { drift, geometry } from './weight-line'

const day = 86_400_000

describe('geometry', () => {
  test('two readings span the full width, newest on the right', () => {
    const g = geometry(
      [
        { value: 78, recordedAt: 0 },
        { value: 74, recordedAt: 10 * day },
      ],
      { width: 100, height: 40 },
    )
    expect(g).not.toBeNull()
    expect(g!.points[0].x).toBe(0)
    expect(g!.points[1].x).toBe(100)
    /* Heavier sits lower on the axis but higher on the screen: y grows
       downward in SVG. */
    expect(g!.points[0].y).toBeLessThan(g!.points[1].y)
  })

  test('the x of a reading follows when it was recorded, not its position', () => {
    const g = geometry(
      [
        { value: 78, recordedAt: 0 },
        { value: 77, recordedAt: 9 * day },
        { value: 76, recordedAt: 10 * day },
      ],
      { width: 100, height: 40 },
    )
    /* Three weigh-ins, two of them a day apart: evenly spaced points would
       claim a cadence that did not happen. */
    expect(g!.points[1].x).toBe(90)
  })

  test('one reading is a single dot, not a line', () => {
    const g = geometry([{ value: 75, recordedAt: 0 }], {
      width: 100,
      height: 40,
    })
    expect(g!.points).toHaveLength(1)
    expect(Number.isFinite(g!.points[0].x)).toBe(true)
    expect(Number.isFinite(g!.points[0].y)).toBe(true)
  })

  test('an unchanging weight is a flat line, not a divide by zero', () => {
    const g = geometry(
      [
        { value: 75, recordedAt: 0 },
        { value: 75, recordedAt: day },
      ],
      { width: 100, height: 40 },
    )
    expect(g!.points.every((p) => Number.isFinite(p.y))).toBe(true)
    expect(g!.points[0].y).toBe(g!.points[1].y)
  })

  test('a target outside the readings widens the axis so it is visible', () => {
    const g = geometry(
      [
        { value: 78, recordedAt: 0 },
        { value: 77, recordedAt: day },
      ],
      { width: 100, height: 40, target: 70 },
    )
    expect(g!.min).toBeLessThanOrEqual(70)
    expect(g!.targetY).not.toBeNull()
    expect(g!.targetY!).toBeLessThanOrEqual(40)
    expect(g!.targetY!).toBeGreaterThanOrEqual(0)
  })

  test('no target, no target line', () => {
    const g = geometry([{ value: 75, recordedAt: 0 }], {
      width: 100,
      height: 40,
    })
    expect(g!.targetY).toBeNull()
  })

  test('nothing recorded is nothing to draw', () => {
    expect(geometry([], { width: 100, height: 40 })).toBeNull()
  })
})

describe('drift — a state, never a grade', () => {
  test('moving toward the target is good', () => {
    expect(
      drift(
        [
          { value: 78, recordedAt: 0 },
          { value: 77, recordedAt: day },
        ],
        72,
      ),
    ).toBe('good')
  })

  test('moving away from it is a warning', () => {
    expect(
      drift(
        [
          { value: 77, recordedAt: 0 },
          { value: 78, recordedAt: day },
        ],
        72,
      ),
    ).toBe('warn')
  })

  test('the same weight twice says nothing', () => {
    expect(
      drift(
        [
          { value: 77, recordedAt: 0 },
          { value: 77, recordedAt: day },
        ],
        72,
      ),
    ).toBe('none')
  })

  test('one reading says nothing, and neither does no target', () => {
    expect(drift([{ value: 77, recordedAt: 0 }], 72)).toBe('none')
    expect(
      drift(
        [
          { value: 78, recordedAt: 0 },
          { value: 77, recordedAt: day },
        ],
        undefined,
      ),
    ).toBe('none')
  })

  test('it works when the target is above you, not only below', () => {
    expect(
      drift(
        [
          { value: 70, recordedAt: 0 },
          { value: 71, recordedAt: day },
        ],
        75,
      ),
    ).toBe('good')
  })
})
