import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { PageTitle } from '@/components/PageTitle'
import { EventDialog } from '@/components/calendar/EventDialog'
import { UndoLine } from '@/components/calendar/UndoLine'
import type { Undoable } from '@/components/calendar/UndoLine'
import { WeekGrid } from '@/components/calendar/WeekGrid'
import type { DropResult } from '@/components/calendar/WeekGrid'
import { seriesPhrase, shiftSeries } from '@/lib/calendarDrag'
import { parseOccurrenceId } from '@/lib/recurrence'
import { addDays, startOfWeek } from '@/lib/weeks'
import { buildTimeline } from '@/lib/timeline'
import type { TimelineItem } from '@/lib/timeline'
import { useHeld } from '@/lib/loading'
import { localToday } from '@/lib/today'

export const Route = createFileRoute('/_app/calendar')({
  component: Calendar,
})

/* PLAN.md §4 phase 5. The week reads rows and expands them here: one recurring
   row becomes however many occurrences fall inside these seven days (§3b.6),
   so paging forward a year costs the same read as paging forward a day. */
function Calendar() {
  /* Any day in the period on screen. A phone shows that one day, since
     seven columns at 375px left "O…" for "Office work" (24 Sep); anything
     wider shows its week. */
  const [focus, setFocus] = useState(() => new Date())
  const narrow = useNarrow()
  const span = narrow ? 1 : 7
  const weekStart = narrow ? dayStart(focus) : startOfWeek(focus)
  const [editing, setEditing] = useState<Doc<'events'> | undefined>(undefined)
  const [creatingAt, setCreatingAt] = useState<{
    startsAt: number
    endsAt?: number
  } | null>(null)
  const [undoable, setUndoable] = useState<Undoable | null>(null)
  const navigate = useNavigate()
  const clearUndo = useCallback(() => setUndoable(null), [])
  /* The event just made in the dialog, while it arrives on the grid. */
  const [fresh, setFresh] = useState<{
    eventId: string
    phase: 'waiting' | 'landed'
  } | null>(null)
  useEffect(() => {
    if (fresh?.phase !== 'landed') return
    const t = window.setTimeout(() => setFresh(null), 1600)
    return () => window.clearTimeout(t)
  }, [fresh])
  const updateEvent = useMutation(api.events.update)
  const setSchedule = useMutation(api.tasks.setSchedule)

  const weekEnd = addDays(weekStart, span)
  const range = { from: weekStart.getTime(), to: weekEnd.getTime() }

  /* Held only on the first load: paging to another week keeps the grid on
     screen and fills it as the week arrives. */
  const events = useHeld(useQuery(api.events.listInRange, range))
  const tasks = useHeld(useQuery(api.tasks.listScheduledInRange, range))

  /* Milestones due this week (R3b). Their day is stored as a local calendar
     date, so the window is named in those terms rather than in epochs. */
  const dueMilestones = useQuery(api.milestones.dueInRange, {
    from: localToday(weekStart),
    to: localToday(weekEnd),
  })
  /* A milestone has no area of its own — its goal does. The join happens
     here so the mapper stays a mapper and the colour still means something. */
  const goals = useQuery(api.goals.listActive, {})
  const projects = useQuery(api.projects.listLive, {})
  const projectTitles = new Map((projects ?? []).map((p) => [p._id, p.title]))
  const areaOfGoal = new Map((goals ?? []).map((g) => [g._id, g.area]))
  const titleOfGoal = new Map((goals ?? []).map((g) => [g._id, g.title]))

  const items = buildTimeline(
    tasks ?? [],
    events ?? [],
    (dueMilestones ?? []).map((m) => ({
      _id: m._id,
      title: m.title,
      dueDate: m.dueDate,
      dueTime: m.dueTime,
      area: areaOfGoal.get(m.goalId),
      goalId: m.goalId,
      goalTitle: titleOfGoal.get(m.goalId),
    })),
    { start: range.from, end: range.to },
  )

  function openItem(item: TimelineItem) {
    /* Only events open the editor. A scheduled task is edited where tasks are
       edited — showing it here and letting it be changed two ways is how the
       two tables start to blur (§3b.3). */
    /* A milestone opens its goal: that is where its date, and the steps
       around it, can be changed (24 Sep — it could not be pressed at all). */
    if (item.source === 'milestone') {
      if (item.goalId) {
        void navigate({ to: '/goals', hash: `goal-${item.goalId}` })
      }
      return
    }
    if (item.source !== 'event') return
    const parsed = parseOccurrenceId(item.id)
    const row = events?.find((e) => e._id === parsed?.eventId)
    if (row) {
      setCreatingAt(null)
      setEditing(row)
    }
  }

  /* R5: a drop writes at once and asks nothing (the done-when). What it
     says afterwards is where the thing went, and how to put it back. */
  function drop(item: TimelineItem, result: DropResult) {
    const at = new Date(result.startsAt)
    const when =
      result.mode === 'resize'
        ? `ends ${clock(result.startsAt + result.durationMin * 60_000)}`
        : `${at.toLocaleDateString(undefined, { weekday: 'short' })} ${clock(result.startsAt)}`

    if (item.source === 'task') {
      const row = tasks?.find((t) => t._id === item.id)
      if (!row) return
      void setSchedule({
        taskId: row._id,
        scheduledAt: result.startsAt,
        durationMin: result.durationMin,
      })
      setUndoable({
        text: `${row.title} · ${when}`,
        at: Date.now(),
        undo: () =>
          setSchedule({
            taskId: row._id,
            scheduledAt: row.scheduledAt ?? null,
            durationMin: row.durationMin,
          }),
      })
      return
    }

    const parsed = parseOccurrenceId(item.id)
    const row = events?.find((e) => e._id === parsed?.eventId)
    if (!row || !parsed) return
    /* One row per series (§3b.6): moving a Tuesday moves every Tuesday, and
       the line says so rather than letting it be found out next week. */
    const startsAt = row.rrule
      ? shiftSeries(row.startsAt, parsed.startsAt, result.startsAt)
      : result.startsAt
    void updateEvent({
      eventId: row._id,
      startsAt,
      endsAt: startsAt + result.durationMin * 60_000,
    })
    setUndoable({
      text: row.rrule
        ? `${row.title} · ${when}, ${seriesPhrase(row.rrule, startsAt)}`
        : `${row.title} · ${when}`,
      at: Date.now(),
      undo: () =>
        updateEvent({
          eventId: row._id,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
        }),
    })
  }

  const loading = events === undefined || tasks === undefined

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center justify-between">
        <PageTitle
          title="Calendar"
          subtitle={
            narrow ? (
              weekStart.toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              })
            ) : (
              <>
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
              </>
            )
          }
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={narrow ? 'Previous day' : 'Previous week'}
            onClick={() => setFocus(addDays(weekStart, -span))}
            className="rounded-[7px] bg-lift/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-lift/10"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => setFocus(new Date())}
            className="rounded-[7px] bg-lift/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-lift/10"
          >
            {narrow ? 'Today' : 'This week'}
          </button>
          <button
            type="button"
            aria-label={narrow ? 'Next day' : 'Next week'}
            onClick={() => setFocus(addDays(weekStart, span))}
            className="rounded-[7px] bg-lift/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-lift/10"
          >
            →
          </button>
        </div>
      </div>

      {/* While loading, the grid itself is the skeleton (§3d.2): seven days
          and their hours are known before a single row is, and an empty grid
          carries no values. Only the empty-week sentence waits for the data,
          so it cannot claim a week is empty before it has been read. */}
      <>
        {!loading && items.length === 0 ? (
          /* The empty state is the screen this app opens on for a while, so
               it says what to do rather than that there is nothing. */
          <p className="text-[13px] text-ink-500">
            {narrow
              ? 'Nothing on this day. Tap an hour to put something in it.'
              : 'Nothing this week. Click an hour, or drag across one, to put something in it.'}
          </p>
        ) : null}
        <WeekGrid
          weekStart={weekStart}
          dayCount={span}
          items={items}
          onSelect={openItem}
          onDrop={drop}
          fresh={fresh}
          projectName={(id) => projectTitles.get(id as Doc<'projects'>['_id'])}
          onCreateAt={(startsAt, endsAt) => {
            setEditing(undefined)
            setCreatingAt({ startsAt, endsAt })
          }}
        />
      </>

      <UndoLine undoable={undoable} onDone={clearUndo} />

      <EventDialog
        open={editing !== undefined || creatingAt !== null}
        event={editing}
        startsAt={creatingAt?.startsAt ?? Date.now()}
        endsAt={creatingAt?.endsAt}
        onClose={() => {
          setEditing(undefined)
          setCreatingAt(null)
        }}
        onCreated={(eventId, phase) => setFresh({ eventId, phase })}
      />
    </div>
  )
}

/* 24-hour, like the hour labels down the side — and "09:15–10:30" fits a
   column where "09:15 AM–10:30 AM" is cut off. */
function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

function dayStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/* Below Tailwind's md, where the sidebar turns into the bottom nav. Read
   from the browser, and false on the server so the first paint is the week. */
const NARROW = '(max-width: 767px)'
function useNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  )
}
