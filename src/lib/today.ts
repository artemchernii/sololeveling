/* The server has no idea what "today" is for a person in Lisbon, and a Convex
   query does not rerun because a clock ticked. So the day boundary is computed
   here and passed in as an argument (PLAN.md §2, tasks.listToday). */

/** Local calendar date as YYYY-MM-DD — not toISOString(), which is UTC. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Midnight this morning, local, as an epoch — the window "logged today" means. */
export function startOfLocalDay(now: Date = new Date()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
