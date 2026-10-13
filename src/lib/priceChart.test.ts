import { describe, expect, it } from 'vitest'

import { BOX, priceChart } from './priceChart'

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
