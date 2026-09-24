import { useEffect, useRef, useState } from 'react'

import { areaVars } from '@/lib/areas'
import { dragResult } from '@/lib/calendarDrag'
import type { DragMode } from '@/lib/calendarDrag'
import type { TimelineItem } from '@/lib/timeline'
import { addDays } from '@/lib/weeks'

/* PLAN.md §4 phase 5. Seven columns, one week, events and scheduled tasks in
   the same grid — because a day does not care which table a thing came from.
 
   The grid starts at 06:00 rather than midnight: six empty rows at the top of
   every week is six rows of nothing, and anything genuinely earlier is drawn
   pinned to the first row rather than scrolled away above it. */

const FIRST_HOUR = 6
const LAST_HOUR = 23
const ROW_HEIGHT = 44
const HOUR_COLUMN = 52

/* R5. A mouse picks a block up once it has travelled a few pixels, so a click
   is still a click. A finger has to hold still first: without the hold, every
   scroll that starts on a block would drag it. */
const MOUSE_SLOP_PX = 4
const TOUCH_HOLD_MS = 300
const TOUCH_SLOP_PX = 8

export type DropResult = {
  mode: DragMode
  startsAt: number
  durationMin: number
}

type Drag = {
  item: TimelineItem
  mode: DragMode
  dayIndex: number
  x0: number
  y0: number
  /** Picked up: the block follows the pointer from here on. */
  live: boolean
  touch: boolean
  timer: number | null
}

/** The row a block came from — an event's occurrence id carries its start,
    which changes when it is moved, so the row is what stays the same. */
function rowKey(item: TimelineItem): string {
  if (item.source !== 'event') return item.id
  return item.id.slice(0, item.id.lastIndexOf(':'))
}

const HOURS = Array.from(
  { length: LAST_HOUR - FIRST_HOUR + 1 },
  (_, i) => FIRST_HOUR + i,
)

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
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

/** Where an item sits in its column, in pixels from the top of the grid. */
function placement(item: TimelineItem) {
  const start = new Date(item.startsAt)
  const minutes = start.getHours() * 60 + start.getMinutes()
  const fromTop = ((minutes - FIRST_HOUR * 60) / 60) * ROW_HEIGHT

  /* An untimed-but-dated item still has to be a readable size, and an item
     earlier than the grid starts is pinned rather than drawn off the top.

     A milestone is a marker, never a block: it is a day you promised
     something by, not time you booked, and drawing it with a length would
     make the two look like the same kind of thing (§3b.3). */
  const height =
    item.source === 'milestone'
      ? 18
      : Math.max(((item.durationMin ?? 30) / 60) * ROW_HEIGHT, 18)
  return { top: Math.max(fromTop, 0), height }
}

