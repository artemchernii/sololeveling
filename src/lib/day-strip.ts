import { addDays } from './weeks'

/* The geometry of a consistency strip, and nothing else — no React, no
   Convex, so it is testable without a DOM.

   Twelve weeks because it is long enough to show a habit and short enough to
   fit a phone. The strip ends today: a square for a day that has not happened
   is not a day you missed, and drawing one would read as a gap. */

export const STRIP_WEEKS = 12
/** The window behind "12 of the last 30 days". */
export const RECENT_DAYS = 30

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * `weeks * 7` local midnights, oldest first, ending with today.
 *
 * Built by stepping calendar days rather than subtracting 24 hours: an hour
 * goes missing twice a year, and a strip built out of milliseconds drifts
 * across it. Same rule as `weeks.ts`.
 */
export function dayStartsBack(
  weeks: number = STRIP_WEEKS,
  from: Date = new Date(),
): Array<number> {
  const today = new Date(from)
  today.setHours(0, 0, 0, 0)
  const count = weeks * 7
  const first = addDays(today, -(count - 1))
  return Array.from({ length: count }, (_, i) => addDays(first, i).getTime())
}

/**
 * The days in groups of seven, oldest first — the visual gap every week.
 *
 * These are groups of seven days, not calendar weeks: the strip ends today,
 * so a group boundary falls wherever counting back seven at a time puts it.
 * That is a reading aid, and nothing reads a group back as a week.
 */
export function dayBlocks(dayStarts: Array<number>): Array<Array<number>> {
  const blocks: Array<Array<number>> = []
  for (let i = 0; i < dayStarts.length; i += 7) {
    blocks.push(dayStarts.slice(i, i + 7))
  }
  return blocks
}

/** A month's short name over the first block that contains its 1st. */
export function blockLabels(blocks: Array<Array<number>>): Array<string> {
  const seen = new Set<number>()
  return blocks.map((block) => {
    for (const day of block) {
      const date = new Date(day)
      if (date.getDate() === 1 && !seen.has(date.getMonth())) {
        seen.add(date.getMonth())
        return MONTHS[date.getMonth()]
      }
    }
    return ''
  })
}
