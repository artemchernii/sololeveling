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
  message?: string
  authoredAt: number
  isMerge?: boolean
}

export type ProjectCommits = {
  thisWeek: number
  lastWeek: number
  /** This week's commits per day, Monday first. */
  days: Array<number>
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
  for (const row of mine) {
    if (row.authoredAt >= lastWeekStart && row.authoredAt < starts[0])
      lastWeek += 1
    const i = dayIndex(starts, end, row.authoredAt)
    if (i !== -1) days[i] += 1
  }
  return { thisWeek: days.reduce((a, b) => a + b, 0), lastWeek, days }
}

export type LogRow = {
  kind: string
  area: string
  occurredAt: number
  value?: number
  unit?: string
  meta?: { category?: string; movedFrom?: number }
}

/** A workout: any kind of training logged under Body. */
export const isWorkout = (r: LogRow) =>
  r.area === 'body' && r.kind === 'workout'
/** A shake: protein and creatine, one tick (`supp`, 21 Sep). */
export const isShake = (r: LogRow) =>
  r.area === 'body' && r.kind === 'intake' && r.meta?.category === 'supplements'

export type DayMarks = {
  /** Money in, euros, lent money left out. */
  in: number
  /** The kinds trained that day, in the order first logged. */
  workouts: Array<string>
  shakes: number
  /** Language areas with a session that day. */
  languages: Array<string>
}

/** What each day of the week carried besides commits and money out — the
    badges on the week bar's day cards (15 Oct, mockup real2.html). */
export function dayMarks(
  rows: ReadonlyArray<LogRow>,
  starts: ReadonlyArray<number>,
  end: number,
  languageSlugs: ReadonlyArray<string>,
): Array<DayMarks> {
  const cents = starts.map(() => 0)
  const days: Array<DayMarks> = starts.map(() => ({
    in: 0,
    workouts: [],
    shakes: 0,
    languages: [],
  }))
  const langs = new Set(languageSlugs)
  for (const row of [...rows].sort((a, b) => a.occurredAt - b.occurredAt)) {
    const i = dayIndex(starts, end, row.occurredAt)
    if (i === -1) continue
    const day = days[i]
    if (row.kind === 'income' && isEuroAmount(row) && !isLent(row))
      cents[i] += Math.round(row.value * 100)
    if (isWorkout(row)) {
      const kind = row.meta?.category ?? 'workout'
      if (!day.workouts.includes(kind)) day.workouts.push(kind)
    }
    if (isShake(row)) day.shakes += 1
    if (
      row.kind === 'session' &&
      langs.has(row.area) &&
      !day.languages.includes(row.area)
    )
      day.languages.push(row.area)
  }
  return days.map((d, i) => ({ ...d, in: cents[i] / 100 }))
}

/** Workouts per kind in [start, end), most first. */
export function kindCounts(
  rows: ReadonlyArray<LogRow>,
  start: number,
  end: number,
): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (row.occurredAt < start || row.occurredAt >= end || !isWorkout(row))
      continue
    const kind = row.meta?.category ?? 'workout'
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  return [...counts]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
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
