import { describe, expect, it } from 'vitest'

import { between, firstSince, nearest, priceSeries } from './priceChart'

const DAY = 86_400_000
const points = [
  { t: 0, v: 100 },
  { t: DAY, v: 110 },
  { t: 2 * DAY, v: 90 },
  { t: 3 * DAY, v: 120 },
]

describe('priceSeries', () => {
  it('needs two points to draw a line', () => {
    expect(priceSeries([])).toBeNull()
    expect(priceSeries([points[0]])).toBeNull()
  })

  it('gives the closes oldest first, one a second, the later reading kept', () => {
    const s = priceSeries([points[2], points[0], { t: 400, v: 101 }])!
    expect(s.pts.map((p) => p.v)).toEqual([101, 90])
  })

  it('puts a buy on the nearest stored day, with what it was for', () => {
    const s = priceSeries(points, [
      { t: DAY + 3_600_000, side: 'buy', eur: 250 },
    ])!
    expect([...s.on.keys()]).toEqual([1])
    expect(s.on.get(1)).toEqual([{ t: DAY + 3_600_000, side: 'buy', eur: 250 }])
  })

  it('keeps two trades of one day together, earlier first', () => {
    const s = priceSeries(points, [
      { t: 2 * DAY + 2000, side: 'sell' },
      { t: 2 * DAY + 1000, side: 'buy' },
    ])!
    expect(s.on.get(2)?.map((m) => m.side)).toEqual(['buy', 'sell'])
  })

  it('does not draw a trade from before the period', () => {
    const s = priceSeries(points, [
      { t: -30 * DAY, side: 'buy' },
      { t: 3 * DAY + 1000, side: 'sell' },
    ])!
    expect([...s.on.keys()]).toEqual([3])
  })
})

describe('firstSince', () => {
  it('opens a range on the first close inside it', () => {
    expect(firstSince(points, -DAY)).toBe(0)
    expect(firstSince(points, DAY + 1)).toBe(2)
  })

  it('never shows fewer than the last two closes', () => {
    expect(firstSince(points, 3 * DAY)).toBe(2)
    expect(firstSince(points, 9 * DAY)).toBe(2)
  })
})

describe('what the pointer reads', () => {
  it('finds the stored close nearest a place across the box', () => {
    const xs = [{ x: 4 }, { x: 190 }, { x: 377 }, { x: 564 }]
    expect(nearest(xs, -50)).toBe(0)
    expect(nearest(xs, 378)).toBe(2)
    expect(nearest(xs, 620)).toBe(3)
  })

  it('gives two days, both prices and the difference, earlier first', () => {
    const d = between(points[3], points[0])
    expect(d.from).toEqual(points[0])
    expect(d.to).toEqual(points[3])
    expect(d.diff).toBe(20)
    expect(d.pct).toBe(20)
    expect(between(points[1], points[2]).diff).toBe(-20)
    expect(between(points[1], points[2]).pct).toBeCloseTo(-18.18, 2)
  })
})
