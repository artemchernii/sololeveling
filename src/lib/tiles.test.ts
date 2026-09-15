import { describe, expect, test } from 'vitest'

import { MONTH_TILES } from './tiles'

describe('the six month tiles (PLAN.md §3 item 4)', () => {
  test('the order monthCounts has, and no others', () => {
    expect(MONTH_TILES.map((t) => t.key)).toEqual([
      'projects',
      'portuguese',
      'body',
      'money',
      'style',
      'social',
    ])
  })

  test('Projects wears no area colour — it counts every area', () => {
    expect(MONTH_TILES[0].area).toBeUndefined()
    expect(MONTH_TILES.slice(1).every((t) => t.area !== undefined)).toBe(true)
  })
})
