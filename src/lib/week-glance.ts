import type { TimelineItem } from './timeline'
import { addDays, startOfWeek } from './weeks'

/* THIS WEEK on Today (PLAN.md §3 item 5): the seven days, as local-midnight
   bounds. Stepped by calendar day through weeks.ts, never by 24 hours, so
   the Sunday a clock changes on is 23 hours long and still one day. */

export type GlanceDay = { start: number; end: number }

export function weekDays(date: Date): Array<GlanceDay> {
  const monday = startOfWeek(date)
  return Array.from({ length: 7 }, (_, i) => ({
    start: addDays(monday, i).getTime(),
    end: addDays(monday, i + 1).getTime(),
  }))
}

/** The week's timeline split into its days. An item belongs to the day it
    starts in; the order within a day is the order given. */
export function itemsByDay(
  items: Array<TimelineItem>,
  days: Array<GlanceDay>,
): Array<Array<TimelineItem>> {
  return days.map((day) =>
    items.filter((i) => i.startsAt >= day.start && i.startsAt < day.end),
  )
}
