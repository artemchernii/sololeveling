import type { TimelineItem } from './timeline'

/* Today's TODAY card (17 Oct): the next thing at a time, how long until
   it, and where an hour sits on the 08 → 24 line. */

export const DAY_FROM = 8
export const DAY_TO = 24

/** The first item that has not started yet, or null. */
export function nextItem(
  items: ReadonlyArray<TimelineItem>,
  now: number,
): TimelineItem | null {
  return items.find((i) => i.startsAt > now) ?? null
}

/** `IN 2H 10M`, `IN 5M`. */
export function inLabel(ms: number): string {
  const min = Math.max(0, Math.ceil(ms / 60_000))
  const h = Math.floor(min / 60)
  const m = min % 60
  return h > 0 ? `IN ${h}H ${m}M` : `IN ${m}M`
}

/** An hour of the day (11.5 = 11:30) as a percentage along the line,
    held inside it. */
export function dayX(hour: number): number {
  const p = ((hour - DAY_FROM) / (DAY_TO - DAY_FROM)) * 100
  return Math.min(100, Math.max(0, p))
}

export function hourOf(ms: number): number {
  const d = new Date(ms)
  return d.getHours() + d.getMinutes() / 60
}

/** Rows for the line: an item that starts before another on its row ends
    goes to the next row down, so two at once are both readable. Returns
    each item's row and how many rows there are. */
export function lanes(
  items: ReadonlyArray<{ startsAt: number; durationMin?: number }>,
): { lane: Array<number>; count: number } {
  const ends: Array<number> = []
  const lane = items.map((i) => {
    const end = i.startsAt + (i.durationMin ?? 30) * 60_000
    const free = ends.findIndex((e) => e <= i.startsAt)
    const row = free === -1 ? ends.length : free
    ends[row] = end
    return row
  })
  return { lane, count: Math.max(1, ends.length) }
}
