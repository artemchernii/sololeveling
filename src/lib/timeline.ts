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
  source: 'task' | 'event' | 'milestone'
  title: string
  startsAt: number
  durationMin?: number
  area?: Area
  /** R5: the project a block belongs to, so the grid can name it. */
  projectId?: string
  /** What a milestone belongs to — "Goal: Ship Oreum" — for its tooltip. */
  detail?: string
  /** A milestone's goal, so pressing it opens that goal (24 Sep). */
  goalId?: string
}

/** The shape a milestone reaches the timeline in (convex/schema.ts). */
export type DueMilestone = {
  _id: string
  title: string
  dueDate?: string
  dueTime?: string
  area?: Area
  goalId?: string
  goalTitle?: string
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
    projectId: task.projectId,
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
    projectId: event.projectId,
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
/**
 * A milestone's due moment, in the reader's own clock (R3b, 20 Sep).
 *
 * `dueDate` is a local calendar day and `dueTime` an hour on it, so the
 * instant is assembled here rather than stored: the server does not know what
 * time it is where you are (lib/today.ts). A milestone with no day is not due
 * anywhere and returns null — it is a step in a sequence, not a date.
 *
 * It carries no `durationMin`, and that is the point. A due date is not an
 * appointment, and giving it a length would draw it as time you have booked.
 */
export function milestoneToTimelineItem(
  milestone: DueMilestone,
): TimelineItem | null {
  if (milestone.dueDate === undefined) return null

  const [y, m, d] = milestone.dueDate.split('-').map(Number)
  const [hh, mm] = (milestone.dueTime ?? '00:00').split(':').map(Number)
  if ([y, m, d, hh, mm].some((n) => !Number.isFinite(n))) return null

  return {
    id: milestone._id,
    source: 'milestone',
    title: milestone.title,
    startsAt: new Date(y, m - 1, d, hh, mm).getTime(),
    area: milestone.area,
    detail: milestone.goalTitle
      ? `milestone of ${milestone.goalTitle}`
      : undefined,
    goalId: milestone.goalId,
  }
}

export function buildTimeline(
  tasks: Array<Doc<'tasks'>>,
  events: Array<Doc<'events'>>,
  milestones: Array<DueMilestone>,
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

  const fromMilestones = milestones
    .map(milestoneToTimelineItem)
    .filter((i): i is TimelineItem => i !== null)
    .filter((i) => i.startsAt >= window.start && i.startsAt < window.end)

  return [...fromTasks, ...fromEvents, ...fromMilestones].sort(
    (a, b) => a.startsAt - b.startsAt,
  )
}

/** "Three booked hours. The rest is yours." (§3) — or the truth if it isn't three. */
export function bookedHoursLine(items: Array<TimelineItem>): string {
  /* A milestone falling today is not something you booked — it is a date you
     set. A day holding one and nothing else is still a free day, and saying
     otherwise would turn every due date into an appointment. */
  const booked = items.filter((i) => i.source !== 'milestone')
  const minutes = booked.reduce((sum, i) => sum + (i.durationMin ?? 0), 0)
  if (booked.length === 0) return 'Nothing booked. The whole day is yours.'

  const hours = minutes / 60
  const rounded = Number.isInteger(hours) ? String(hours) : hours.toFixed(1)
  if (minutes === 0) return 'Booked, but untimed. The rest of the day is yours.'
  return `${rounded} booked ${hours === 1 ? 'hour' : 'hours'}. The rest is yours.`
}
