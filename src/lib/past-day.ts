/* Logging a day that has gone (26 Sep, Artem: "holy shit I realized that
   we can't log past events in body and languages"). The tapped day in
   History gets the same buttons as Today; the time is his to set, and
   defaults to noon — a class last Thursday happened on Thursday, and noon
   keeps it inside that day whatever the clock says now. */

export const DEFAULT_TIME = '12:00'

/**
 * The instant for `hh:mm` on the local day starting at `dayStart`, or null
 * for a time that does not parse. Built from the date's parts, not by
 * adding hours to midnight, so a day with a clock change still lands on
 * the time written.
 */
export function atTime(dayStart: number, time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (m === null) return null
  const hours = Number(m[1])
  const minutes = Number(m[2])
  if (hours > 23 || minutes > 59) return null
  const d = new Date(dayStart)
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    hours,
    minutes,
  ).getTime()
}
