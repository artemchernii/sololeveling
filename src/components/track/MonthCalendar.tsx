import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { useDayStarts } from '@/components/track/useDayStarts'
import {
  compareMonths,
  monthDays,
  monthOf,
  monthWeeks,
  shiftMonth,
} from '@/lib/month-grid'
import type { YearMonth } from '@/lib/month-grid'

/* History on a tracking page. Body's first; Languages' too since 26 Sep
   ("move calendar-dates into history tab"), so both pages look back the
   same way. The page says which kinds to read, how to draw and name each,
   and what the tapped day lists.

   From when it was Body's alone: one month, small, and the day tapped listed under it
   (26 Sep, rebuilt twice: tiles "a bit too big", and a list below that
   meant scrolling "to find some shit"). A dot marks a day something was
   logged — from aggregate.categoryDays over the month, its per-day counts
   above zero; the day's kinds are in its label. The arrows step through
   months; there is none after this one, since a log is something that has
   happened.

   It counts nothing itself. */

const DAY = 86_400_000
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const MONTH_NAME = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
})
const DAY_NAME = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export type LoggedRow = { kind: string; category: string | null }

export function MonthCalendar({
  area,
  kinds,
  icon,
  name,
  day: dayList,
}: {
  area: string
  kinds: Array<Doc<'logs'>['kind']>
  /** The small icon a day cell shows for one kind logged that day. */
  icon: (row: LoggedRow, className: string) => ReactNode
  /** Its name, for the day's label. */
  name: (row: LoggedRow) => string
  /** What the tapped day lists. */
  day: (dayStart: number) => ReactNode
}) {
  const today = useDayStarts(1).at(-1) as number
  const current = monthOf(new Date(today))
  const [shown, setShown] = useState<YearMonth>(current)
  const [picked, setPicked] = useState<number | null>(today)
  const atCurrent = compareMonths(shown, current) >= 0

  /* Only days that have happened are asked about. */
  const dayStarts = monthDays(shown).filter((d) => d <= today)
  const result = useQuery(
    api.aggregate.categoryDays,
    dayStarts.length === 0
      ? 'skip'
      : {
          area,
          kinds,
          dayStarts,
          end: dayStarts[dayStarts.length - 1] + DAY,
          recentDays: dayStarts.length,
        },
  )
  const rows = result?.rows ?? []
  const iconsFor = (day: number) => {
    const i = dayStarts.indexOf(day)
    if (i < 0) return []
    return rows.filter((r) => r.days[i] > 0)
  }

  function step(delta: number) {
    const next = shiftMonth(shown, delta)
    setShown(next)
    setPicked(compareMonths(next, current) === 0 ? today : null)
  }

  return (
    <div className="relative flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="motion-press grid size-8 place-items-center rounded-full text-ink-400 ring-1 ring-lift/12 transition-colors ring-inset hover:text-foreground hover:ring-lift/25"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="font-mono text-[12px] tracking-[0.16em] text-ink-200 uppercase">
          {MONTH_NAME.format(new Date(shown.year, shown.month, 1))}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={atCurrent}
          aria-label="Next month"
          className="motion-press grid size-8 place-items-center rounded-full text-ink-400 ring-1 ring-lift/12 transition-colors ring-inset hover:text-foreground hover:ring-lift/25 disabled:opacity-25"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div
        key={`${shown.year}-${shown.month}`}
        className="motion-arrive grid grid-cols-7 gap-1"
      >
        {WEEKDAYS.map((w, i) => (
          <span
            key={i}
            className={`text-center font-mono text-[10.5px] tracking-[0.12em] ${
              i >= 5 ? 'text-ink-500' : 'text-ink-400'
            }`}
          >
            {w}
          </span>
        ))}
        {sixWeeks(monthWeeks(shown))
          .flat()
          .map((day, i) =>
            day === null ? (
              <span key={`pad-${i}`} />
            ) : (
              <Day
                key={day}
                day={day}
                weekend={i % 7 >= 5}
                isToday={day === today}
                future={day > today}
                picked={day === picked}
                logged={iconsFor(day)}
                icon={icon}
                name={name}
                onPick={() => setPicked((p) => (p === day ? null : day))}
              />
            ),
          )}
      </div>

      <GrowOnly>
        {picked !== null ? <div key={picked}>{dayList(picked)}</div> : null}
      </GrowOnly>
    </div>
  )
}

function Day({
  day,
  weekend,
  isToday,
  future,
  picked,
  logged,
  icon,
  name,
  onPick,
}: {
  day: number
  weekend: boolean
  isToday: boolean
  future: boolean
  picked: boolean
  logged: Array<LoggedRow>
  icon: (row: LoggedRow, className: string) => ReactNode
  name: (row: LoggedRow) => string
  onPick: () => void
}) {
  const any = logged.length > 0
  return (
    <button
      type="button"
      disabled={future}
      onClick={onPick}
      aria-pressed={picked}
      aria-label={`${DAY_NAME.format(new Date(day))}${
        any ? `: ${logged.map(name).join(', ')}` : ''
      }`}
      className={`motion-press flex min-h-11 flex-col items-center justify-center gap-1 rounded-[9px] py-1.5 ring-1 transition-colors ring-inset sm:min-h-12 ${
        picked
          ? 'bg-lift/[0.09]'
          : weekend
            ? 'bg-lift/[0.015]'
            : 'bg-lift/[0.035]'
      } ${
        isToday
          ? 'ring-lav-400/70'
          : picked
            ? 'ring-lift/30'
            : 'ring-transparent hover:ring-lift/20'
      } disabled:opacity-30`}
    >
      <span
        className={`font-mono text-[12px] leading-none ${
          isToday
            ? 'text-area'
            : any
              ? 'text-foreground'
              : weekend
                ? 'text-ink-600'
                : 'text-ink-500'
        }`}
      >
        {new Date(day).getDate()}
      </span>
      {/* An icon per kind logged (26 Sep: "add back icons instead of red
          dot") — which thing, at a glance. A reserved line when empty, so
          every cell in a row is one height. */}
      <span
        aria-hidden
        className="flex min-h-3 flex-wrap justify-center gap-[3px] px-0.5 text-area sm:min-h-3.5"
      >
        {logged.map((row) => (
          <span key={`${row.kind}-${row.category ?? ''}`} className="contents">
            {icon(row, 'size-3 sm:size-3.5')}
          </span>
        ))}
      </span>
    </button>
  )
}

/* Six rows, always (26 Sep, "when I click on different days everything is
   jumping"): a month is four to six weeks, and a calendar that changed
   height between months moved everything under it. Blank weeks pad the
   end. */
function sixWeeks(
  weeks: Array<Array<number | null>>,
): Array<Array<number | null>> {
  const out = [...weeks]
  while (out.length < 6) out.push(Array<number | null>(7).fill(null))
  return out
}

/* The day's list under the calendar keeps the tallest height it has had
   (26 Sep, same complaint): picking a quiet day after a busy one made the
   page shorter than where it was scrolled, the browser pulled the page up
   to fit, and the calendar jumped under his thumb. A little empty room is
   the price of it staying put. */
function GrowOnly({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [floor, setFloor] = useState(0)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const inner = el.firstElementChild as HTMLElement | null
    const measure = () => {
      const h = inner?.offsetHeight ?? 0
      setFloor((f) => (h > f ? h : f))
    }
    measure()
    const watch = new ResizeObserver(measure)
    if (inner) watch.observe(inner)
    return () => watch.disconnect()
  }, [])
  return (
    <div ref={box} style={{ minHeight: floor }}>
      <div>{children}</div>
    </div>
  )
}
