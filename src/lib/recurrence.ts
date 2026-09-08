import { RRule } from 'rrule'

import type { Doc, Id } from '../../convex/_generated/dataModel'

/* PLAN.md §2: recurring instances are expanded on the client, so an occurrence
   is computed and never stored. §3b.6: it still carries a stable id, because
   the alternative is components that address occurrences by array position —
   and that is what would make per-instance exceptions expensive to add later. */

export type Occurrence = {
  /** `${eventId}:${startsAt}` — stable across windows, unique across series. */
  id: string
  eventId: Id<'events'>
  startsAt: number
  endsAt: number
}

export function occurrenceId(
  occurrence: Pick<Occurrence, 'eventId' | 'startsAt'>,
): string {
  return `${occurrence.eventId}:${occurrence.startsAt}`
}

/**
 * The inverse of `occurrenceId`. A TimelineItem deliberately cannot say whether
 * it is a task or an event beyond its `source` (§3b.3), so a caller holding one
 * needs this to get back to the row it came from.
 *
 * Splits on the last colon, not the first: the id format is the event id and
 * then an instant, and this stays correct if an id ever contains one.
 */
export function parseOccurrenceId(
  id: string,
): { eventId: Id<'events'>; startsAt: number } | null {
  const cut = id.lastIndexOf(':')
  if (cut <= 0) return null

  const startsAt = Number(id.slice(cut + 1))
  if (!Number.isFinite(startsAt)) return null

  return { eventId: id.slice(0, cut) as Id<'events'>, startsAt }
}

/* rrule reasons in UTC. Expanding a weekly 09:00 session that way preserves the
   instant rather than the wall clock, so the morning Lisbon springs forward the
   session slides to 10:00 and stays there — measured, not guessed: a naive
   expansion across 29 March 2026 gives 9, 10, 10. The wall clock is what a
   person keeps.

   So the rule runs in "floating" time: local fields are copied into a Date's
   UTC fields, the rule is expanded there, and each result is read back as
   local. The offset is re-derived per occurrence, which is exactly what makes
   09:00 stay 09:00 on both sides of a transition. */
function toFloating(ms: number): Date {
  const d = new Date(ms)
  return new Date(
    Date.UTC(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
    ),
  )
}

function fromFloating(d: Date): number {
  return new Date(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
  ).getTime()
}

function toOccurrence(event: Doc<'events'>, startsAt: number): Occurrence {
  const eventId = event._id
  return {
    id: occurrenceId({ eventId, startsAt }),
    eventId,
    /* The series carries a length, not an end. Reading the length from the
       original and re-adding it is what keeps an hour an hour when the offset
       under it changes. */
    startsAt,
    endsAt: startsAt + (event.endsAt - event.startsAt),
  }
}

/**
 * Every occurrence of `event` starting within `[windowStart, windowEnd)`.
 *
 * A non-recurring event is a series of one. An rrule that cannot be parsed is
 * treated the same way: a calendar that renders one event in the wrong place
 * is recoverable, a calendar that throws is not.
 */
export function expandEvent(
  event: Doc<'events'>,
  windowStart: number,
  windowEnd: number,
): Array<Occurrence> {
  const inWindow = (ms: number) => ms >= windowStart && ms < windowEnd

  if (event.rrule === undefined) {
    return inWindow(event.startsAt) ? [toOccurrence(event, event.startsAt)] : []
  }

  let rule: RRule
  try {
    const options = RRule.parseString(event.rrule)
    /* parseString is lenient — it answers `{}` for a string with nothing it
       recognises rather than refusing it. Without a freq there is no series. */
    if (options.freq === undefined) throw new Error('rrule has no FREQ')
    rule = new RRule({ ...options, dtstart: toFloating(event.startsAt) })
  } catch {
    return inWindow(event.startsAt) ? [toOccurrence(event, event.startsAt)] : []
  }

  return rule
    .between(toFloating(windowStart), toFloating(windowEnd), true)
    .map(fromFloating)
    .filter(inWindow)
    .map((startsAt) => toOccurrence(event, startsAt))
}

/** Every occurrence of every event in the window, in the order they happen. */
export function expandEvents(
  events: Array<Doc<'events'>>,
  windowStart: number,
  windowEnd: number,
): Array<Occurrence> {
  return events
    .flatMap((event) => expandEvent(event, windowStart, windowEnd))
    .sort((a, b) => a.startsAt - b.startsAt || a.id.localeCompare(b.id))
}
