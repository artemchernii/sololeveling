import { describe, expect, it } from 'vitest'

import { BOX, between, nearest, priceChart } from './priceChart'

const DAY = 86_400_000
const points = [
  { t: 0, v: 100 },
  { t: DAY, v: 110 },
  { t: 2 * DAY, v: 90 },
  { t: 3 * DAY, v: 120 },
]

describe('priceChart', () => {
  it('needs two points to draw a line', () => {
    expect(priceChart([])).toBeNull()
    expect(priceChart([points[0]])).toBeNull()
  })

  it('keeps the line inside the box, the last point at the right edge', () => {
    const c = priceChart(points)!
    expect(c.line.startsWith(`M${BOX.left.toFixed(1)},`)).toBe(true)
    expect(c.last.x).toBeCloseTo(BOX.w - BOX.right)
    for (const tick of c.ticks) {
      expect(tick.y).toBeGreaterThanOrEqual(BOX.top - 0.01)
      expect(tick.y).toBeLessThanOrEqual(BOX.h - BOX.bottom + 0.01)
    }
    /* A higher price sits higher. */
    expect(c.ticks[3].y).toBeLessThan(c.ticks[0].y)
  })

  it('puts a buy on the line at the nearest stored day', () => {
    const c = priceChart(points, [{ t: DAY + 3_600_000, side: 'buy' }])!
    const whole = BOX.w - BOX.left - BOX.right
    expect(c.dots).toHaveLength(1)
    expect(c.dots[0].x).toBeCloseTo(BOX.left + whole / 3)
    expect(c.dots[0].side).toBe('buy')
  })

  it('does not draw a trade from before the period', () => {
    const c = priceChart(points, [
      { t: -30 * DAY, side: 'buy' },
      { t: 3 * DAY + 1000, side: 'sell' },
    ])!
    expect(c.dots.map((d) => d.side)).toEqual(['sell'])
  })

  it('draws a flat price in the middle, not on an edge', () => {
    const c = priceChart([
      { t: 0, v: 50 },
      { t: DAY, v: 50 },
    ])!
    expect(c.last.y).toBeCloseTo((BOX.top + BOX.h - BOX.bottom) / 2)
  })
})

describe('what the pointer reads', () => {
  it('finds the stored close nearest a place across the box', () => {
    const c = priceChart(points)!
    expect(c.pts.map((p) => p.v)).toEqual([100, 110, 90, 120])
    expect(nearest(c.pts, -50)).toBe(0)
    expect(nearest(c.pts, c.pts[2].x + 1)).toBe(2)
    expect(nearest(c.pts, BOX.w)).toBe(3)
  })

  it('carries what a buy was for to its dot, at the close it sits on', () => {
    const c = priceChart(points, [{ t: DAY + 1000, side: 'buy', eur: 250 }])!
    expect(c.dots[0]).toMatchObject({ side: 'buy', eur: 250, v: 110 })
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
