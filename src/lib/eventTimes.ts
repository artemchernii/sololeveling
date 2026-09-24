/* R5. The event dialog speaks start–end, the row stores two instants. These
   are the two conversions between an `HH:MM` end field and an instant. */

const pad = (n: number) => String(n).padStart(2, '0')

/** `09:15` — what a time input speaks, in local time. */
export function toTimeInput(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * The instant an event ends, given its start and an `HH:MM` end.
 *
 * The end is on the start's day, unless it is earlier than the start — then it
 * is the next day: 23:00 to 01:00 is a late night, not a backwards event.
 * An end equal to the start is a zero-length marker, which is allowed.
 */
export function endFromTime(startsAt: number, time: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) return null
  const [h, m] = [Number(match[1]), Number(match[2])]
  if (h > 23 || m > 59) return null

  const end = new Date(startsAt)
  end.setHours(h, m, 0, 0)
  if (end.getTime() < startsAt) end.setDate(end.getDate() + 1)
  return end.getTime()
}
