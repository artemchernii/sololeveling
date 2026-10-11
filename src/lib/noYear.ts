import type { Reading } from './intake'

/* A bank's app prints "12 oct" with no year, and lists a weekend's transfer
   under the Monday it books. Dropped on Sunday 11 Oct 2026, ActivoBank's
   screen was read as October 2025 — this year's 12 Oct had not come yet —
   so seven rows and the balance were filed a year back, matched nothing he
   already had, and the account kept its old balance.

   The reader is told (intakePrompt), and this catches it when it forgets:
   only a screenshot, and only the one signature — moved a year on, its
   newest row would fall in the days just after today. A screen that really
   is a year old ends on a day that has already come round. */

const DAY_MS = 86_400_000
/* How far past today a bank dates its newest row: a weekend, a holiday. */
const AHEAD_DAYS = 7

function yearOn(ms: number): number {
  const d = new Date(ms)
  d.setFullYear(d.getFullYear() + 1)
  return d.getTime()
}

type Dated = Pick<Reading, 'kind' | 'title' | 'transactions' | 'balance'>

export function yearlessToThisYear<T extends Dated>(
  reading: T,
  now: number,
): T {
  if (reading.kind !== 'transactions' || reading.transactions.length === 0)
    return reading
  const newest = Math.max(...reading.transactions.map((t) => t.occurredAt))
  const moved = yearOn(newest)
  const tonight = new Date(now).setHours(23, 59, 59, 999)
  if (moved <= tonight || moved > tonight + AHEAD_DAYS * DAY_MS) return reading
  const was = new Date(newest).getFullYear()
  return {
    ...reading,
    title: reading.title.replaceAll(String(was), String(was + 1)),
    transactions: reading.transactions.map((t) => ({
      ...t,
      occurredAt: yearOn(t.occurredAt),
    })),
    /* Only a balance dated with the rows; one with no day of its own was
       stamped with the moment it was read. */
    balance:
      reading.balance && reading.balance.asOf <= newest
        ? { ...reading.balance, asOf: yearOn(reading.balance.asOf) }
        : reading.balance,
  }
}

/* A bank lists a weekend's transfer under the Monday it books, and its
   balance already has it (11 Oct: a −€25 row dated 12 Oct, read on the
   11th with a balance of €90.35 — the balance was saved as of the 11th,
   the row counted as after it, and the card said €65.35). The money has
   left by the time it is on the screen: a row dated after today is
   today's, and so is the balance printed with it. */
export function notAhead<T extends Dated>(reading: T, now: number): T {
  const today = new Date(now).setHours(12, 0, 0, 0)
  const cap = (at: number) => (at > today + DAY_MS / 2 ? today : at)
  if (reading.transactions.every((t) => cap(t.occurredAt) === t.occurredAt))
    return reading
  return {
    ...reading,
    transactions: reading.transactions.map((t) => ({
      ...t,
      occurredAt: cap(t.occurredAt),
    })),
    balance: reading.balance && {
      ...reading.balance,
      asOf: cap(reading.balance.asOf),
    },
  }
}
