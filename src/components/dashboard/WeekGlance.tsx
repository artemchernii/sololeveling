import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import { areaVars } from '@/lib/areas'
import { clock } from '@/lib/format'
import { useArrived } from '@/lib/loading'
import { MONTH_TILES } from '@/lib/tiles'
import { buildTimeline } from '@/lib/timeline'
import type { TimelineItem } from '@/lib/timeline'
import { itemsByDay, weekDays } from '@/lib/week-glance'

type DayCounts = FunctionReturnType<typeof api.aggregate.weekCounts>[number]

/* A day column shows this many booked items; the rest are one tap away on
   Calendar. Enough for a morning, few enough to read at a glance. */
const SHOWN = 3

/* PLAN.md §3 item 5: the seven days at a glance — what is booked, what was
   logged. It reads; the weekly review is still where a week is closed.

   Booked is the TimelineItem mapper again (§3b.3), over the week instead of
   the day: events and scheduled tasks, never the backlog (§3c.3). Logged is
   weekCounts() with day boundaries — the six tiles THIS MONTH counts, one dot
   per tile that has any that day, in the tile's colour, with the count beside
   it when there is more than one. A dot is a kind, not a grade (§3d.3).
   Today's column wears the lavender edge: today is the live thing.

   While loading, the seven day headers are drawn — they are calendar facts —
   and nothing inside them: shape, never values (§3d.2). */
export function WeekGlance({ today }: { today: number }) {
  const days = weekDays(new Date(today))
  const range = { from: days[0].start, to: days[6].end }

  const events = useQuery(api.events.listInRange, range)
  const tasks = useQuery(api.tasks.listScheduledInRange, range)
  const counts = useQuery(api.aggregate.weekCounts, {
    starts: days.map((d) => d.start),
    end: range.to,
  })

  const loaded =
    events !== undefined && tasks !== undefined && counts !== undefined
  const arrived = useArrived(loaded ? true : undefined)
  const booked =
    events && tasks
      ? itemsByDay(
          buildTimeline(tasks, events, { start: range.from, end: range.to }),
          days,
        )
      : []

  return (
    <div className="glass rounded-[22px] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="label-caps">This week</div>
        <div className="label-caps">
          {rangeLabel(days[0].start, days[6].start)}
        </div>
      </div>

      <div className="grid gap-2 lg:grid-cols-7">
        {days.map((day, i) => {
          const isToday = today >= day.start && today < day.end
          return (
            <div
              key={day.start}
              className={`flex gap-3 rounded-[14px] border p-2.5 lg:min-h-[124px] lg:flex-col lg:gap-2 ${
                isToday
                  ? 'border-lav-500/50 bg-lav-900/20'
                  : 'border-lift/[0.06] bg-lift/[0.02]'
              }`}
            >
              <div
                className={`label-caps w-14 shrink-0 lg:w-auto ${isToday ? 'text-lav-300' : ''}`}
              >
                {dayLabel(day.start)}
              </div>

              <div className={`flex min-w-0 flex-1 flex-col gap-2 ${arrived}`}>
                {counts && loaded ? (
                  <>
                    <Booked items={booked[i]} />
                    <Logged counts={counts[i]} />
                  </>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Booked({ items }: { items: Array<TimelineItem> }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      {items.slice(0, SHOWN).map((item) => (
        <div
          key={item.id}
          style={item.area ? areaVars(item.area) : undefined}
          className="flex min-w-0 gap-1.5"
        >
          {/* The rule is the item's area; unfiled stays grey — not a kind. */}
          <span
            aria-hidden
            className={`w-[2px] shrink-0 self-stretch rounded-full ${item.area ? 'bg-(--area)/70' : 'bg-lift/15'}`}
          />
          <span className="min-w-0 truncate text-[11.5px] leading-snug text-ink-300">
            <span className="mr-1 font-mono text-[10px] text-ink-600">
              {clock(new Date(item.startsAt))}
            </span>
            {item.title}
          </span>
        </div>
      ))}
      {items.length > SHOWN ? (
        <Link
          to="/calendar"
          className="font-mono text-[10px] text-ink-600 transition-colors hover:text-ink-300"
        >
          more on Calendar
        </Link>
      ) : null}
    </div>
  )
}

function Logged({ counts }: { counts: DayCounts }) {
  const logged = MONTH_TILES.filter((tile) => counts[tile.key] > 0)
  if (logged.length === 0) return null
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1 lg:mt-auto">
      {logged.map((tile) => (
        <span
          key={tile.key}
          title={`${counts[tile.key]} ${tile.noun}`}
          style={tile.area ? areaVars(tile.area) : undefined}
          className="flex items-center gap-1 font-mono text-[10px] text-ink-500"
        >
          <span
            aria-hidden
            className={`size-1.5 rounded-full ${tile.area ? 'bg-(--area)' : 'bg-ink-400'}`}
          />
          {counts[tile.key] > 1 ? counts[tile.key] : null}
        </span>
      ))}
    </div>
  )
}

/** "TUE 15" */
function dayLabel(ms: number): string {
  const d = new Date(ms)
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.getDate()}`
}

/** "SEP 14 — 20", or "SEP 28 — OCT 4" across a month. */
function rangeLabel(firstMs: number, lastMs: number): string {
  const first = new Date(firstMs)
  const last = new Date(lastMs)
  const month = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
  return first.getMonth() === last.getMonth()
    ? `${month(first)} ${first.getDate()} — ${last.getDate()}`
    : `${month(first)} ${first.getDate()} — ${month(last)} ${last.getDate()}`
}
