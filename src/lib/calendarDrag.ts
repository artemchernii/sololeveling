/* R5. What a drag on the week grid means, as plain arithmetic — the grid
   feeds it pixels and gets back a time, so everything worth testing is here
   and the component only moves a finger around.

   Times land on a 15-minute grid, measured from midnight rather than from the
   item's old start: an event at 8:07 dragged down lands on 8:15 or 8:30, not
   on 8:22. "Any duration" is any multiple of fifteen. */

export const SNAP_MIN = 15
export const MIN_DURATION = 15
/** What the grid draws a block with no length as (WeekGrid `placement`). */
export const UNTIMED_DURATION = 30

const DAY_MIN = 24 * 60

export type DragMode = 'move' | 'resize'

export function snap(minutes: number, step = SNAP_MIN): number {
  return Math.round(minutes / step) * step
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi)
}

/**
 * Where a block ends up after being dragged `dyPx` down (negative is up) and
 * `dxDays` columns right (negative is left).
 *
 * Move keeps the length and snaps the start; resize keeps the start and snaps
 * the length. Neither crosses midnight: the grid draws one day per column, and
 * a block that ran off the bottom of its column would be drawn wrong.
 */
export function dragResult(input: {
  mode: DragMode
  startsAt: number
  durationMin: number | undefined
  dxDays: number
  dyPx: number
  rowHeight: number
}): { startsAt: number; durationMin: number } {
  const duration = input.durationMin ?? UNTIMED_DURATION
  const dyMin = (input.dyPx / input.rowHeight) * 60
  const start = new Date(input.startsAt)
  const startMin = start.getHours() * 60 + start.getMinutes()

  if (input.mode === 'resize') {
    return {
      startsAt: input.startsAt,
      durationMin: clamp(
        snap(duration + dyMin),
        MIN_DURATION,
        Math.max(MIN_DURATION, DAY_MIN - startMin),
      ),
    }
  }

  /* Days are added on the calendar, not as 24h of milliseconds, so a drag
     across a clock change still lands on the hour it was dropped on. */
  const day = new Date(start)
  day.setDate(day.getDate() + input.dxDays)
  const minute = clamp(
    snap(startMin + dyMin),
    0,
    Math.max(0, DAY_MIN - Math.min(duration, DAY_MIN)),
  )
  day.setHours(0, minute, 0, 0)
  return { startsAt: day.getTime(), durationMin: duration }
}

/**
 * A recurring event is one row, so dragging one of its occurrences moves the
 * series (§3b.6): the row's start shifts by however far the occurrence moved.
 */
export function shiftSeries(
  seriesStartsAt: number,
  occurrenceStartsAt: number,
  droppedAt: number,
): number {
  return seriesStartsAt + (droppedAt - occurrenceStartsAt)
}

/** "every Tuesday", "every day", "every weekday" — what an Undo line says moved. */
export function seriesPhrase(rrule: string, startsAt: number): string {
  if (rrule.includes('FREQ=DAILY')) return 'every day'
  if (rrule.includes('BYDAY=MO,TU,WE,TH,FR')) return 'every weekday'
  if (rrule.includes('FREQ=WEEKLY')) {
    const weekday = new Date(startsAt).toLocaleDateString('en-GB', {
      weekday: 'long',
    })
    return `every ${weekday}`
  }
  return 'the whole series'
}
