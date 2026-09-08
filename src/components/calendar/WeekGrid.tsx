import type { TimelineItem } from '@/lib/timeline'

/* PLAN.md §4 phase 5. Seven columns, one week, events and scheduled tasks in
   the same grid — because a day does not care which table a thing came from.
 
   The grid starts at 06:00 rather than midnight: six empty rows at the top of
   every week is six rows of nothing, and anything genuinely earlier is drawn
   pinned to the first row rather than scrolled away above it. */

const FIRST_HOUR = 6
const LAST_HOUR = 23
const ROW_HEIGHT = 44

const HOURS = Array.from(
  { length: LAST_HOUR - FIRST_HOUR + 1 },
  (_, i) => FIRST_HOUR + i,
)

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

/** Where an item sits in its column, in pixels from the top of the grid. */
function placement(item: TimelineItem) {
  const start = new Date(item.startsAt)
  const minutes = start.getHours() * 60 + start.getMinutes()
  const fromTop = ((minutes - FIRST_HOUR * 60) / 60) * ROW_HEIGHT

  /* An untimed-but-dated item still has to be a readable size, and an item
     earlier than the grid starts is pinned rather than drawn off the top. */
  const height = Math.max(((item.durationMin ?? 30) / 60) * ROW_HEIGHT, 18)
  return { top: Math.max(fromTop, 0), height }
}

export function WeekGrid({
  weekStart,
  items,
  onSelect,
  onCreateAt,
}: {
  weekStart: Date
  items: Array<TimelineItem>
  onSelect: (item: TimelineItem) => void
  onCreateAt: (startsAt: number) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayKey = startOfDay(new Date()).getTime()

  return (
    <div className="glass overflow-hidden rounded-[22px]">
      <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-white/[0.06]">
        <div />
        {days.map((day) => {
          const isToday = startOfDay(day).getTime() === todayKey
          return (
            <div key={day.getTime()} className="px-2 py-3 text-center">
              <div className="label-caps">
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
              </div>
              {/* Lavender is reserved for live and focus things, and today is
                  the only live day in a week. */}
              <div
                className={
                  isToday
                    ? 'font-mono text-[15px] text-lav-300'
                    : 'font-mono text-[15px] text-ink-500'
                }
              >
                {day.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-[52px_repeat(7,1fr)]">
        <div>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="relative border-b border-white/[0.04]"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="absolute -top-[7px] right-2 font-mono text-[10px] text-ink-700">
                {String(hour).padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>

        {days.map((day) => {
          const dayStart = startOfDay(day).getTime()
          const dayEnd = addDays(startOfDay(day), 1).getTime()
          const ofDay = items.filter(
            (i) => i.startsAt >= dayStart && i.startsAt < dayEnd,
          )

          return (
            <div
              key={day.getTime()}
              className="relative border-l border-white/[0.04]"
            >
              {HOURS.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  aria-label={`Add an event at ${String(hour).padStart(2, '0')}:00 on ${day.toDateString()}`}
                  onClick={() =>
                    onCreateAt(new Date(day).setHours(hour, 0, 0, 0))
                  }
                  className="block w-full border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
                  style={{ height: ROW_HEIGHT }}
                />
              ))}

              {ofDay.map((item) => {
                const { top, height } = placement(item)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item)}
                    style={{ top, height }}
                    className={[
                      'absolute inset-x-1 overflow-hidden rounded-[7px] px-2 py-1 text-left',
                      /* A quest is something you chose for today; an event is
                         something the day already contained. The accent marks
                         the first, per the design voice. */
                      item.source === 'task'
                        ? 'bg-lav-300/15 ring-1 ring-lav-300/30'
                        : 'bg-white/[0.07] ring-1 ring-white/10',
                    ].join(' ')}
                  >
                    <span className="block truncate text-[11.5px] text-foreground">
                      {item.title}
                    </span>
                    <span className="block font-mono text-[10px] text-ink-600">
                      {new Date(item.startsAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
