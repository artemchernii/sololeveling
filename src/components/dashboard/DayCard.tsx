import { useEffect, useRef, useState } from 'react'

import type { Doc } from '../../../convex/_generated/dataModel'
import { SkeletonRows } from '@/components/Skeleton'
import {
  DAY_FROM,
  DAY_TO,
  dayX,
  hourOf,
  inLabel,
  lanes,
  nextItem,
} from '@/lib/day'
import { buildTimeline } from '@/lib/timeline'
import { ThreeSlots } from './ThreeSlots'
import type { Pick } from './ThreeSlots'
import type { ICONS } from './AreaIcon'

/* TODAY — one live card (17 Oct, mockup design/today-mockup/month.html):
   what is next and how long until it, the day as a line with the now on
   it, and TODAY'S THREE under them. Events and scheduled tasks meet only
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
  const offered = [
    ...items
      .filter((i) => i.source === 'event')
      .map((i) => ({ title: i.title, area: i.area, icon: iconFor(i.area) })),
    ...picks,
  ].filter(
    (p, i, all) =>
      !taken.has(p.title.toLowerCase()) &&
      all.findIndex((q) => q.title === p.title) === i,
  )
  const clock = (ms: number) =>
    new Date(ms).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
  const nowX = dayX(hourOf(now.getTime()))
  /* Two at once go on two rows, never one block with both names. */
  const rows = lanes(items)
  const line = useRef<HTMLDivElement>(null)
  const width = useWidth(line)

  return (
    <section
      aria-label="Today"
      className="glass motion-arrive rounded-[18px] px-5 py-[18px]"
    >
      <div className="mb-[18px] flex items-center justify-between">
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
        <SkeletonRows rows={3} />
      ) : (
        <>
          <div className="grid grid-cols-1 items-center gap-7 sm:grid-cols-[220px_1fr]">
            <div>
              <span className="label-caps">Next</span>
              {next ? (
                <>
                  <div className="mt-1.5 mb-2.5 text-[40px] leading-tight font-light tracking-[-0.02em]">
                    <span data-testid="next-title">{next.title}</span>
                    <span className="ml-1.5 align-middle font-mono text-[18px] text-lav-300">
                      {clock(next.startsAt)}
                    </span>
                  </div>
                  <span
                    data-testid="next-in"
                    className="td-live rounded-full border border-current px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-lav-400"
                  >
                    {inLabel(next.startsAt - now.getTime())}
                    {next.durationMin ? ` · ${next.durationMin} MIN` : ''}
                  </span>
                </>
              ) : (
                <>
                  <div className="mt-1.5 mb-2.5 text-[40px] leading-tight font-light tracking-[-0.02em] text-ink-300">
                    FREE
                  </div>
                  <span className="rounded-full border border-current px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-ink-400">
                    {items.length === 0 ? '0 EVENTS' : 'NOTHING LATER'}
                  </span>
                </>
              )}
            </div>
            <div
              ref={line}
              className="td-line"
              aria-hidden
              style={{ height: 64 + (rows.count - 1) * 26 }}
            >
              <span className="td-track" />
              <span className="td-past" style={{ width: `${nowX}%` }} />
              {items.map((i, n) => {
                const from = dayX(hourOf(i.startsAt))
                const to = dayX(hourOf(i.startsAt) + (i.durationMin ?? 30) / 60)
                const top = 18 + rows.lane[n] * 26
                /* A name that does not fit its block sits beside it. */
                const fits =
                  ((to - from) / 100) * width >= i.title.length * 6.5 + 12
                return (
                  <span key={i.id}>
                    <span
                      title={i.title}
                      className="td-ev"
                      style={{ left: `${from}%`, width: `${to - from}%`, top }}
                    >
                      {fits ? i.title : ''}
                    </span>
                    {fits ? null : (
                      <span
                        className="td-name"
                        style={{
                          ...(to > 75
                            ? { right: `${100 - from}%` }
                            : { left: `${to}%` }),
                          top,
                        }}
                      >
                        {i.title}
                      </span>
                    )}
                  </span>
                )
              })}
              <span
                data-testid="now-mark"
                className="td-now"
                style={{ left: `${nowX}%` }}
              />
              {[DAY_FROM, 12, 16, 20, DAY_TO].map((h) => (
                <span key={h} className="td-hr" style={{ left: `${dayX(h)}%` }}>
                  {String(h % 24).padStart(2, '0')}
                </span>
              ))}
            </div>
          </div>
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

/** The line's width in pixels, so a name knows whether it fits. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return w
}
