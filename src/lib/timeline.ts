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

export function eventToTimelineItem(event: Doc<'events'>): TimelineItem {
  return {
    id: event._id,
    source: 'event',
    title: event.title,
    startsAt: event.startsAt,
    /* Events carry an end; tasks carry a length. The timeline speaks in
       lengths, so this is where the two vocabularies meet. */
    durationMin: Math.round((event.endsAt - event.startsAt) / 60_000),
    area: event.area,
  }
}

export function buildTimeline(
  tasks: Array<Doc<'tasks'>>,
  events: Array<Doc<'events'>>,
): Array<TimelineItem> {
  const items = [
    ...tasks
      .map(taskToTimelineItem)
      .filter((i): i is TimelineItem => i !== null),
    ...events.map(eventToTimelineItem),
  ]
  return items.sort((a, b) => a.startsAt - b.startsAt)
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
