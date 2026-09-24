import { expandEvents } from './recurrence'
import type { Doc } from '../../convex/_generated/dataModel'

/* R5. A reminder is delivered by an open tab of the app — no push to a closed
   one; that comes with the bell (PLAN §4 Late). So a reminder whose moment
   passed while no tab was open is not fired late on the next open: a gym
   reminder at 7:50 shown at 14:00 is noise. Only the last few minutes count. */

/** How late a reminder may still fire: long enough for a tab that was asleep. */
export const GRACE_MS = 3 * 60_000

export type DueReminder = {
  /** The occurrence id: one reminder per occurrence, across tabs and reloads. */
  key: string
  title: string
  startsAt: number
  fireAt: number
}

/** The reminders whose moment is now: fired within the last `GRACE_MS`. */
export function remindersToFire(
  events: Array<Doc<'events'>>,
  now: number,
): Array<DueReminder> {
  const withReminder = events.filter((e) => e.remindMin !== undefined)
  const byId = new Map(withReminder.map((e) => [e._id, e]))
  /* Anything firing now starts at most a day from now (the longest
     reminder), and any started more than GRACE_MS ago has already fired. */
  return expandEvents(
    withReminder,
    now - GRACE_MS,
    now + 24 * 60 * 60_000 + 1,
  ).flatMap((o) => {
    const event = byId.get(o.eventId)
    if (!event || event.remindMin === undefined) return []
    const fireAt = o.startsAt - event.remindMin * 60_000
    if (fireAt > now || now - fireAt > GRACE_MS) return []
    return [{ key: o.id, title: event.title, startsAt: o.startsAt, fireAt }]
  })
}

/** "Gym in 10 min", "Gym now". */
export function reminderText(r: DueReminder, now: number): string {
  const mins = Math.round((r.startsAt - now) / 60_000)
  if (mins <= 0) return `${r.title} now`
  if (mins < 60) return `${r.title} in ${mins} min`
  const h = Math.round(mins / 60)
  return `${r.title} in ${h} ${h === 1 ? 'hour' : 'hours'}`
}

/**
 * Asks the browser for notifications, from a tap. Returns a line to show when
 * the answer means the reminder will only appear inside the app, or null.
 */
export async function askToNotify(): Promise<string | null> {
  if (typeof Notification === 'undefined') {
    return 'This browser has no notifications — the reminder shows inside the app while it is open.'
  }
  let permission = Notification.permission
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission()
    } catch {
      permission = 'denied'
    }
  }
  if (permission === 'granted') {
    return 'Reminds while any tab of the app is open.'
  }
  return 'Notifications are blocked for this site — the reminder shows inside the app while it is open.'
}
