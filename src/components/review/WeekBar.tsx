import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  CupSoda,
  Dumbbell,
  GitCommitHorizontal,
} from 'lucide-react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { kindName } from '@/components/body/kinds'
import { ProjectLogo } from '@/components/projects/ProjectLogo'
import { Badge, Caps, dayLabel } from '@/components/review/parts'
import { euros } from '@/lib/money'
import { addDays } from '@/lib/weeks'

type Week = FunctionReturnType<typeof api.aggregate.weekReview>

/** "12 – 15 – 18 OCT 2026", today lit in the middle on this week. */
function Range({ start, today }: { start: Date; today: number }) {
  const end = addDays(start, 6)
  const month = (d: Date) =>
    d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()
  const head =
    start.getMonth() === end.getMonth()
      ? `${start.getDate()}`
      : `${start.getDate()} ${month(start)}`
  return (
    <span className="font-mono text-[10.5px] tracking-[0.16em] text-ink-400">
      {head} –{' '}
      {today >= 0 ? (
        <>
          <b className="font-medium text-lav-300 [text-shadow:0_0_10px_var(--system-shine)]">
            {addDays(start, today).getDate()}
          </b>{' '}
          –{' '}
        </>
      ) : null}
      {end.getDate()} {month(end)} {end.getFullYear()}
    </span>
  )
}

