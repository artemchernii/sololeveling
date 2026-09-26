import { useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { DayLog } from '@/components/body/DayLog'
import { kindName } from '@/components/body/kinds'
import { useDayStarts } from '@/components/track/useDayStarts'
import {
  compareMonths,
  monthDays,
  monthOf,
  monthWeeks,
  shiftMonth,
} from '@/lib/month-grid'
import type { YearMonth } from '@/lib/month-grid'

/* History on Body: one month, small, and the day tapped listed under it
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

export function BodyCalendar() {
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
          area: 'body',
          kinds: ['workout', 'intake', 'weight'],
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
        {monthWeeks(shown)
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
                onPick={() => setPicked((p) => (p === day ? null : day))}
              />
            ),
          )}
      </div>

      {picked !== null ? <DayLog key={picked} day={picked} /> : null}
    </div>
  )
}

type LoggedRow = { kind: string; category: string | null }

function Day({
  day,
  weekend,
  isToday,
  future,
  picked,
  logged,
  onPick,
}: {
  day: number
  weekend: boolean
  isToday: boolean
  future: boolean
  picked: boolean
  logged: Array<LoggedRow>
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
        any ? `: ${logged.map(rowName).join(', ')}` : ''
      }`}
      className={`motion-press flex h-10 flex-col items-center justify-center gap-[3px] rounded-[9px] ring-1 transition-colors ring-inset sm:h-11 ${
        picked
          ? 'bg-lift/[0.09]'
          : weekend
            ? 'bg-lift/[0.015]'
            : 'bg-lift/[0.035]'
      } ${
        isToday
          ? 'ring-(--area)/70'
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
      <span
        aria-hidden
        className={`size-[5px] rounded-full ${any ? 'bg-(--area)' : 'bg-transparent'}`}
      />
    </button>
  )
}

function rowName(row: LoggedRow): string {
  if (row.kind === 'weight') return 'weight'
  return kindName(row.category)
}
