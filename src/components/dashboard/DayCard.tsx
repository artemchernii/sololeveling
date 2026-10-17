import { useEffect, useState } from 'react'

import type { Doc } from '../../../convex/_generated/dataModel'
import { SkeletonRows } from '@/components/Skeleton'
import { inLabel, nextItem } from '@/lib/day'
import { buildTimeline } from '@/lib/timeline'
import { ThreeSlots } from './ThreeSlots'
import type { Pick } from './ThreeSlots'
import type { ICONS } from './AreaIcon'

/* TODAY — one card (17 Oct): the next thing at a time on one line, only
   while something is coming, then TODAY'S THREE. Cut down the same day
   from the first build ("ugly, confusing and useless" on his real day):
   no day line, no big empty NEXT. Events and scheduled tasks meet only
   here and on Calendar, through the TimelineItem mapper (§3b.3). */
export function DayCard({
  tasks,
  events,
  today,
  picks,
  iconFor,
}: {
  tasks: Array<Doc<'tasks'>> | undefined
  events: Array<Doc<'events'>>
  today: string
  picks: Array<Pick>
  iconFor: (area: string | undefined) => keyof typeof ICONS | undefined
}) {
  const now = useNow()
  const dayStart = new Date(now)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  const items = buildTimeline(tasks ?? [], events, [], {
    start: dayStart.getTime(),
    end: dayEnd.getTime(),
  })
  const next = nextItem(items, now.getTime())
  const taken = new Set((tasks ?? []).map((t) => t.title.toLowerCase()))
  /* Only what is still ahead today, then the rest; four at most. */
  const offered = [
    ...items
      .filter((i) => i.source === 'event' && i.startsAt > now.getTime())
      .map((i) => ({ title: i.title, area: i.area, icon: iconFor(i.area) })),
    ...picks,
  ]
    .filter(
      (p, i, all) =>
        !taken.has(p.title.toLowerCase()) &&
        all.findIndex((q) => q.title === p.title) === i,
    )
    .slice(0, 4)
  const clock = (ms: number) =>
    new Date(ms).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })

  return (
    <section
      aria-label="Today"
      className="glass motion-arrive rounded-[18px] px-5 py-[18px]"
    >
      <div className="flex items-center justify-between">
        <span className="label-caps">
          Today ·{' '}
          <span className="text-ink-200">
            {now
              .toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })
              .toUpperCase()}
          </span>
        </span>
        <span className="label-caps">
          Now <span className="text-lav-300">{clock(now.getTime())}</span>
        </span>
      </div>

      {tasks === undefined ? (
        <div className="mt-4">
          <SkeletonRows rows={3} />
        </div>
      ) : (
        <>
          {next ? (
            <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
              <span className="label-caps text-lav-400">Next</span>
              <span
                data-testid="next-title"
                className="text-[22px] font-light text-foreground"
              >
                {next.title}
              </span>
              <span className="font-mono text-[13px] text-lav-300">
                {clock(next.startsAt)}
              </span>
              <span
                data-testid="next-in"
                className="td-live self-center rounded-full border border-current px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-lav-400"
              >
                {inLabel(next.startsAt - now.getTime())}
                {next.durationMin ? ` · ${next.durationMin} MIN` : ''}
              </span>
            </div>
          ) : null}
          <ThreeSlots
            tasks={tasks}
            today={today}
            picks={offered}
            iconFor={iconFor}
          />
        </>
      )}
    </section>
  )
}

/** The clock, a tick every 30 seconds — the badge counts down live. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}
