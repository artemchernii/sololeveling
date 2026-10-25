import { isShake, isWorkout } from './review'
import type { CommitRow, LogRow } from './review'

/* Today's THIS MONTH (17 Oct): five of his six, counted per local day of
   this month, with the month before's same days beside it. Worth, the
   sixth, is a stored reading (worthHistory), not a count. */
export const SIX = ['langs', 'workout', 'shake', 'post', 'commits'] as const
export type Six = (typeof SIX)[number]
export type SixCount = {
  days: Array<number>
  prev: number
  /** LANGS only: this month's sessions per language area (25 Oct). */
  byArea?: Record<string, number>
}

/** `dayStarts`: this month's local midnights, ascending; `prevStart` the
    month before's first; `end` the next month's first; `prevCut` where the
    month before stops counting (25 Oct: its same days, see sameDays). */
export function monthSix(
  logs: ReadonlyArray<LogRow>,
  commits: ReadonlyArray<CommitRow>,
  languages: ReadonlyArray<string>,
  prevStart: number,
  dayStarts: ReadonlyArray<number>,
  end: number,
  prevCut: number = dayStarts[0],
): Record<Six, SixCount> {
  const out = Object.fromEntries(
    SIX.map((k) => [k, { days: dayStarts.map(() => 0), prev: 0 }]),
  ) as Record<Six, SixCount>
  const add = (k: Six, at: number) => {
    if (at < prevStart || at >= end) return
    if (at < dayStarts[0]) {
      if (at < prevCut) out[k].prev += 1
      return
    }
    for (let i = dayStarts.length - 1; i >= 0; i--)
      if (at >= dayStarts[i]) {
        out[k].days[i] += 1
        return
      }
  }
  for (const l of logs) {
    if (l.kind === 'session' && languages.includes(l.area)) {
      add('langs', l.occurredAt)
      if (l.occurredAt >= dayStarts[0] && l.occurredAt < end) {
        const by = (out.langs.byArea ??= {})
        by[l.area] = (by[l.area] ?? 0) + 1
      }
    }
    if (isWorkout(l)) add('workout', l.occurredAt)
    if (isShake(l)) add('shake', l.occurredAt)
    if (l.kind === 'post') add('post', l.occurredAt)
  }
  /* No merges — "a merge is bookkeeping, not work" (20 Sep), as Review. */
  for (const c of commits) if (c.isMerge !== true) add('commits', c.authoredAt)
  return out
}

/** The month before over today's days (25 Oct, his "same days"): on 25
    Oct, 1–25 Sep; on 31 Oct, all 30 of September. `prevCut` is the
    midnight after its last day. */
export function sameDays(now: Date) {
  const y = now.getFullYear()
  const m = now.getMonth()
  const last = Math.min(now.getDate(), new Date(y, m, 0).getDate())
  const mon = new Date(y, m - 1, 1)
    .toLocaleDateString('en-GB', { month: 'short' })
    .slice(0, 3)
    .toUpperCase()
  return {
    prevCut: new Date(y, m - 1, last + 1).getTime(),
    span: last === 1 ? `1 ${mon}` : `1–${last} ${mon}`,
  }
}

/** Today's WORTH (20 Oct): worth now minus the month before's last day,
    less the lines first read after it — a balance added is not money in.
    `total` starts at that day's end. */
export function monthWorth(
  total: ReadonlyArray<number | null>,
  starts: ReadonlyArray<{ at: number; value: number }>,
  wasEnd: number,
) {
  const was = total[0] ?? null
  const now = total.filter((v): v is number => v !== null).at(-1) ?? null
  const missing =
    Math.round(
      starts.filter((s) => s.at > wasEnd).reduce((a, s) => a + s.value, 0) *
        100,
    ) / 100
  const delta =
    now !== null && was !== null
      ? Math.round((now - was - missing) * 100) / 100
      : 0
  return { was, now, missing, delta }
}
