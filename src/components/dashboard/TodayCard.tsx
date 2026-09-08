import { bookedHoursLine, buildTimeline } from '@/lib/timeline'
import type { Doc } from '../../../convex/_generated/dataModel'

/* PLAN.md §3 item 2. Events and scheduled tasks, merged only here, through the
   TimelineItem mapper (§3b.3).
 
   `events` is empty until Phase 5 builds the Calendar — nothing creates one
   yet. The mapper takes both from day one because merging them anywhere else
   is what §3b.3 forbids, and Phase 5 should have nothing to change here. */

export function TodayCard({
  tasks,
  events,
  date,
}: {
  tasks: Array<Doc<'tasks'>> | undefined
  events: Array<Doc<'events'>>
  date: Date
}) {
  const items = buildTimeline(tasks ?? [], events)

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-5">
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
        <p className="text-[12.5px] text-ink-600">Reading&hellip;</p>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing at a time today. Give a quest an hour and it appears here.
        </p>
      ) : (
        <div className="flex flex-col">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-baseline gap-3 border-b border-white/[0.05] py-2.5 last:border-b-0"
            >
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