/** ISO week number, for `[ WEEK 42 ]`. */
export function isoWeek(monday: Date): number {
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

/* The week across the top, one System window (mockup real2.html): a card
   per day with what the app saw on its own — commits, money out and in,
   workouts, shakes, classes — and, on hover, which project the commits
   went to. Today pulses; the days still to come are dim. */
export function WeekBar({
  weekStart,
  today,
  week,
  languageCodes,
  isThisWeek,
  onMove,
}: {
  weekStart: Date
  /** Today's index in this week, or -1 when the week is another. */
  today: number
  week: Week | undefined
  /** A language area's short code for its badge: portuguese → PT. */
  languageCodes: Record<string, string>
  isThisWeek: boolean
  onMove: (weeks: number) => void
}) {
  const arrow =
    'motion-press grid size-7 place-items-center rounded-[7px] border border-lift/10 bg-lift/5 text-ink-300 hover:text-foreground disabled:opacity-40'
  const projects = week?.projects ?? []
  const commits = Array.from({ length: 7 }, (_, k) =>
    projects.reduce((n, p) => n + p.days[k], 0),
  )
  const most = Math.max(1, ...commits)
  return (
    <section
      aria-label="Week"
      style={
        {
          '--area': 'var(--color-lav-400)',
          '--i': 0,
          zIndex: 10,
        } as CSSProperties
      }
      className="system-frame bento-tile relative flex flex-col gap-3 !overflow-visible p-3.5"
    >
      {/* Clipped on its own: the bar stays unclipped for the day cards'
          hover lines, and the sweep must not widen the page. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      >
        <span className="bento-sweep" />
      </span>
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[14px] font-medium tracking-[0.3em] text-lav-300 [text-shadow:0_0_14px_var(--system-shine),0_0_2px_var(--color-lav-400)]">
            [ WEEK {isoWeek(weekStart)} ]
          </span>
          {today >= 0 ? (
            <Badge className="review-badge-pulse bg-lav-400/10 text-lav-400">
              <span className="bento-ping size-1.5 rounded-full bg-current" />
              DAY {today + 1} OF 7
            </Badge>
          ) : null}
          <Range start={weekStart} today={today} />
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
          const c = commits[k]
          const out = week?.money.byDay[k] ?? 0
          const marks = week?.days[k]
          const later = today >= 0 && k > today
          const byProject = projects.filter((p) => p.days[k] > 0)
          return (
            <div
              key={k}
              data-testid={`day-${k}`}
              className={`group/day relative flex min-h-[104px] min-w-0 flex-col gap-[5px] rounded-[10px] border border-lift/[0.09] bg-lift/[0.03] px-[7px] py-2 transition hover:z-20 hover:-translate-y-0.5 hover:border-lav-400/45 ${k === today ? 'review-today border-lav-400' : ''} ${later ? 'opacity-40' : ''}`}
            >
              <Caps className="text-[8.5px] tracking-[0.1em]">
                {dayLabel(addDays(weekStart, k).getTime())}
              </Caps>
              <div className="flex h-[30px] items-end">
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
              {week === undefined ? null : (
                <div className="flex flex-wrap gap-[3px]">
                  {projects.length > 0 && !later ? (
                    <Chip
                      className={
                        c > 0 ? 'text-(--area-projects)' : 'text-ink-500'
                      }
                      icon={<GitCommitHorizontal />}
                      label={`${c} commits`}
                    >
                      {c}
                    </Chip>
                  ) : null}
                  {out > 0 ? (
                    <Chip className="text-state-danger">
                      {euros(out)}
                      <span className="max-sm:hidden"> OUT</span>
                    </Chip>
                  ) : null}
                  {marks && marks.in > 0 ? (
                    <Chip className="text-state-good">
                      {euros(marks.in)}
                      <span className="max-sm:hidden"> IN</span>
                    </Chip>
                  ) : null}
                  {marks?.workouts.map((w) => (
                    <Chip
                      key={w}
                      className="text-(--area-body)"
                      icon={<Dumbbell />}
                    >
                      {kindName(w).toUpperCase()}
                    </Chip>
                  ))}
                  {marks && marks.shakes > 0 ? (
                    <Chip className="text-(--area-body)" icon={<CupSoda />}>
                      SHAKE
                    </Chip>
                  ) : null}
                  {marks?.languages.map((l) => (
                    <Chip
                      key={l}
                      className=""
                      style={{ color: `var(--area-${l})` }}
                    >
                      CLASS {languageCodes[l] ?? l.slice(0, 2).toUpperCase()}
                    </Chip>
                  ))}
                </div>
              )}
              {byProject.length > 0 || out > 0 || (marks?.in ?? 0) > 0 ? (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute top-[calc(100%+6px)] left-1/2 z-30 flex min-w-[220px] -translate-x-1/2 -translate-y-1 flex-col gap-1.5 rounded-[10px] border border-lav-400/35 bg-background/95 p-2.5 opacity-0 shadow-[0_18px_40px_-16px_black,0_0_24px_-12px_var(--system-shine)] backdrop-blur transition group-hover/day:translate-y-0 group-hover/day:opacity-100"
                >
                  {byProject.map((p) => (
                    <div
                      key={p._id}
                      className="grid grid-cols-[16px_1fr_auto] items-center gap-[7px] font-mono text-[10px] tracking-[0.06em] whitespace-nowrap text-ink-200 uppercase"
                    >
                      <ProjectLogo
                        url={p.logoUrl}
                        title={p.title}
                        area={p.area}
                        size={16}
                      />
                      <span>{p.title}</span>
                      <span className="text-(--area-projects)">
                        {p.days[k]} COMMITS
                      </span>
                    </div>
                  ))}
                  {out > 0 ? (
                    <TipLine icon={<ArrowUp />} className="text-state-danger">
                      OUT · {euros(out)}
                    </TipLine>
                  ) : null}
                  {marks && marks.in > 0 ? (
                    <TipLine icon={<ArrowDown />} className="text-state-good">
                      IN · {euros(marks.in)}
                    </TipLine>
                  ) : null}
                </div>
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
  icon,
  label,
  style,
}: {
  children: ReactNode
  className: string
  icon?: ReactNode
  label?: string
  style?: CSSProperties
}) {
  return (
    <span
      aria-label={label}
      style={style}
      className={`motion-pop inline-flex items-center gap-[3px] rounded-[6px] border border-current px-[5px] py-px font-mono text-[9px] tracking-[0.04em] whitespace-nowrap [&_svg]:size-[9px] ${className}`}
    >
      {icon}
      {children}
    </span>
  )
}

function TipLine({
  children,
  icon,
  className,
}: {
  children: ReactNode
  icon: ReactNode
  className: string
}) {
  return (
    <div
      className={`flex items-center gap-[7px] font-mono text-[10px] tracking-[0.06em] whitespace-nowrap [&_svg]:size-3 ${className}`}
    >
      {icon}
      {children}
    </div>
  )
}
