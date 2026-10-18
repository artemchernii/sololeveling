import type { CommitRow, LogRow } from './review'
import { isShake, isWorkout } from './review'

/* Today's THIS WEEK (18 Oct, mockup design/today-mockup/week.html): what
   happened in each of the week's days, by band of the day. A block is one
   logged row; a cell's commits are one block with their count. */

export const BANDS = [
  { name: 'MORNING', short: 'MOR', startHour: 6, endHour: 12 },
  { name: 'AFTERNOON', short: 'AFT', startHour: 12, endHour: 18 },
  { name: 'EVENING', short: 'EVE', startHour: 18, endHour: 24 },
] as const

export type WeekKind = 'workout' | 'langs' | 'shake' | 'post' | 'commits'
export const WEEK_KINDS: ReadonlyArray<WeekKind> = [
  'workout',
  'langs',
  'shake',
  'post',
  'commits',
]

export type WeekRow = {
  /** Absent on a commit: GitHub's, not his to move. */
  id?: string
  kind: WeekKind
  area: string
  at: number
  value?: number
  unit?: string
  text?: string
  movedFrom?: number
}

type WeekLog = LogRow & { _id: string; text?: string }

/** The rows of the six that happened in the week, oldest first. */
export function weekRows(
  logs: ReadonlyArray<WeekLog>,
  commits: ReadonlyArray<CommitRow>,
  languages: ReadonlyArray<string>,
  from: number,
  to: number,
): Array<WeekRow> {
  const out: Array<WeekRow> = []
  for (const l of logs) {
    if (l.occurredAt < from || l.occurredAt >= to) continue
    const kind: WeekKind | null =
      l.kind === 'session' && languages.includes(l.area)
        ? 'langs'
        : isWorkout(l)
          ? 'workout'
          : isShake(l)
            ? 'shake'
            : l.kind === 'post'
              ? 'post'
              : null
    if (kind === null) continue
    out.push({
      id: l._id,
      kind,
      area: l.area,
      at: l.occurredAt,
      ...(l.value !== undefined ? { value: l.value } : {}),
      ...(l.unit !== undefined ? { unit: l.unit } : {}),
      ...(l.text !== undefined ? { text: l.text } : {}),
      ...(l.meta?.movedFrom !== undefined
        ? { movedFrom: l.meta.movedFrom }
        : {}),
    })
  }
  /* No merges — bookkeeping, not work (20 Sep), as THIS MONTH. */
  for (const c of commits)
    if (c.isMerge !== true && c.authoredAt >= from && c.authoredAt < to)
      out.push({ kind: 'commits', area: 'projects', at: c.authoredAt })
  return out.sort((a, b) => a.at - b.at)
}

/** Which band an hour of the day (11.5 = 11:30) is in. Before 06:00 is
    still the morning's. */
export function bandOf(hour: number): 0 | 1 | 2 {
  return hour < 12 ? 0 : hour < 18 ? 1 : 2
}

const hourOf = (ms: number) => {
  const d = new Date(ms)
  return d.getHours() + d.getMinutes() / 60
}

export type Block = WeekRow & { count: number }

/** 3 bands × 7 days. A cell's commits fold into one block with the count. */
export function weekCells(
  rows: ReadonlyArray<WeekRow>,
  dayStarts: ReadonlyArray<number>,
): Array<Array<Array<Block>>> {
  const cells: Array<Array<Array<Block>>> = BANDS.map(() =>
    dayStarts.map(() => []),
  )
  for (const r of rows) {
    let day = -1
    for (let i = dayStarts.length - 1; i >= 0; i--)
      if (r.at >= dayStarts[i]) {
        day = i
        break
      }
    if (day === -1) continue
    const cell = cells[bandOf(hourOf(r.at))][day]
    const folded =
      r.kind === 'commits' && cell.find((b) => b.kind === 'commits')
    if (folded) folded.count += 1
    else cell.push({ ...r, count: 1 })
  }
  return cells
}

export const KIND_NAME: Record<WeekKind, string> = {
  workout: 'WORKOUT',
  langs: 'SESSION',
  shake: 'SHAKE',
  post: 'POST',
  commits: 'COMMITS',
}

/** The hover card's second line: `60 MIN · LEGS`, `1 SHAKE`, `4 COMMITS`. */
export function detail(b: Block): string {
  if (b.kind === 'commits') return `${b.count} COMMITS`
  if (b.kind === 'shake') return '1 SHAKE'
  if (b.kind === 'post')
    return b.text ? `1 POST · ${b.text.toUpperCase()}` : '1 POST'
  const mins = b.value !== undefined ? `${b.value} MIN` : null
  return (
    [mins, b.text?.toUpperCase()].filter(Boolean).join(' · ') ||
    KIND_NAME[b.kind]
  )
}

/** Where a block dropped on (day, band) lands: its own clock time when the
    band is the one it is in, else the band's start. */
export function dropAt(at: number, dayStart: number, band: 0 | 1 | 2): number {
  const h = hourOf(at)
  const d = new Date(dayStart)
  if (bandOf(h) === band) d.setHours(Math.floor(h), Math.round((h % 1) * 60))
  else d.setHours(BANDS[band].startHour, 0)
  return d.getTime()
}

/** An empty cell is pressed: now in the current cell, else the band's start. */
export function pressAt(
  now: number,
  dayStart: number,
  band: 0 | 1 | 2,
): number {
  const start = new Date(dayStart)
  start.setHours(BANDS[band].startHour, 0)
  const end = new Date(dayStart)
  end.setHours(BANDS[band].endHour, 0)
  return now >= start.getTime() && now < end.getTime() ? now : start.getTime()
}

/** A cell that has not started refuses presses and drops: nothing has
    happened in the future (logs.create, setTime). */
export function isFuture(now: number, dayStart: number, band: 0 | 1 | 2) {
  const d = new Date(dayStart)
  d.setHours(BANDS[band].startHour, 0)
  return d.getTime() > now
}
