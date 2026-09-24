/* 24 Sep. The second line of a row in the notes list: when it was written,
   when it last changed. Short enough to read at a glance and still exact. */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]
const MIN = 60_000
const DAY = 24 * 60 * MIN

function dayStart(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** "just now", "14:05", "yesterday", "Mon", "3 Sep", "3 Sep 2025". */
export function whenLabel(ms: number, now: number): string {
  if (now - ms < MIN) return 'just now'
  const days = Math.round((dayStart(now) - dayStart(ms)) / DAY)
  const d = new Date(ms)
  if (days === 0) {
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  }
  if (days === 1) return 'yesterday'
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' })
  /* Spelled out rather than asked of the locale: en-GB now says "Sept". */
  const month = MONTHS[d.getMonth()]
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return sameYear
    ? `${d.getDate()} ${month}`
    : `${d.getDate()} ${month} ${d.getFullYear()}`
}

/** Whether "edited" is worth saying: a change made while it was being
    written — within the first few minutes — is part of writing it. */
export function wasEdited(created: number, updated: number | undefined) {
  return updated !== undefined && updated - created > 5 * MIN
}
