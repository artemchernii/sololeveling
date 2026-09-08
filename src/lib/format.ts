/* A deadline rendered two ways: the date, and how far off it is.
 
   This is not a fourth number source (PLAN.md §1). Those govern metrics — a
   log count, a state value, an entity count. "23 days" is a stored `deadline`
   field displayed, the same way a title is displayed, so it belongs here rather
   than in aggregate.ts. */

const MS_PER_DAY = 86_400_000

/** "30 Sep" — no year, because a deadline you cannot see coming is not one. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * "ends 30 Sep · 23 days", or "ends 30 Sep · today", or "ended 30 Sep · 3 days
 * ago". Whole local days, so a deadline at midnight does not read as tomorrow.
 */
export function deadlineLabel(iso: string, now: Date = new Date()): string {
  const [y, m, d] = iso.split('-').map(Number)
  const due = new Date(y, m - 1, d).setHours(0, 0, 0, 0)
  const today = new Date(now).setHours(0, 0, 0, 0)
  const days = Math.round((due - today) / MS_PER_DAY)

  if (days === 0) return `ends ${shortDate(iso)} · today`
  if (days < 0) {
    const n = Math.abs(days)
    return `ended ${shortDate(iso)} · ${n} day${n === 1 ? '' : 's'} ago`
  }
  return `ends ${shortDate(iso)} · ${days} day${days === 1 ? '' : 's'}`
}
