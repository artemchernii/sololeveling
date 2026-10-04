/* Finances F3 (26 Sep): which day a recurring bill falls on in a month.
   Pure, so convex/recurring.ts and the page agree, and it is tested here. */

export type BillWhen = {
  cadence: 'monthly' | 'yearly'
  /** 1–31, or 0 for the last day of the month. */
  day: number
  /** Yearly only: 0–11. */
  month?: number
  /* Rhythms (4 Oct: "condominio 35 euros" — €175 paid for 5 months; the
     gym every two weeks). Both count from `anchor`, a day it was paid. */
  /** Monthly only: paid every N months (2–12). */
  everyMonths?: number
  /** Paid every N weeks (1–4), on the anchor's weekday rhythm. */
  everyWeeks?: number
  /** Epoch ms of a payment the rhythm counts from. */
  anchor?: number
}

const DAY_MS = 86_400_000
const mod = (a: number, n: number) => ((a % n) + n) % n
const monthIndex = (t: number) => {
  const d = new Date(t)
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
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
  /* Every few weeks is not one day of the month: dueOn says which. */
  if (when.everyWeeks) return null
  if (
    when.cadence === 'monthly' &&
    when.everyMonths &&
    when.everyMonths > 1 &&
    when.anchor !== undefined &&
    mod(year * 12 + month - monthIndex(when.anchor), when.everyMonths) !== 0
  ) {
    return null
  }
  const last = daysIn(year, month)
  return when.day === 0 ? last : Math.min(when.day, last)
}

/** Whether a bill is due on this calendar date (month 0–11). */
export function dueOn(
  when: BillWhen,
  year: number,
  month: number,
  day: number,
): boolean {
  if (when.everyWeeks) {
    if (when.anchor === undefined) return false
    const at = Math.floor(Date.UTC(year, month, day, 12) / DAY_MS)
    const from = Math.floor(when.anchor / DAY_MS)
    return mod(at - from, 7 * when.everyWeeks) === 0
  }
  return dueDay(when, year, month) === day
}

/** What a bill costs in a usual month: one every few months spread over
    them, one every few weeks as its payments in a year over twelve. A
    planned figure for "bills each month", never a sum of rows. */
export function monthlyShare(when: BillWhen & { amount: number }): number {
  if (when.cadence === 'yearly') return 0
  if (when.everyWeeks) {
    return Math.round((when.amount * 52 * 100) / (12 * when.everyWeeks)) / 100
  }
  if (when.everyMonths && when.everyMonths > 1) {
    return Math.round((when.amount * 100) / when.everyMonths) / 100
  }
  return when.amount
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
