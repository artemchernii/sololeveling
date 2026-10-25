import { euros } from './money'
import { OWNER_ZONE, dayStart } from './remindAt'

/* N2 (17 Oct). Money alerts on the iPhone, his "picks, plus C salary in,
   go": A missing for a bill, two days before it; B a bank's approval
   ending, seven days and one day before; C the salary in. One job a
   morning at 09:00 Lisbon reads and decides (convex/moneyAlerts.ts);
   this is its clock and its words — badges and numbers, no sentences. */

const DAY = 86_400_000
const NINE = 9 * 3_600_000

/** A bill two days out rings this morning. */
export const MISSING_DAYS = 2
/** An approval rings these many days before it ends. */
export const APPROVAL_MARKS: ReadonlyArray<number> = [7, 1]
/** The salary account is read from five days before its day to three
    after, until the salary is in. Five, not two (25 Oct): his salary of
    the 25th landed on the 23rd, and a 23rd on a weekend pays on the
    Friday before (22 Jan 2027, 21 May 2027). */
export const SALARY_BEFORE = 5
export const SALARY_AFTER = 3

const HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: OWNER_ZONE,
  hour: 'numeric',
  hourCycle: 'h23',
})

/** 09:00 of the local day that starts at `start`. On a clock-change day
    midnight plus nine hours is 08:00 or 10:00, so read the hour. */
function nineOn(start: number): number {
  const t = start + NINE
  return t + (9 - Number(HOUR.format(t))) * 3_600_000
}

/** The next 09:00 on his wall clock strictly after `now`. */
export function nextMorning(now: number): number {
  const today = nineOn(dayStart(now))
  if (today > now) return today
  /* A day on from local midnight, then its own midnight: a clock change
     moves the 24 hours, never the date. */
  return nineOn(dayStart(dayStart(now) + DAY + 2 * 3_600_000))
}

/** Whole local days from `today` (a local midnight) to `t`'s day. */
export function daysTo(t: number, today: number): number {
  return Math.round((dayStart(t) - today) / DAY)
}

const DAY_MONTH = new Intl.DateTimeFormat('en-GB', {
  timeZone: OWNER_ZONE,
  day: 'numeric',
  month: 'short',
})
/** 29 Oct */
export function dayMonth(t: number): string {
  return DAY_MONTH.format(t)
}

export type Words = { title: string; body: string }

/** A: `Preply · €123.72 · 29 Oct` / `ActivoBank €78.39 · €45.33 missing` */
export function missingWords(e: {
  name: string
  amount: number
  t: number
  account: string
  held: number
  missing: number
}): Words {
  return {
    title: `${e.name} · ${euros(e.amount)} · ${dayMonth(e.t)}`,
    body: `${e.account} ${euros(e.held)} · ${euros(e.missing)} missing`,
  }
}

/** B: `ActivoBank · approval until 24 Oct` / `7 days · APPROVE` */
export function approvalWords(
  account: string,
  validUntil: number,
  days: number,
): Words {
  return {
    title: `${account} · approval until ${dayMonth(validUntil)}`,
    body: `${days} ${days === 1 ? 'day' : 'days'} · APPROVE`,
  }
}

/** C: `Salary in · €2,809.40` / `BPI · 25 Oct` */
export function salaryWords(account: string, amount: number, t: number): Words {
  return {
    title: `Salary in · ${euros(amount)}`,
    body: `${account} · ${dayMonth(t)}`,
  }
}
