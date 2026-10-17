import { RRule } from 'rrule'

/* N1b (17 Oct). When the server sends an event's reminder. The browser
   expands a series in its own zone (`recurrence.ts`); the server runs in
   UTC, so it names the zone. One owner, in Lisbon — a weekly 18:00 run
   stays 18:00 across the clock change only if the rule runs on Lisbon's
   wall clock, the same floating trick as `recurrence.ts`. */

export const OWNER_ZONE = 'Europe/Lisbon'

const formats = new Map<string, Intl.DateTimeFormat>()
function format(zone: string) {
  let f = formats.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formats.set(zone, f)
  }
  return f
}

/** The zone's wall clock at `ms`, as the UTC fields of a Date. */
function wallClock(ms: number, zone: string): number {
  const parts: Record<string, number> = {}
  for (const p of format(zone).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
}

function offset(ms: number, zone: string): number {
  const whole = Math.floor(ms / 1000) * 1000
  return wallClock(whole, zone) - whole
}

function toFloating(ms: number, zone: string): Date {
  return new Date(ms + offset(ms, zone))
}

function fromFloating(d: Date, zone: string): number {
  const local = d.getTime()
  const guess = local - offset(local, zone)
  return local - offset(guess, zone)
}

type Remindable = {
  startsAt: number
  rrule?: string
  remindMin?: number
}

/**
 * The next reminder strictly after `after`: the occurrence it is for and
 * when it fires. Null when there is no reminder or nothing left to remind.
 * An rrule that does not parse is a single event, as on the calendar.
 */
export function nextReminder(
  event: Remindable,
  after: number,
  zone: string = OWNER_ZONE,
): { startsAt: number; fireAt: number } | null {
  if (event.remindMin === undefined) return null
  const lead = event.remindMin * 60_000
  const single =
    event.startsAt - lead > after
      ? { startsAt: event.startsAt, fireAt: event.startsAt - lead }
      : null
  if (event.rrule === undefined) return single

  let rule: RRule
  try {
    const options = RRule.parseString(event.rrule)
    if (options.freq === undefined) return single
    rule = new RRule({ ...options, dtstart: toFloating(event.startsAt, zone) })
  } catch {
    return single
  }
  let at = toFloating(after + lead, zone)
  /* A few steps at most: the floating guess can land a step short. */
  for (let i = 0; i < 4; i++) {
    const next = rule.after(at, false)
    if (next === null) return null
    const startsAt = fromFloating(next, zone)
    if (startsAt - lead > after) return { startsAt, fireAt: startsAt - lead }
    at = next
  }
  return null
}

/** "Run · 18:00" — the event and its own time. */
export function reminderTitle(
  title: string,
  startsAt: number,
  zone: string = OWNER_ZONE,
): string {
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(startsAt))
  return `${title} · ${clock}`
}

/** "In 10 min · Calendar", "In 1 h · Calendar", "Now · Calendar". */
export function reminderBody(remindMin: number): string {
  if (remindMin === 0) return 'Now · Calendar'
  if (remindMin < 60) return `In ${remindMin} min · Calendar`
  const h = Math.round(remindMin / 60)
  return `In ${h} h · Calendar`
}
