import type { TimelineItem } from './timeline'

/* Today's TODAY card (17 Oct): the next thing at a time, and how long until
   it. */

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
