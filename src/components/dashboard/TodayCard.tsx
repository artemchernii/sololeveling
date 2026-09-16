import { SkeletonRows } from '@/components/Skeleton'
import { areaVars } from '@/lib/areas'
import { bookedHoursLine, buildTimeline } from '@/lib/timeline'
import { useArrived } from '@/lib/loading'
import type { Doc } from '../../../convex/_generated/dataModel'

/* PLAN.md §3 item 2. Events and scheduled tasks, merged only here, through the
   TimelineItem mapper (§3b.3). Each row carries a rule in its area's colour,
   the same mark THIS WEEK draws: a kind, not a verdict (§3d.3).
 
   The card was built to take events from day one so Phase 5 would have little
   to change, and it did: the only change is that the mapper now needs to know
   which day this is. A recurring event is one row that means nothing until a
   period is named (§3b.6), and "today" is that period. */

export function TodayCard({
  tasks,
  events,
  date,
}: {
  tasks: Array<Doc<'tasks'>> | undefined
  events: Array<Doc<'events'>>
  date: Date
}) {
  const arrived = useArrived(tasks)
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const items = buildTimeline(tasks ?? [], events, {
    start: dayStart.getTime(),
    end: dayEnd.getTime(),
  })

  return (
    /* The same resting height as TODAY'S THREE beside it, so neither card
       resizes as its read lands (16 Sep). */
    <div className="glass flex min-h-[216px] flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-baseline justify-between">
        <div className="label-caps">Today</div>
        <div className="label-caps">
          {date
            .toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })
            .toUpperCase()}
        </div>
      </div>

      {tasks === undefined ? (
        <SkeletonRows rows={1} />
      ) : items.length === 0 ? (
        <p className={`text-[13px] text-ink-500 ${arrived}`}>
          Nothing at a time today. Give one of the three a time and it appears
          here.
        </p>
      ) : (
        <div className={`flex flex-col ${arrived}`}>
          {items.map((item) => (
            <div
              key={item.id}
              style={item.area ? areaVars(item.area) : undefined}
              className="flex items-baseline gap-3 border-b border-lift/[0.05] py-2.5 last:border-b-0"
            >
              {/* Grey when unfiled: unfiled is not a kind. */}
              <span
                aria-hidden
                className={`w-[2px] shrink-0 self-stretch rounded-full ${item.area ? 'bg-(--area)/70' : 'bg-lift/15'}`}
              />
              <span className="font-mono text-[11px] text-lav-300">
                {new Date(item.startsAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="flex-1 text-[13px] text-foreground">
                {item.title}
              </span>
              {item.durationMin ? (
                <span className="font-mono text-[11px] text-ink-600">
                  {item.durationMin} min
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <p className="text-[12.5px] text-ink-500">{bookedHoursLine(items)}</p>
    </div>
  )
}
