/* The price line on one position's page (13 Oct, mockup portfolio.html):
   where the stored closes sit in a box, and where each buy and sell sits
   on that line. Pure geometry — the points are the stored readings and
   nothing is drawn between two of them but the straight line. */

export type Pt = { t: number; v: number }
/** A buy or a sell; `eur` is what it was for, read on its dot. */
export type Mark = { t: number; side: 'buy' | 'sell'; eur?: number }

export const BOX = { w: 620, h: 220, left: 4, right: 56, top: 12, bottom: 20 }

export function priceChart(
  points: ReadonlyArray<Pt>,
  marks: ReadonlyArray<Mark> = [],
) {
  if (points.length < 2) return null
  const { w, h, left, right, top, bottom } = BOX
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const values = points.map((p) => p.v)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = (max - min || max || 1) * 0.06
  const lo = min - pad
  const hi = max + pad
  const x = (t: number) =>
    t1 === t0 ? left : left + ((t - t0) / (t1 - t0)) * (w - left - right)
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo)) * (h - top - bottom)
  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join('')
  const last = points[points.length - 1]
  return {
    /* Each stored close where it sits — what the pointer reads. */
    pts: points.map((p) => ({ x: x(p.t), y: y(p.v), t: p.t, v: p.v })),
    line,
    area: `${line}V${h - bottom}H${left}Z`,
    ticks: [0, 1, 2, 3].map((i) => {
      const v = lo + ((hi - lo) * i) / 3
      return { v, y: y(v) }
    }),
    last: { x: x(last.t), y: y(last.v) },
    /* A buy or sell inside the period sits on the line at the stored
       close nearest its day; one before the period is not drawn. */
    dots: marks
      .filter((m) => m.t >= t0 && m.t <= t1 + 86_400_000)
      .map((m) => {
        const near = points.reduce((a, b) =>
          Math.abs(b.t - m.t) < Math.abs(a.t - m.t) ? b : a,
        )
        return { ...m, x: x(near.t), y: y(near.v), v: near.v }
      }),
    from: t0,
    to: t1,
  }
}

/** The stored close nearest a place across the box. */
export function nearest(pts: ReadonlyArray<{ x: number }>, x: number) {
  let best = 0
  for (let i = 1; i < pts.length; i++)
    if (Math.abs(pts[i].x - x) < Math.abs(pts[best].x - x)) best = i
  return best
}

/**
 * Two stored closes and the difference between them (13 Oct: "drag and
 * see differences"). The one worked-out number CLAUDE.md allows on this
 * chart, on its condition: both prices and both days are returned with
 * it, earlier first, so it is never shown alone.
 */
export function between(a: Pt, b: Pt) {
  const [from, to] = a.t <= b.t ? [a, b] : [b, a]
  const diff = Math.round((to.v - from.v) * 100) / 100
  return { from, to, diff, pct: from.v > 0 ? (diff / from.v) * 100 : 0 }
}
