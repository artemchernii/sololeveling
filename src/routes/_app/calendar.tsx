import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { EventDialog } from '@/components/calendar/EventDialog'
import { WeekGrid } from '@/components/calendar/WeekGrid'
import { parseOccurrenceId } from '@/lib/recurrence'
import { addDays, startOfWeek } from '@/lib/weeks'
import { buildTimeline } from '@/lib/timeline'
import type { TimelineItem } from '@/lib/timeline'

export const Route = createFileRoute('/_app/calendar')({
  component: Calendar,
})

/* PLAN.md §4 phase 5. The week reads rows and expands them here: one recurring
   row becomes however many occurrences fall inside these seven days (§3b.6),
   so paging forward a year costs the same read as paging forward a day. */
function Calendar() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [editing, setEditing] = useState<Doc<'events'> | undefined>(undefined)
  const [creatingAt, setCreatingAt] = useState<number | null>(null)

  const weekEnd = addDays(weekStart, 7)
  const range = { from: weekStart.getTime(), to: weekEnd.getTime() }

  const events = useQuery(api.events.listInRange, range)
  const tasks = useQuery(api.tasks.listScheduledInRange, range)

  const items = buildTimeline(tasks ?? [], events ?? [], {
    start: range.from,
    end: range.to,
  })

  function openItem(item: TimelineItem) {
    /* Only events open the editor. A scheduled task is edited where tasks are
       edited — showing it here and letting it be changed two ways is how the
       two tables start to blur (§3b.3). */
    if (item.source !== 'event') return
    const parsed = parseOccurrenceId(item.id)
    const row = events?.find((e) => e._id === parsed?.eventId)
    if (row) {
      setCreatingAt(null)
      setEditing(row)
    }
  }

  const loading = events === undefined || tasks === undefined

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] text-foreground">Calendar</h1>
          <p className="label-caps">
            {weekStart.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
            })}
            {' — '}
            {addDays(weekStart, 6).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            className="rounded-[7px] bg-white/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-white/10"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-[7px] bg-white/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-white/10"
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            className="rounded-[7px] bg-white/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-white/10"
          >
            →
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass rounded-[22px] p-8">
          <p className="text-[12.5px] text-ink-600">Reading&hellip;</p>
        </div>
      ) : (
        <>
          {items.length === 0 ? (
            /* The empty state is the screen this app opens on for a while, so
               it says what to do rather than that there is nothing. */
            <p className="text-[13px] text-ink-500">
              Nothing this week. Click an hour to put something in it.
            </p>
          ) : null}
          <WeekGrid
            weekStart={weekStart}
            items={items}
            onSelect={openItem}
            onCreateAt={(startsAt) => {
              setEditing(undefined)
              setCreatingAt(startsAt)
            }}
          />
        </>
      )}

      <EventDialog
        open={editing !== undefined || creatingAt !== null}
        event={editing}
        startsAt={creatingAt ?? Date.now()}
        onClose={() => {
          setEditing(undefined)
          setCreatingAt(null)
        }}
      />
    </div>
  )
}