export function WeekGrid({
  weekStart,
  items,
  onSelect,
  onCreateAt,
  onDrop,
  projectName,
}: {
  weekStart: Date
  items: Array<TimelineItem>
  onSelect: (item: TimelineItem) => void
  onCreateAt: (startsAt: number) => void
  /** R5: a block was dragged somewhere new. Writes straight away. */
  onDrop: (item: TimelineItem, result: DropResult) => void
  projectName: (projectId: string) => string | undefined
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayKey = startOfDay(new Date()).getTime()

  const gridRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  /* A drag ends in a pointerup and then, on most browsers, a click on the
     same block. That click must not open the editor on what was just moved. */
  const swallowClick = useRef(false)
  const [preview, setPreview] = useState<{
    id: string
    startsAt: number
    durationMin: number
  } | null>(null)
  /* What was just dropped, drawn where it landed until the write comes back —
     otherwise the block would flick home and then jump. And the same, keyed
     by row, so the arrival pops once the real row is on screen. */
  const [landed, setLanded] = useState<{
    row: string
    startsAt: number
    durationMin: number
    fromId: string
    /** The write has come back: stop overriding, so an Undo shows at once. */
    arrived: boolean
  } | null>(null)

  useEffect(() => {
    if (landed === null || landed.arrived) return
    if (
      items.some(
        (i) => rowKey(i) === landed.row && i.startsAt === landed.startsAt,
      )
    ) {
      setLanded({ ...landed, arrived: true })
    }
  }, [items, landed])

  useEffect(() => {
    if (landed === null) return
    const t = window.setTimeout(() => setLanded(null), 1500)
    return () => window.clearTimeout(t)
  }, [landed?.fromId, landed?.startsAt])

  function resultFor(d: Drag, x: number, y: number) {
    const grid = gridRef.current
    const colWidth = grid
      ? (grid.getBoundingClientRect().width - HOUR_COLUMN) / 7
      : 1
    const dxDays =
      d.mode === 'move'
        ? Math.min(
            Math.max(Math.round((x - d.x0) / colWidth), -d.dayIndex),
            6 - d.dayIndex,
          )
        : 0
    return dragResult({
      mode: d.mode,
      startsAt: d.item.startsAt,
      durationMin: d.item.durationMin,
      dxDays,
      dyPx: y - d.y0,
      rowHeight: ROW_HEIGHT,
    })
  }

  function end() {
    const d = drag.current
    if (d?.timer != null) window.clearTimeout(d.timer)
    drag.current = null
    window.removeEventListener('pointermove', listeners.move)
    window.removeEventListener('pointerup', listeners.up)
    window.removeEventListener('pointercancel', listeners.cancel)
    window.removeEventListener('touchmove', listeners.hold)
  }

  function onMove(e: PointerEvent) {
    const d = drag.current
    if (!d) return
    const travelled = Math.hypot(e.clientX - d.x0, e.clientY - d.y0)
    if (!d.live) {
      if (d.touch) {
        /* Moved before the hold finished: that was a scroll, not a pickup. */
        if (travelled > TOUCH_SLOP_PX) end()
        return
      }
      if (travelled < MOUSE_SLOP_PX) return
      d.live = true
    }
    const r = resultFor(d, e.clientX, e.clientY)
    setPreview({ id: d.item.id, ...r })
  }

  function onUp(e: PointerEvent) {
    const d = drag.current
    end()
    setPreview(null)
    if (!d?.live) return
    swallowClick.current = true
    window.setTimeout(() => (swallowClick.current = false), 0)
    const r = resultFor(d, e.clientX, e.clientY)
    const unchanged =
      r.startsAt === d.item.startsAt &&
      r.durationMin === (d.item.durationMin ?? r.durationMin)
    if (unchanged) return
    setLanded({ row: rowKey(d.item), fromId: d.item.id, arrived: false, ...r })
    onDrop(d.item, { mode: d.mode, ...r })
  }

  function onCancel() {
    end()
    setPreview(null)
  }

  function onPointerDown(
    e: React.PointerEvent,
    item: TimelineItem,
    dayIndex: number,
    mode: DragMode,
  ) {
    if (item.source === 'milestone') return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    end()
    const touch = e.pointerType !== 'mouse'
    const d: Drag = {
      item,
      mode,
      dayIndex,
      x0: e.clientX,
      y0: e.clientY,
      live: false,
      touch,
      timer: null,
    }
    if (touch) {
      d.timer = window.setTimeout(() => {
        if (drag.current !== d) return
        d.live = true
        if ('vibrate' in navigator) navigator.vibrate(10)
        setPreview({
          id: item.id,
          startsAt: item.startsAt,
          durationMin: item.durationMin ?? 30,
        })
      }, TOUCH_HOLD_MS)
    }
    drag.current = d
    window.addEventListener('pointermove', listeners.move)
    window.addEventListener('pointerup', listeners.up)
    window.addEventListener('pointercancel', listeners.cancel)
    window.addEventListener('touchmove', listeners.hold, { passive: false })
  }

  /* Window listeners must be the same functions on removal as on add, but
     the handlers close over this render's props. So the window gets stable
     wrappers that call whatever the latest render's handlers are. */
  const latest = useRef({ onMove, onUp, onCancel })
  latest.current = { onMove, onUp, onCancel }
  const [listeners] = useState(() => ({
    move: (e: PointerEvent) => latest.current.onMove(e),
    up: (e: PointerEvent) => latest.current.onUp(e),
    cancel: () => latest.current.onCancel(),
    /* Once a block is picked up by a finger the page must not scroll under
       it. Only a non-passive touchmove can say so; pointer events cannot. */
    hold: (e: TouchEvent) => {
      if (drag.current?.live) e.preventDefault()
    },
  }))

  useEffect(() => () => latest.current.onCancel(), [])

  /* Where each item is drawn: under the finger while dragging, where it was
     dropped until the write comes back, otherwise where the data says. */
  const shown = items.map((item) => {
    if (preview && preview.id === item.id) {
      return {
        ...item,
        startsAt: preview.startsAt,
        durationMin: preview.durationMin,
      }
    }
    if (landed && !landed.arrived && landed.fromId === item.id) {
      return {
        ...item,
        startsAt: landed.startsAt,
        durationMin: landed.durationMin,
      }
    }
    return item
  })

  return (
    <div className="glass overflow-hidden rounded-[22px]">
      <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-lift/[0.06]">
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

      <div ref={gridRef} className="grid grid-cols-[52px_repeat(7,1fr)]">
        <div>
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="relative border-b border-lift/[0.04]"
              style={{ height: ROW_HEIGHT }}
            >
              <span className="absolute -top-[7px] right-2 font-mono text-[10px] text-ink-700">
                {String(hour).padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>

        {days.map((day, dayIndex) => {
          const dayStart = startOfDay(day).getTime()
          const dayEnd = addDays(startOfDay(day), 1).getTime()
          const ofDay = shown.filter(
            (i) => i.startsAt >= dayStart && i.startsAt < dayEnd,
          )

          return (
            <div
              key={day.getTime()}
              className="relative border-l border-lift/[0.04]"
            >
              {HOURS.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  aria-label={`Add an event at ${String(hour).padStart(2, '0')}:00 on ${day.toDateString()}`}
                  onClick={() =>
                    onCreateAt(new Date(day).setHours(hour, 0, 0, 0))
                  }
                  className="block w-full border-b border-lift/[0.04] transition-colors hover:bg-lift/[0.03]"
                  style={{ height: ROW_HEIGHT }}
                />
              ))}

              {ofDay.map((item) => {
                const { top, height } = placement(item)
                const dragging = preview?.id === item.id
                const justLanded =
                  landed !== null &&
                  !dragging &&
                  rowKey(item) === landed.row &&
                  item.startsAt === landed.startsAt
                const movable = item.source !== 'milestone'
                const project =
                  item.projectId !== undefined
                    ? projectName(item.projectId)
                    : undefined
                return (
                  <button
                    key={item.id}
                    type="button"
                    onPointerDown={(e) =>
                      onPointerDown(e, item, dayIndex, 'move')
                    }
                    onClick={() => {
                      if (swallowClick.current) return
                      onSelect(item)
                    }}
                    /* The browser's own drag-a-button ghost would fight ours. */
                    onDragStart={(e) => e.preventDefault()}
                    className={[
                      'absolute inset-x-1 overflow-hidden rounded-[7px] px-2 py-1 text-left select-none',
                      movable ? 'cursor-grab touch-pan-y' : '',
                      dragging
                        ? 'z-20 cursor-grabbing shadow-[0_8px_24px_-6px_var(--color-sink)] ring-2 ring-lav-300/60'
                        : '',
                      justLanded ? 'motion-pop' : '',
                      /* A quest is something you chose for today; an event is
                         something the day already contained. The accent marks
                         the first, per the design voice. */
                      item.source === 'task'
                        ? 'bg-lav-300/15 ring-1 ring-lav-300/30'
                        : item.source === 'milestone'
                          ? /* No fill and nothing to press: a due day is read,
                               not opened. Its goal's colour if it has one. */
                            'cursor-default border-l-2 border-(--area) bg-transparent'
                          : 'bg-lift/[0.07] ring-1 ring-lift/10',
                    ].join(' ')}
                    style={
                      item.source === 'milestone'
                        ? { top, height, ...areaVars(item.area ?? 'life') }
                        : { top, height }
                    }
                  >
                    <span className="block truncate text-[11.5px] text-foreground">
                      {item.source === 'milestone' ? '◆ ' : ''}
                      {item.title}
                    </span>
                    {/* A milestone due at local midnight is an all-day due
                        date, not a 00:00 appointment, so it says no time. */}
                    {item.source === 'milestone' &&
                    new Date(item.startsAt).getHours() === 0 &&
                    new Date(item.startsAt).getMinutes() === 0 ? null : (
                      <span className="block truncate font-mono text-[10px] text-ink-600">
                        {clock(item.startsAt)}
                        {/* Start–end, not start and minutes (R5): while
                            dragging, the end is the thing being decided. */}
                        {item.source !== 'milestone'
                          ? `–${clock(item.startsAt + (item.durationMin ?? 30) * 60_000)}`
                          : ''}
                        {project ? ` · ${project}` : ''}
                      </span>
                    )}
                    {movable ? (
                      /* The bottom edge is the length. Its own pointerdown,
                         so a grab there resizes instead of moving. */
                      <span
                        aria-hidden
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          onPointerDown(e, item, dayIndex, 'resize')
                        }}
                        className="absolute inset-x-0 bottom-0 h-[7px] cursor-ns-resize touch-pan-y"
                      />
                    ) : null}
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
