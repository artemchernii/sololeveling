import type { CSSProperties } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { Caps, CountUp, Stat } from '@/components/review/parts'
import { addDays } from '@/lib/weeks'

type Week = FunctionReturnType<typeof api.aggregate.weekReview>

/** "6 – 12 OCT 2026" */
function range(start: Date): string {
  const end = addDays(start, 6)
  const month = (d: Date) =>
    d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()
  const head =
    start.getMonth() === end.getMonth()
      ? `${start.getDate()}`
      : `${start.getDate()} ${month(start)}`
  return `${head} – ${end.getDate()} ${month(end)} ${end.getFullYear()}`
}

/** ISO week number, for `[ WEEK 42 ]`. */
function isoWeek(monday: Date): number {
  const thursday = addDays(monday, 3)
  const jan4 = new Date(thursday.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((thursday.getTime() - jan4.getTime()) / 86_400_000 -
        3 +
        ((jan4.getDay() + 6) % 7)) /
        7,
    )
  )
}

const hours = (minutes: number) => `${(minutes / 60).toFixed(1)}h`

/* The week across the top, one slim System window: which week, whether it
   is closed, and the three counts of the whole week. */
export function WeekBar({
  weekStart,
  closed,
  week,
  isThisWeek,
  onMove,
}: {
  weekStart: Date
  closed: boolean
  week: Week | undefined
  isThisWeek: boolean
  onMove: (weeks: number) => void
}) {
  const arrow =
    'motion-press grid size-7 place-items-center rounded-[7px] border border-lift/10 bg-lift/5 text-ink-300 hover:text-foreground disabled:opacity-40'
  return (
    <section
      aria-label="Week"
      style={{ '--area': 'var(--color-lav-400)', '--i': 0 } as CSSProperties}
      className="system-frame bento-tile relative flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-3.5"
    >
      <span aria-hidden className="bento-sweep" />
      <div className="relative flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <span className="system-title">[ WEEK {isoWeek(weekStart)} ]</span>
          {closed ? (
            <span className="motion-pop inline-flex items-center gap-1 rounded-full border border-current bg-state-good/10 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-state-good uppercase">
              <Check className="size-3" strokeWidth={3} /> CLOSED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-current bg-lav-400/10 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-lav-400 uppercase">
              <span className="bento-ping size-1.5 rounded-full bg-current" />
              OPEN
            </span>
          )}
        </div>
        <Caps>{range(weekStart)}</Caps>
      </div>
      {week ? (
        <div className="relative flex flex-wrap gap-7">
          <Stat label="LOGGED" size="text-[22px]" was={week.lastWeek.total}>
            <CountUp to={week.week.total} testId="logged" />
          </Stat>
          <Stat
            label="TASKS DONE"
            size="text-[22px]"
            was={week.lastWeek.tasksDone}
          >
            <CountUp to={week.week.tasksDone} testId="tasks-done" />
          </Stat>
          <Stat
            label="ON PROJECTS"
            size="text-[22px]"
            was={hours(week.lastWeek.projectMinutes)}
          >
            <CountUp
              to={week.week.projectMinutes / 60}
              format={(n) => n.toFixed(1)}
            />
            <span className="text-[15px] text-ink-500">h</span>
          </Stat>
        </div>
      ) : null}
      <div className="relative flex gap-1">
        <button
          type="button"
          aria-label="Week before"
          className={arrow}
          onClick={() => onMove(-1)}
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Week after"
          className={arrow}
          disabled={isThisWeek}
          onClick={() => onMove(1)}
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </section>
  )
}
