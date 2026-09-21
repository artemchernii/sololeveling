/* The server has no idea what "today" is for a person in Lisbon, and a Convex
   query does not rerun because a clock ticked. So the day boundary is computed
   here and passed in as an argument (PLAN.md §2, tasks.listToday). */

/** Local calendar date as YYYY-MM-DD — not toISOString(), which is UTC. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/* A local calendar date a number of days from now — how the due-date chips
   say "today" and "tomorrow" without a picker (20 Sep).

   Days are added with setDate rather than to an epoch, so the clocks going
   back does not make tomorrow land on today: setDate counts calendar days,
   86_400_000 counts seconds, and on two nights a year those differ. */
export function localDateIn(days: number, now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() + days)
  return localToday(d)
}

/** Midnight this morning, local, as an epoch — the window "logged today" means. */
export function startOfLocalDay(now: Date = new Date()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
