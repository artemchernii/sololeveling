import { localToday } from './today'

/* A week is a thing on a calendar, not a duration. The server never computes
   one: like day boundaries (see today.ts), week boundaries are worked out here
   and passed in as arguments, because "the week of the 7th" depends on where
   the person is and Monday is a convention rather than a fact. */

/** Monday at local midnight, for the week the given day falls in. */
export function startOfWeek(date: Date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  /* getDay() is 0 for Sunday, which belongs to the week that began six days
     earlier rather than the one starting that morning. */
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7)
}

/** The week's identity in the `reviews` table: its Monday, as YYYY-MM-DD. */
export function weekKey(date: Date = new Date()): string {
  return localToday(startOfWeek(date))
}

/**
 * `count` consecutive Monday midnights ending with the week `date` is in,
 * oldest first — the argument `aggregate.weekCounts` takes.
 *
 * Built by stepping days rather than subtracting 7×24 hours: an hour goes
 * missing twice a year, and a week built out of milliseconds drifts across it.
 */
export function weekStartsEndingWith(
  date: Date = new Date(),
  count = 12,
): Array<number> {
  const latest = startOfWeek(date)
  return Array.from({ length: count }, (_, i) =>
    addWeeks(latest, i - (count - 1)).getTime(),
  )
}
