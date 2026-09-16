import { localToday } from './today'

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

export function clock(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * When a log happened, said the way you would say it: "now", "today 14:05",
 * "yesterday 19:10", "Thu 19:10", "12 Sep 19:10". The time is always shown
 * once it is not now — a back-dated log that hides its hour is one you cannot
 * check before pressing Enter.
 */
export function whenLabel(ms: number, now: Date = new Date()): string {
  if (Math.abs(now.getTime() - ms) < 90_000) return 'now'

  const at = new Date(ms)
  const day = new Date(ms).setHours(0, 0, 0, 0)
  const today = new Date(now).setHours(0, 0, 0, 0)
  const days = Math.round((today - day) / MS_PER_DAY)

  if (days === 0) return `today ${clock(at)}`
  if (days === 1) return `yesterday ${clock(at)}`
  if (days > 1 && days < 7) {
    return `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${clock(at)}`
  }
  return `${at.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${clock(at)}`
}

/** "45m", "2h", "7h 30m" — minutes that were logged, said the short way. */
export function durationLabel(minutes: number): string {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/**
 * How long ago something was written down: "today", "yesterday", "3d ago",
 * "2w ago", then the date. Whole local days, so last night is yesterday.
 * A display of `_creationTime`, like deadlineLabel is of a deadline — not a
 * metric.
 */
export function agoLabel(ms: number, now: Date = new Date()): string {
  const day = new Date(ms).setHours(0, 0, 0, 0)
  const today = new Date(now).setHours(0, 0, 0, 0)
  const days = Math.round((today - day) / MS_PER_DAY)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days}d ago`
  if (days < 60) return `${Math.floor(days / 7)}w ago`
  return new Date(ms).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}

/** A time as a `datetime-local` input wants it: local, to the minute. */
export function localInputValue(ms: number): string {
  const d = new Date(ms)
  return `${localToday(d)}T${clock(d)}`
}
