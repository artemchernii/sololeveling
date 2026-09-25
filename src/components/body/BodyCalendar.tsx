import { useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ChevronLeft, ChevronRight, CircleHelp, Scale } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { KindIcon, kindName } from '@/components/body/kinds'
import { useDayStarts } from '@/components/track/useDayStarts'
import { clock } from '@/lib/format'
import {
  compareMonths,
  monthDays,
  monthOf,
  monthWeeks,
  shiftMonth,
} from '@/lib/month-grid'
import type { YearMonth } from '@/lib/month-grid'

/* One month of Body, as a calendar page (26 Sep: "these weeks are not
   clear. Maybe one month only with ability to change month and make it
   more detailed").

   Each day shows an icon per kind logged that day — which thing, not just
   that something happened — read from aggregate.categoryDays over the
   month's days. Tapping a day lists what was logged in it. The arrows step
   through months; there is no month after this one, since a log is
   something that has happened.

   It counts nothing itself: the icons are categoryDays' per-day counts
   above zero, the list is the rows. */

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
        className="motion-arrive grid grid-cols-7 gap-1.5"
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

      {picked !== null ? <DayList day={picked} /> : null}
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
      className={`motion-press flex min-h-[54px] flex-col items-start gap-1 rounded-[12px] p-1.5 text-left ring-1 transition-colors ring-inset sm:min-h-[64px] sm:p-2 ${
        picked
          ? 'bg-lift/[0.08]'
          : weekend
            ? 'bg-lift/[0.015]'
            : 'bg-lift/[0.035]'
      } ${
        isToday
          ? 'ring-(--area)/70'
          : picked
            ? 'ring-lift/30'
            : weekend
              ? 'ring-lift/[0.05] hover:ring-lift/20'
              : 'ring-lift/[0.07] hover:ring-lift/20'
      } disabled:opacity-35`}
    >
      <span
        className={`font-mono text-[11px] leading-none ${
          isToday ? 'text-(--area)' : any ? 'text-foreground' : 'text-ink-500'
        }`}
      >
        {new Date(day).getDate()}
      </span>
      {any ? (
        <span className="flex flex-wrap gap-[3px] text-(--area)">
          {logged.map((row) => (
            <RowIcon key={`${row.kind}-${row.category ?? ''}`} row={row} />
          ))}
        </span>
      ) : null}
    </button>
  )
}

function rowName(row: LoggedRow): string {
  if (row.kind === 'weight') return 'weight'
  return kindName(row.category)
}

function RowIcon({ row }: { row: LoggedRow }) {
  const cls = 'size-3 sm:size-3.5'
  if (row.kind === 'weight') return <Scale className={cls} />
  if (row.category === null) {
    return <CircleHelp className={`${cls} text-state-warn`} />
  }
  return <KindIcon kind={row.category} className={cls} />
}

/* What was logged on the day tapped — the rows themselves, newest first. */
function DayList({ day }: { day: number }) {
  const result = useQuery(api.logs.listForArea, { area: 'body', since: day })
  if (result === undefined) return null
  const rows = result.rows.filter(
    (r) =>
      r.occurredAt < day + DAY &&
      (r.kind === 'workout' || r.kind === 'intake' || r.kind === 'weight'),
  )
  return (
    <div className="motion-arrive flex flex-col gap-1 rounded-[14px] bg-background/30 p-3 ring-1 ring-lift/[0.07] ring-inset">
      <span className="label-caps">{DAY_NAME.format(new Date(day))}</span>
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-500">Nothing logged.</p>
      ) : (
        rows.map((r) => (
          <div key={r._id} className="flex items-center gap-2.5 py-0.5">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-(--area)/12 text-(--area)">
              <RowIcon
                row={{ kind: r.kind, category: r.meta?.category ?? null }}
              />
            </span>
            <span className="min-w-0 flex-1 text-[13px] text-ink-200">
              {r.kind === 'weight'
                ? `${r.value} ${r.unit ?? 'kg'}`
                : (r.text ?? kindName(r.meta?.category))}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink-600">
              {clock(new Date(r.occurredAt))}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
