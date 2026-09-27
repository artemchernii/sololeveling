/* Finances F3 (26 Sep): which day a recurring bill falls on in a month.
   Pure, so convex/recurring.ts and the page agree, and it is tested here. */

export type BillWhen = {
  cadence: 'monthly' | 'yearly'
  /** 1–31, or 0 for the last day of the month. */
  day: number
  /** Yearly only: 0–11. */
  month?: number
}

function daysIn(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/**
 * The day of the month (1–31) this bill is due in `year`/`month`, or null
 * when a yearly bill is not due that month. A 31st in a 30-day month falls
 * on the 30th; 0 is always the last day.
 */
export function dueDay(
  when: BillWhen,
  year: number,
  month: number,
): number | null {
  if (when.cadence === 'yearly' && when.month !== month) return null
  const last = daysIn(year, month)
  return when.day === 0 ? last : Math.min(when.day, last)
}

/** "30th", "last day", "1st" — how the due day is said. */
export function dayLabel(day: number): string {
  if (day === 0) return 'last day'
  const tail =
    day % 10 === 1 && day !== 11
      ? 'st'
      : day % 10 === 2 && day !== 12
        ? 'nd'
        : day % 10 === 3 && day !== 13
          ? 'rd'
          : 'th'
  return `${day}${tail}`
}

/** Whether a bill's shape is one the app can put on a day. */
export function billWhenRefusal(when: BillWhen): string | null {
  if (!Number.isInteger(when.day) || when.day < 0 || when.day > 31) {
    return 'A day of the month is 1 to 31, or the last day.'
  }
  if (when.cadence === 'yearly') {
    if (
      when.month === undefined ||
      !Number.isInteger(when.month) ||
      when.month < 0 ||
      when.month > 11
    ) {
      return 'A yearly bill needs its month.'
    }
    if (when.day === 0) return null
    const longest = daysIn(2024, when.month)
    if (when.day > longest) return 'That month does not have that day.'
  }
  return null
}
