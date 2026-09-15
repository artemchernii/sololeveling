/* LEVEL is my age, and the bar beside it is how far through this year of it
   I am (PLAN.md §3 item 1). A calendar fact, not a score: nothing I do moves
   it, and it is the one bar on Today whose denominator is not a goal.

   The birthday is a constant because it is one (decided 15 Sep). */

export type Birthday = { year: number; month: number; day: number }

export const BIRTHDAY = { year: 1993, month: 12, day: 14 } as const

export type YearOfLevel = {
  level: number
  /** Whole days since the last birthday; 0 on the birthday. */
  daysIn: number
  /** 365, or 366 when a 29 February falls inside. */
  daysInYear: number
  /** Whole days until the next birthday; 1 on the day before. */
  daysToNext: number
}

/* A calendar date read as UTC, divided by a day: an exact integer in any
   timezone. Local midnight in milliseconds would move an hour across a clock
   change and give two days one number. */
function dayNumber(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / 86_400_000
}

export function yearOfLevel(
  date: Date,
  birthday: Birthday = BIRTHDAY,
): YearOfLevel {
  const year = date.getFullYear()
  const today = dayNumber(year, date.getMonth() + 1, date.getDate())
  const thisYears = dayNumber(year, birthday.month, birthday.day)
  const since = today >= thisYears ? year : year - 1
  const last = dayNumber(since, birthday.month, birthday.day)
  const next = dayNumber(since + 1, birthday.month, birthday.day)

  return {
    level: since - birthday.year,
    daysIn: today - last,
    daysInYear: next - last,
    daysToNext: next - today,
  }
}
