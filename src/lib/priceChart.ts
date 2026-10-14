/* The price line on one position's page (13 Oct, mockup chart.html):
   the stored closes as the chart library takes them, and which stored
   close each buy and sell sits on. The points are the stored readings;
   nothing is made up between two of them. */

/** A stored close; `eur` is it in euros, where the server had a rate.
    `o`, `h`, `l` and `vol` are the day's open, high, low and shares
    traded, where the day is stored as a bar. */
export type Pt = {
  t: number
  v: number
  eur?: number
  o?: number
  h?: number
  l?: number
  vol?: number
}
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

const isBar = (p: Pt) =>
  p.o !== undefined && p.h !== undefined && p.l !== undefined

/* How many of the stored days must be bars for candles to be offered. */
const MOSTLY = 0.95

/** What the stored days can be drawn as (13 Oct, chart.html): candles
    where nearly every day has its open, high and low — Yahoo sends a
    day empty now and then, and that day is left out, never a candle
    made up (candleRows); volume where any shares traded are stored.
    `whole` says no day lacks its bar: nothing is left to read again. */
export function drawable(pts: ReadonlyArray<Pt>) {
  const bars = pts.filter(isBar).length
  return {
    candles: bars > 0 && bars >= pts.length * MOSTLY,
    whole: pts.length > 0 && bars === pts.length,
    volume: pts.some((p) => (p.vol ?? 0) > 0),
  }
}

/** The days as candles, at the second each is stored on. A day with no
    bar keeps its place and is drawn empty. */
export function candleRows(pts: ReadonlyArray<Pt>) {
  return pts.map((p) =>
    isBar(p)
      ? { time: seconds(p.t), open: p.o, high: p.h, low: p.l, close: p.v }
      : { time: seconds(p.t) },
  )
}

/** Shares traded, said short: "199K", "1.2M". */
export const many = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1)}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}K`
      : String(n)

/** The older years before the loaded year (13 Oct, "all"): only their
    days before its first one — a day stored in both is drawn once, as
    the year has it. */
export function withOlder<T extends { asOf: number }>(
  year: ReadonlyArray<T>,
  older: ReadonlyArray<T>,
): Array<T> {
  if (year.length === 0) return [...older]
  const first = Math.floor(year[0].asOf / DAY)
  return [...older.filter((p) => Math.floor(p.asOf / DAY) < first), ...year]
}

/** Where a range opens: the first stored close on or after `since`,
    never fewer than the last two — one point is not a line. */
export function firstSince(pts: ReadonlyArray<Pt>, since: number) {
  const i = pts.findIndex((p) => p.t >= since)
  return Math.max(0, Math.min(i < 0 ? pts.length : i, pts.length - 2))
}

/**
 * What is in view once it would show space before the first stored
 * close: moved back to start there, and no wider than all of them with
 * a little air after the latest. Null when nothing has to move.
 */
export function leftStop(
  view: { from: number; to: number } | null,
  count: number,
  air = 2,
) {
  if (view === null || view.from >= -0.5 - 1e-6) return null
  const to = Math.min(view.to - view.from - 0.5, count - 0.5 + air)
  return { from: -0.5, to }
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
 * The day's change on a position's head (14 Oct, "go with day change"
 * on position-head.html): the latest stored price against the last
 * stored close of an earlier day. Allowed on `between()`'s condition:
 * that close and its day are shown beside it. Null with no earlier day.
 */
export function dayChange(
  closes: ReadonlyArray<{ asOf: number; price: number }>,
  latest: { asOf: number; price: number },
) {
  const day = Math.floor(latest.asOf / DAY)
  let before: { asOf: number; price: number } | undefined
  for (const c of closes)
    if (Math.floor(c.asOf / DAY) < day && (!before || c.asOf > before.asOf))
      before = c
  if (before === undefined) return null
  return between(
    { t: before.asOf, v: before.price },
    { t: latest.asOf, v: latest.price },
  )
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

/**
 * Where the box at a dot sits (13 Oct, chart.html #tip): centred over
 * the dot, below a buy and above a sale, on the other side when that
 * one has no room — and never cut by an edge. `room` is the width left
 * of the price axis; `w` is the whole plot, the last limit.
 */
export function boxAt(
  dot: { x: number; y: number; side: 'buy' | 'sell' },
  box: { w: number; h: number },
  plot: { w: number; h: number; room: number },
  gap = 18,
  pad = 6,
) {
  const left = Math.max(
    pad,
    Math.min(plot.room - box.w, plot.w - box.w - pad, dot.x - box.w / 2),
  )
  const below = dot.y + gap
  const above = dot.y - box.h - gap
  const fitsBelow = below + box.h <= plot.h - pad
  const fitsAbove = above >= pad
  const top =
    dot.side === 'buy'
      ? fitsBelow || !fitsAbove
        ? below
        : above
      : fitsAbove || !fitsBelow
        ? above
        : below
  return { left, top: Math.max(pad, Math.min(plot.h - box.h - pad, top)) }
}
