import { expandEvents } from './recurrence'
import type { Occurrence } from './recurrence'
import type { Doc } from '../../convex/_generated/dataModel'
import type { Area } from './capture-parser'

/* PLAN.md §3b.3. Tasks and events are two tables and stay that way; they meet
   only here, in the UI, through this mapper. Calendar (Phase 5) reuses it.
 
   The rule this enforces is structural: nothing downstream of a TimelineItem
   can tell a task from an event except by reading `source`, so no component can
   quietly start treating one as the other. */

export type TimelineItem = {
  id: string
  source: 'task' | 'event'
  title: string
  startsAt: number
  durationMin?: number
  area?: Area
}

export function taskToTimelineItem(task: Doc<'tasks'>): TimelineItem | null {
  /* A task with no time is not on the timeline. It is a quest, and it appears
     in the checklist below — being undated is the normal case, not an error. */
  if (task.scheduledAt === undefined) return null

  return {
    id: task._id,
    source: 'task',
    title: task.title,
    startsAt: task.scheduledAt,
    durationMin: task.durationMin,
    area: task.area,
  }
}

export function occurrenceToTimelineItem(
  event: Doc<'events'>,
  occurrence: Occurrence,
): TimelineItem {
  return {
    /* The occurrence's id, not the event's: one weekly series is many items,
       and two of them in the same week must not collide (§3b.6). */
    id: occurrence.id,
    source: 'event',
    title: event.title,
    startsAt: occurrence.startsAt,
    /* Events carry an end; tasks carry a length. The timeline speaks in
       lengths, so this is where the two vocabularies meet. */
    durationMin: Math.round((occurrence.endsAt - occurrence.startsAt) / 60_000),
    area: event.area,
  }
}

/**
 * Everything that happens in `[window.start, window.end)`, in the order it
 * happens.
 *
 * The window is required, not optional. A recurring event is one row that
 * means nothing until a period is named — and an optional window would leave
 * two ways to build a timeline, one of which quietly drops every repeat after
 * the first. That is the drift §3b.3 exists to prevent.
 */
export function buildTimeline(
  tasks: Array<Doc<'tasks'>>,
  events: Array<Doc<'events'>>,
  window: { start: number; end: number },
): Array<TimelineItem> {
  const byId = new Map(events.map((e) => [e._id, e]))

  const fromEvents = expandEvents(events, window.start, window.end).flatMap(
    (occurrence) => {
      const event = byId.get(occurrence.eventId)
      return event ? [occurrenceToTimelineItem(event, occurrence)] : []
    },
  )

  const fromTasks = tasks
    .map(taskToTimelineItem)
    .filter((i): i is TimelineItem => i !== null)
    .filter((i) => i.startsAt >= window.start && i.startsAt < window.end)

  return [...fromTasks, ...fromEvents].sort((a, b) => a.startsAt - b.startsAt)
}

/** "Three booked hours. The rest is yours." (§3) — or the truth if it isn't three. */
export function bookedHoursLine(items: Array<TimelineItem>): string {
  const minutes = items.reduce((sum, i) => sum + (i.durationMin ?? 0), 0)
  if (items.length === 0) return 'Nothing booked. The whole day is yours.'

  const hours = minutes / 60
  const rounded = Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
  if (minutes === 0) return 'Booked, but untimed. The rest of the day is yours.'
  return `${rounded} booked ${hours === 1 ? 'hour' : 'hours'}. The rest is yours.`
}
