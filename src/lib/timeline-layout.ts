import type { TimelineNode } from './goal-timeline'

/* Where each node of a goal's timeline sits, in pixels (24 Sep).

   Artem asked for the timeline "with dates": steps placed by when they are
   due between the day the goal was made and its deadline, with today marked
   on the line — so being behind or ahead is something you see, not
   something you work out.

   Three rules keep that honest and readable:

   1. Order is his. Steps stay in the order he set, even when a later step
      has an earlier date; they are pushed apart rather than swapped.
   2. Nothing collides. Neighbours are at least `minStep` apart, so every
      caption has room. When that does not fit the width given, the line is
      made wider and the caller scrolls it.
   3. No invented dates. A step with no date sits evenly between the dated
      things either side of it. Without a deadline there is no axis at all,
      and the steps are simply spaced evenly, with no today mark.

   Positions only. Nothing here is a fraction shown to anyone — the date
   axis is geometry, and "today" is a date, not a score (PLAN.md §1). */

const DAY = 24 * 60 * 60 * 1000

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / DAY)
}

function dateOf(node: TimelineNode): string | undefined {
  if (node.kind === 'start') return node.date
  if (node.kind === 'end') return node.deadline
  return node.dueDate
}

export type TimelineLayout = {
  /** The x of each node, in the order given. */
  xs: Array<number>
  /** The line's full width; wider than asked when the steps need room. */
  width: number
  /** Where today falls, or null when there is no axis or it is off it. */
  todayX: number | null
  /** True when positions follow dates; false when evenly spaced. */
  dated: boolean
}

export function layoutTimeline(
  nodes: Array<TimelineNode>,
  opts: {
    /** The room available. */
    width: number
    /** The least distance between two neighbours. */
    minStep: number
    /** Room kept at each end for a caption to be centred on its node. */
    pad: number
    /** Today, as a local ISO date. */
    today: string
  },
): TimelineLayout {
  const n = nodes.length
  const width = Math.max(opts.width, (n - 1) * opts.minStep + 2 * opts.pad)
  const left = opts.pad
  const right = width - opts.pad
  const span = right - left

  const startDay = dayNumber(dateOf(nodes[0])!)
  const endIso = dateOf(nodes[n - 1])
  const endDay = endIso === undefined ? undefined : dayNumber(endIso)
  const dated = endDay !== undefined && endDay > startDay

  if (!dated) {
    const xs = nodes.map((_, i) => left + (n === 1 ? 0 : (span * i) / (n - 1)))
    return { xs, width, todayX: null, dated: false }
  }

  /* 0 at the start, 1 at the deadline; NaN where there is no date yet. */
  const t = nodes.map((node, i) => {
    if (i === 0) return 0
    if (i === n - 1) return 1
    const iso = dateOf(node)
    if (iso === undefined) return Number.NaN
    return Math.min(
      Math.max((dayNumber(iso) - startDay) / (endDay - startDay), 0),
      1,
    )
  })

  /* An undated step sits evenly between the nearest dated things. */
  for (let i = 1; i < n - 1; i += 1) {
    if (!Number.isNaN(t[i])) continue
    let a = i - 1
    while (Number.isNaN(t[a])) a -= 1
    let b = i + 1
    while (Number.isNaN(t[b])) b += 1
    t[i] = t[a] + ((t[b] - t[a]) * (i - a)) / (b - a)
  }

  const xs = t.map((v) => left + v * span)
  /* Forward: never closer than minStep to the one before. */
  for (let i = 1; i < n; i += 1)
    xs[i] = Math.max(xs[i], xs[i - 1] + opts.minStep)
  /* Backward: the end back on the right edge, and nothing past it. */
  xs[n - 1] = right
  for (let i = n - 2; i >= 0; i -= 1)
    xs[i] = Math.min(xs[i], xs[i + 1] - opts.minStep)
  xs[0] = Math.max(xs[0], left)

  return { xs, width, todayX: todayOn(nodes, xs, opts.today), dated: true }
}

/* Today, between the two dated nodes either side of it, by date. Off the
   line before the goal began; pinned to the end once the deadline passed,
   since "past the deadline" is exactly what it should show. */
function todayOn(
  nodes: Array<TimelineNode>,
  xs: Array<number>,
  today: string,
): number | null {
  const now = dayNumber(today)
  const anchors = nodes
    .map((node, i) => ({ iso: dateOf(node), x: xs[i] }))
    .filter((a): a is { iso: string; x: number } => a.iso !== undefined)
    .map((a) => ({ day: dayNumber(a.iso), x: a.x }))
    .sort((a, b) => a.day - b.day || a.x - b.x)

  if (now < anchors[0].day) return null
  const last = anchors[anchors.length - 1]
  if (now >= last.day) return last.x
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i]
    const b = anchors[i + 1]
    if (now >= a.day && now <= b.day) {
      return b.day === a.day
        ? a.x
        : a.x + ((b.x - a.x) * (now - a.day)) / (b.day - a.day)
    }
  }
  return null
}

/** A date halfway between two ISO dates — the first guess for a step added
    between them. Undefined when either side has no date. */
export function midDate(a?: string, b?: string): string | undefined {
  if (a === undefined || b === undefined) return undefined
  const day = Math.round((dayNumber(a) + dayNumber(b)) / 2)
  return new Date(day * DAY).toISOString().slice(0, 10)
}
