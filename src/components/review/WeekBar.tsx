import type { CSSProperties, ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'

import { Badge, Caps, dayLabel } from '@/components/review/parts'
import { euros } from '@/lib/money'
import { addDays } from '@/lib/weeks'

/** "12 – 18 OCT 2026" */
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

/* The week across the top, one System window (mockup real.html): a card
   per day with what the app saw on its own — commits across projects, and
   what was spent. Today pulses; the days still to come are dim. */
export function WeekBar({
  weekStart,
  closed,
  today,
  commits,
  spent,
  isThisWeek,
  onMove,
}: {
  weekStart: Date
  closed: boolean
  /** Today's index in this week, or -1 when the week is another. */
  today: number
  /** Per day, Monday first — undefined while loading. */
  commits: ReadonlyArray<number> | undefined
  spent: ReadonlyArray<number> | undefined
  isThisWeek: boolean
  onMove: (weeks: number) => void
}) {
  const arrow =
    'motion-press grid size-7 place-items-center rounded-[7px] border border-lift/10 bg-lift/5 text-ink-300 hover:text-foreground disabled:opacity-40'
  const most = Math.max(1, ...(commits ?? []))
  return (
    <section
      aria-label="Week"
      style={{ '--area': 'var(--color-lav-400)', '--i': 0 } as CSSProperties}
      className="system-frame bento-tile relative flex flex-col gap-3 p-3.5"
    >
      <span aria-hidden className="bento-sweep" />
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="system-title">[ WEEK {isoWeek(weekStart)} ]</span>
          {closed ? (
            <Badge className="motion-pop bg-state-good/10 text-state-good">
              <Check className="size-3" strokeWidth={3} /> CLOSED
            </Badge>
          ) : today >= 0 ? (
            <Badge className="bg-lav-400/10 text-lav-400">
              <span className="bento-ping size-1.5 rounded-full bg-current" />
              DAY {today + 1} OF 7
            </Badge>
          ) : null}
          <Caps>{range(weekStart)}</Caps>
        </div>
        <div className="flex gap-1">
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
      </div>
      <div className="relative grid grid-cols-7 gap-1.5">
        {Array.from({ length: 7 }, (_, k) => {
          const c = commits?.[k] ?? 0
          const out = spent?.[k] ?? 0
          const later = today >= 0 && k > today
          return (
            <div
              key={k}
              data-testid={`day-${k}`}
              className={`flex min-h-24 min-w-0 flex-col gap-1.5 rounded-[10px] border border-lift/[0.09] bg-lift/[0.03] px-[7px] py-2 transition hover:-translate-y-0.5 ${k === today ? 'review-today border-lav-400' : ''} ${later ? 'opacity-40' : ''}`}
            >
              <Caps className="text-[8.5px] tracking-[0.1em]">
                {dayLabel(addDays(weekStart, k).getTime())}
              </Caps>
              <div className="flex h-8 items-end">
                {c > 0 ? (
                  <i
                    style={{
                      height: `${(c / most) * 100}%`,
                      animationDelay: `${k * 70}ms`,
                    }}
                    className="bento-grow w-full rounded-[3px] bg-(--area-projects) shadow-[0_0_10px_-3px_var(--area-projects)]"
                  />
                ) : null}
              </div>
              {commits === undefined || later ? null : (
                <Chip
                  className={c > 0 ? 'text-(--area-projects)' : 'text-ink-500'}
                  delay={400 + k * 70}
                >
                  {c}
                  <span className="max-sm:hidden"> COMMITS</span>
                </Chip>
              )}
              {out > 0 ? (
                <Chip className="text-area-money" delay={500 + k * 70}>
                  {euros(out)}
                  <span className="max-sm:hidden"> OUT</span>
                </Chip>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Chip({
  children,
  className,
  delay,
}: {
  children: ReactNode
  className: string
  delay: number
}) {
  return (
    <span
      style={{ animationDelay: `${delay}ms` }}
      className={`motion-pop self-start truncate rounded-[6px] border border-current px-[5px] py-px font-mono text-[9px] tracking-[0.06em] whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  )
}
