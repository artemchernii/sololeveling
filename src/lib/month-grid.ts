import { addDays, startOfWeek } from './weeks'

/* One month as a calendar page, Monday first (26 Sep): Body's hero, after
   twelve weeks of squares were "not clear". Local midnights throughout,
   stepped by calendar day as day-strip.ts does, so a clock change cannot
   shift a date. No React, no Convex. */

export type YearMonth = { year: number; month: number }

export function monthOf(date: Date = new Date()): YearMonth {
  return { year: date.getFullYear(), month: date.getMonth() }
}

export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const d = new Date(ym.year, ym.month + delta, 1)
  return monthOf(d)
}

/** Earlier than, the same as, or later than — for "no ›" past this month. */
export function compareMonths(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month)
}

/** Every day of the month, as local midnights. */
export function monthDays({ year, month }: YearMonth): Array<number> {
  const days: Array<number> = []
  for (let d = new Date(year, month, 1); d.getMonth() === month;) {
    days.push(d.getTime())
    d = addDays(d, 1)
  }
  return days
}

/** The page: whole weeks Monday to Sunday, `null` where a day belongs to
    the month before or after. */
export function monthWeeks(ym: YearMonth): Array<Array<number | null>> {
  const days = monthDays(ym)
  const inMonth = new Set(days)
  const last = days[days.length - 1]
  const weeks: Array<Array<number | null>> = []
  for (
    let start = startOfWeek(new Date(days[0]));
    start.getTime() <= last;
    start = addDays(start, 7)
  ) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = addDays(start, i).getTime()
        return inMonth.has(day) ? day : null
      }),
    )
  }
  return weeks
}
