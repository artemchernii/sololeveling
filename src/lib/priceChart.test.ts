import { describe, expect, it } from 'vitest'

import {
  between,
  candleRows,
  drawable,
  many,
  boxAt,
  firstSince,
  leftStop,
  nearMark,
  nearest,
  priceSeries,
  ruler,
  withOlder,
} from './priceChart'

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

  it('reads the dot within reach of the pointer, the nearest one', () => {
    const dots = [
      { i: 3, x: 100 },
      { i: 9, x: 112 },
    ]
    expect(nearMark(dots, 104, 9)).toBe(3)
    expect(nearMark(dots, 108, 9)).toBe(9)
    expect(nearMark(dots, 121, 9)).toBe(9)
    expect(nearMark(dots, 122, 9)).toBeNull()
    expect(nearMark([], 100, 9)).toBeNull()
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

  it('rules from where the drag began to where it ended, with the days', () => {
    const day = 86_400_000
    const up = ruler({ t: 10 * day, v: 80 }, { t: 3 * day, v: 100.004 })
    expect(up.from).toEqual({ t: 10 * day, v: 80 })
    expect(up.to.v).toBe(100.004)
    expect(up.diff).toBe(20)
    expect(up.pct).toBe(25)
    expect(up.days).toBe(7)
    const down = ruler({ t: 0, v: 50 }, { t: day, v: 45 })
    expect(down.diff).toBe(-5)
    expect(down.pct).toBe(-10)
    expect(down.days).toBe(1)
    expect(ruler({ t: 0, v: 0 }, { t: 0, v: 5 }).pct).toBe(0)
  })
})

/* The box at a dot (13 Oct, chart.html #tip): beside the dot, inside
   the plot, never cut by an edge. */
describe('boxAt', () => {
  const plot = { w: 800, h: 380, room: 730 }
  const box = { w: 260, h: 56 }

  it('centres a box over its dot, below a buy and above a sale', () => {
    expect(boxAt({ x: 400, y: 100, side: 'buy' }, box, plot)).toEqual({
      left: 270,
      top: 118,
    })
    expect(boxAt({ x: 400, y: 200, side: 'sell' }, box, plot)).toEqual({
      left: 270,
      top: 126,
    })
  })

  it('turns to the other side when one has no room', () => {
    expect(boxAt({ x: 400, y: 340, side: 'buy' }, box, plot).top).toBe(266)
    expect(boxAt({ x: 400, y: 20, side: 'sell' }, box, plot).top).toBe(38)
  })

  it('stays clear of the left edge and the price axis', () => {
    expect(boxAt({ x: 10, y: 100, side: 'buy' }, box, plot).left).toBe(6)
    expect(boxAt({ x: 720, y: 100, side: 'buy' }, box, plot).left).toBe(470)
  })

  it('on a phone, a box wider than the room still starts inside', () => {
    const phone = { w: 343, h: 300, room: 290 }
    const at = boxAt({ x: 300, y: 150, side: 'buy' }, box, phone)
    expect(at.left).toBeGreaterThanOrEqual(6)
    expect(at.left + box.w).toBeLessThanOrEqual(phone.w - 6)
  })

  it('a plot too short for the box keeps its top inside', () => {
    const at = boxAt({ x: 400, y: 30, side: 'buy' }, box, {
      ...plot,
      h: 60,
    })
    expect(at.top).toBe(6)
  })
})

/* Candles and volume (13 Oct, chart.html). */
describe('what can be drawn', () => {
  const bar = { o: 1, h: 3, l: 0.5, vol: 199_000 }
  it('candles where every stored day has all four', () => {
    expect(
      drawable([
        { t: 1, v: 2, ...bar },
        { t: 2, v: 2, ...bar },
      ]),
    ).toEqual({ candles: true, whole: true, volume: true })
    expect(
      drawable([
        { t: 1, v: 2, ...bar },
        { t: 2, v: 2 },
      ]),
    ).toEqual({ candles: false, whole: false, volume: true })
  })
  /* Yahoo sent VUAA.L's 12 Oct empty: one day in a year. */
  it('a day or two with no bar still leaves candles, that day left out', () => {
    const year = Array.from({ length: 250 }, (_, i) => ({
      t: i * DAY,
      v: 2,
      ...(i === 100 ? {} : bar),
    }))
    expect(drawable(year)).toMatchObject({ candles: true, whole: false })
    const rows = candleRows(year)
    expect(rows).toHaveLength(250)
    expect(rows[100]).toEqual({ time: 100 * 86_400 })
    expect(rows[99]).toEqual({
      time: 99 * 86_400,
      open: 1,
      high: 3,
      low: 0.5,
      close: 2,
    })
  })
  /* The last five days only, as before a share's year is read again. */
  it('a few bars among closes are not candles', () => {
    const year = Array.from({ length: 250 }, (_, i) => ({
      t: i * DAY,
      v: 2,
      ...(i >= 245 ? bar : {}),
    }))
    expect(drawable(year)).toMatchObject({ candles: false, whole: false })
  })
  it('no volume where none is stored, or it is all zero', () => {
    expect(drawable([{ t: 1, v: 2 }])).toEqual({
      candles: false,
      whole: false,
      volume: false,
    })
    expect(drawable([{ t: 1, v: 2, ...bar, vol: 0 }]).volume).toBe(false)
    expect(drawable([])).toEqual({
      candles: false,
      whole: false,
      volume: false,
    })
  })
})

describe('shares traded, said short', () => {
  it('thousands and millions', () => {
    expect(many(199_000)).toBe('199K')
    expect(many(1_240_000)).toBe('1.2M')
    expect(many(640)).toBe('640')
  })
})

it('older years go before the loaded year, a day once', () => {
  const year = [{ asOf: 10 * DAY + 5 }, { asOf: 11 * DAY }]
  const older = [{ asOf: 8 * DAY }, { asOf: 9 * DAY + 7 }, { asOf: 10 * DAY }]
  expect(withOlder(year, older).map((p) => p.asOf)).toEqual([
    8 * DAY,
    9 * DAY + 7,
    10 * DAY + 5,
    11 * DAY,
  ])
  expect(withOlder(year, [])).toEqual(year)
  expect(withOlder([], older)).toEqual(older)
})

it('the view never opens before the first stored close', () => {
  /* In the stored days: left alone. */
  expect(leftStop({ from: -0.5, to: 99.5 }, 100)).toBeNull()
  expect(leftStop({ from: 20, to: 60 }, 100)).toBeNull()
  expect(leftStop(null, 100)).toBeNull()
  /* Dragged past the first day: the same width, from the first day. */
  expect(leftStop({ from: -10.5, to: 29.5 }, 100)).toEqual({
    from: -0.5,
    to: 39.5,
  })
  /* Zoomed out past everything: all of it, a little air after. */
  expect(leftStop({ from: -50, to: 150 }, 100)).toEqual({
    from: -0.5,
    to: 101.5,
  })
})
