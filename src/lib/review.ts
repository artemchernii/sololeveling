/* The week, counted (15 Oct, Review on what the app gets on its own —
   mockup design/review-mockup/real.html). Artem: "we dont anticipate that i
   will constantly log everything, so i dont want to end up with all 0
   screen". So the numbers here are the ones that arrive by themselves:
   bank rows, commits, and the hand logs as a bonus beside four weeks of
   them. Counts and sums of stored rows only (CLAUDE.md, source 1); the one
   difference is the week's change, allowed on Review on 15 Oct. */

import { isEuroAmount, isLent } from './money'

/** The last midnight at or before `at`, as an index into `starts`; -1 when
    it is before the first or at/after `end`. */
export function dayIndex(
  starts: ReadonlyArray<number>,
  end: number,
  at: number,
): number {
  if (at >= end) return -1
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    if (at >= starts[i]) return i
  }
  return -1
}

export type MoneyRow = {
  _id: string
  kind: string
  occurredAt: number
  value?: number
  unit?: string
  text?: string
  meta?: {
    category?: string
    recurringId?: string
    payee?: string
    merchant?: string
  }
}

export type Spent = {
  /** Expense rows in euros, bills left out. */
  spent: number
  /** The bills in the same days: rows paid against a recurring bill. */
  bills: number
  /** `spent` per day, Monday first. */
  byDay: Array<number>
  /** Rows behind `spent`. */
  count: number
  /** The three biggest rows behind `spent`, biggest first. */
  biggest: Array<{
    _id: string
    name: string
    category: string | null
    amount: number
    occurredAt: number
  }>
}

/** What one week spent, from its money rows. `starts` are the week's seven
    local midnights (a row outside them is not counted); "spent compare not
    days but weeks and exclude reoccuring bills" (15 Oct). Added in cents. */
export function spentWeek<T extends MoneyRow>(
  rows: ReadonlyArray<T>,
  starts: ReadonlyArray<number>,
  end: number,
): Spent {
  const days = starts.map(() => 0)
  let bills = 0
  const counted: Array<T & { value: number }> = []
  for (const row of rows) {
    if (row.kind !== 'expense' || !isEuroAmount(row) || isLent(row)) continue
    const i = dayIndex(starts, end, row.occurredAt)
    if (i === -1) continue
    const c = Math.round(row.value * 100)
    if (row.meta?.recurringId !== undefined) {
      bills += c
      continue
    }
    days[i] += c
    counted.push(row)
  }
  const biggest = [...counted]
    .sort((a, b) => b.value - a.value || b.occurredAt - a.occurredAt)
    .slice(0, 3)
    .map((r) => ({
      _id: r._id,
      name: r.meta?.payee ?? r.meta?.merchant ?? r.text ?? '',
      category: r.meta?.category ?? null,
      amount: r.value,
      occurredAt: r.occurredAt,
    }))
  return {
    spent: days.reduce((a, b) => a + b, 0) / 100,
    bills: bills / 100,
    byDay: days.map((c) => c / 100),
    count: counted.length,
    biggest,
  }
}

export type CommitRow = {
  repo: string
  message: string
  authoredAt: number
  isMerge?: boolean
}

export type ProjectCommits = {
  thisWeek: number
  lastWeek: number
  /** This week's commits per day, Monday first. */
  days: Array<number>
  /** This week's two newest messages, newest first. */
  messages: Array<string>
}

/** One project's commits over two weeks. Only its own repo's rows, and no
    merges — "a merge is bookkeeping, not work" (20 Sep), as on Projects. */
export function projectWeek(
  rows: ReadonlyArray<CommitRow>,
  repo: string | undefined,
  lastWeekStart: number,
  starts: ReadonlyArray<number>,
  end: number,
): ProjectCommits {
  const days = starts.map(() => 0)
  let lastWeek = 0
  const mine = rows.filter(
    (r) => repo !== undefined && r.repo === repo && r.isMerge !== true,
  )
  const inWeek: Array<CommitRow> = []
  for (const row of mine) {
    if (row.authoredAt >= lastWeekStart && row.authoredAt < starts[0])
      lastWeek += 1
    const i = dayIndex(starts, end, row.authoredAt)
    if (i === -1) continue
    days[i] += 1
    inWeek.push(row)
  }
  return {
    thisWeek: inWeek.length,
    lastWeek,
    days,
    messages: inWeek
      .sort((a, b) => b.authoredAt - a.authoredAt)
      .slice(0, 2)
      .map((r) => r.message),
  }
}

/** Rows in [start, end) that pass `keep`. */
export function countIn<T extends { occurredAt: number }>(
  rows: ReadonlyArray<T>,
  start: number,
  end: number,
  keep: (row: T) => boolean,
): number {
  return rows.filter(
    (r) => r.occurredAt >= start && r.occurredAt < end && keep(r),
  ).length
}

export type Change = {
  /** Always positive; the direction says which way. */
  amount: number
  dir: 'up' | 'down' | 'same'
  /** null when nothing moved. */
  good: boolean | null
}

/** This week minus last week, for a chip beside both numbers (allowed on
    Review, 15 Oct): green where the move is good — less spent, more worth
    — and red where it is not. Nothing stored. */
export function weekChange(
  now: number,
  was: number,
  goodWhenUp: boolean,
): Change {
  const cents = Math.round(now * 100) - Math.round(was * 100)
  if (cents === 0) return { amount: 0, dir: 'same', good: null }
  const up = cents > 0
  return {
    amount: Math.abs(cents) / 100,
    dir: up ? 'up' : 'down',
    good: up === goodWhenUp,
  }
}
