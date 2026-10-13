/* The price line on one position's page (13 Oct, mockup chart.html):
   the stored closes as the chart library takes them, and which stored
   close each buy and sell sits on. The points are the stored readings;
   nothing is made up between two of them. */

export type Pt = { t: number; v: number }
/** A buy or a sell; `eur` is what it was for, read on its day. */
export type Mark = { t: number; side: 'buy' | 'sell'; eur?: number }

const DAY = 86_400_000
/** The library counts time in whole seconds. */
export const seconds = (t: number) => Math.floor(t / 1000)

export function priceSeries(
  points: ReadonlyArray<Pt>,
  marks: ReadonlyArray<Mark> = [],
) {
  /* Oldest first, one a second — the library refuses anything else. */
  const pts: Array<Pt> = []
  for (const p of [...points].sort((a, b) => a.t - b.t)) {
    const last = pts.at(-1)
    if (last && seconds(last.t) === seconds(p.t)) pts[pts.length - 1] = p
    else pts.push(p)
  }
  if (pts.length < 2) return null
  const t0 = pts[0].t
  const t1 = pts[pts.length - 1].t
  /* A buy or sell inside the period sits on the stored close nearest
     its day (the earlier of two equally near); one from before the
     period is not drawn. */
  const on = new Map<number, Array<Mark>>()
  for (const m of [...marks].sort((a, b) => a.t - b.t)) {
    if (m.t < t0 || m.t > t1 + DAY) continue
    let i = 0
    for (let k = 1; k < pts.length; k++)
      if (Math.abs(pts[k].t - m.t) < Math.abs(pts[i].t - m.t)) i = k
    on.set(i, [...(on.get(i) ?? []), m])
  }
  return { pts, on }
}

/** Where a range opens: the first stored close on or after `since`,
    never fewer than the last two — one point is not a line. */
export function firstSince(pts: ReadonlyArray<Pt>, since: number) {
  const i = pts.findIndex((p) => p.t >= since)
  return Math.max(0, Math.min(i < 0 ? pts.length : i, pts.length - 2))
}

/** The stored close nearest a place across the box. */
export function nearest(pts: ReadonlyArray<{ x: number }>, x: number) {
  let best = 0
  for (let i = 1; i < pts.length; i++)
    if (Math.abs(pts[i].x - x) < Math.abs(pts[best].x - x)) best = i
  return best
}

/** The buy or sell dot within reach of the pointer, the nearest of
    them; none when the pointer is further than `reach` from every dot.
    A dot is a few pixels wide and a day can be two — without this the
    pointer has to sit on the exact day to read what was bought. */
export function nearMark(
  dots: ReadonlyArray<{ i: number; x: number }>,
  x: number,
  reach: number,
) {
  let best: { i: number; x: number } | null = null
  for (const d of dots)
    if (
      Math.abs(d.x - x) <= reach &&
      (best === null || Math.abs(d.x - x) < Math.abs(best.x - x))
    )
      best = d
  return best?.i ?? null
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

/**
 * The ruler: from the point where a drag began to where it ended — two
 * levels read off the price axis, not stored closes, each on the stored
 * day under it. Allowed with `between()` on the same condition: both
 * levels and both days go with the difference, and the days between.
 */
export function ruler(from: Pt, to: Pt) {
  const diff = Math.round((to.v - from.v) * 100) / 100
  return {
    from,
    to,
    diff,
    pct: from.v > 0 ? (diff / from.v) * 100 : 0,
    days: Math.round(Math.abs(to.t - from.t) / DAY),
  }
}
