import { useEffect, useRef, useState } from 'react'

import { areaVars } from '@/lib/areas'
import { dragResult, snap } from '@/lib/calendarDrag'
import type { DragMode } from '@/lib/calendarDrag'
import { parseOccurrenceId } from '@/lib/recurrence'
import type { TimelineItem } from '@/lib/timeline'
import { addDays } from '@/lib/weeks'

/* PLAN.md §4 phase 5. A column per day — seven for a week, one on a phone —
   with events and scheduled tasks in the same grid, because a day does not
   care which table a thing came from.
 
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
function minuteClock(min: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`
}

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
      ? 20
      : Math.max(((item.durationMin ?? 30) / 60) * ROW_HEIGHT, 20)
  return { top: Math.max(fromTop, 0), height }
}

export function WeekGrid({
  weekStart,
  dayCount = 7,
  items,
  onSelect,
  onCreateAt,
  onDrop,
  fresh = null,
  projectName,
}: {
  /** The first day drawn. */
  weekStart: Date
  /** 7 for a week, 1 for a day on a phone (24 Sep). */
  dayCount?: number
  items: Array<TimelineItem>
  onSelect: (item: TimelineItem) => void
  /** A click on empty time, or a drag across it: the new event's start
      and, when dragged, its end. */
  onCreateAt: (startsAt: number, endsAt?: number) => void
  /** R5: a block was dragged somewhere new. Writes straight away. */
  onDrop: (item: TimelineItem, result: DropResult) => void
  /** An event just made in the dialog: held back while the dialog shows
      its tick, then poured into its slot once it closes. */
  fresh?: { eventId: string; phase: 'waiting' | 'landed' } | null
  projectName: (projectId: string) => string | undefined
}) {
  const days = Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i))
  const columns = {
    gridTemplateColumns: `${HOUR_COLUMN}px repeat(${dayCount}, minmax(0, 1fr))`,
  }

  /* The clock, to the minute: the now line moves, and today changes at
     midnight without a reload. */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(t)
  }, [])
  const todayKey = startOfDay(new Date(now)).getTime()
  const nowDate = new Date(now)
  const nowMinute = nowDate.getHours() * 60 + nowDate.getMinutes()
  const nowTop = ((nowMinute - FIRST_HOUR * 60) / 60) * ROW_HEIGHT
  const showsToday = days.some((d) => startOfDay(d).getTime() === todayKey)

  /* Open where the day is: the now line a third of the way down the screen,
     once per visit — not every minute, which would fight your scrolling. */
  const nowRef = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || !nowRef.current) return
    scrolled.current = true
    const r = nowRef.current.getBoundingClientRect()
    const target = window.scrollY + r.top - window.innerHeight / 3
    if (target > 0) window.scrollTo({ top: target, behavior: 'instant' })
  })

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

  /* Drag down empty time to make an event that long (24 Sep: clicking only
     ever gave a round hour and an hour's length). Minutes from midnight. */
  const [creating, setCreating] = useState<{
    dayIndex: number
    from: number
    to: number
  } | null>(null)
  const createDrag = useRef<{
    dayIndex: number
    top: number
    from: number
    y0: number
    moved: boolean
  } | null>(null)
  /* A mouse click on empty time is handled by the pointer path below; the
     hour buttons' own click is then only for a keyboard or a finger. */
  const mouseCreate = useRef(false)

  function minuteAt(top: number, y: number) {
    return FIRST_HOUR * 60 + ((y - top) / ROW_HEIGHT) * 60
  }

  function onCreateMove(e: PointerEvent) {
    const c = createDrag.current
    if (!c) return
    if (!c.moved && Math.abs(e.clientY - c.y0) < MOUSE_SLOP_PX) return
    c.moved = true
    const at = Math.min(Math.max(snap(minuteAt(c.top, e.clientY)), 0), 24 * 60)
    setCreating({
      dayIndex: c.dayIndex,
      from: Math.min(c.from, at),
      to: Math.max(c.from, at),
    })
  }

  function onCreateUp(e: PointerEvent) {
    const c = createDrag.current
    createDrag.current = null
    window.removeEventListener('pointermove', listeners.createMove)
    window.removeEventListener('pointerup', listeners.createUp)
    setCreating(null)
    if (!c) return
    const day = startOfDay(days[c.dayIndex])
    const at = (min: number) => new Date(day).setHours(0, min, 0, 0)
    if (!c.moved) {
      /* A click: the quarter-hour it landed in, for the usual hour. */
      const start = Math.floor(minuteAt(c.top, c.y0) / 15) * 15
      onCreateAt(at(start))
      return
    }
    const release = Math.min(
      Math.max(snap(minuteAt(c.top, e.clientY)), 0),
      24 * 60,
    )
    const from = Math.min(c.from, release)
    const to = Math.max(c.from, release, from + 15)
    onCreateAt(at(from), at(to))
  }

  function onColumnPointerDown(e: React.PointerEvent, dayIndex: number) {
    mouseCreate.current = e.pointerType === 'mouse'
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-block]')) return
    const top = e.currentTarget.getBoundingClientRect().top
    createDrag.current = {
      dayIndex,
      top,
      from: Math.floor(minuteAt(top, e.clientY) / 15) * 15,
      y0: e.clientY,
      moved: false,
    }
    window.addEventListener('pointermove', listeners.createMove)
    window.addEventListener('pointerup', listeners.createUp)
  }

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
      ? (grid.getBoundingClientRect().width - HOUR_COLUMN) / dayCount
      : 1
    const dxDays =
      d.mode === 'move'
        ? Math.min(
            Math.max(Math.round((x - d.x0) / colWidth), -d.dayIndex),
            dayCount - 1 - d.dayIndex,
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
  const latest = useRef({ onMove, onUp, onCancel, onCreateMove, onCreateUp })
  latest.current = { onMove, onUp, onCancel, onCreateMove, onCreateUp }
  const [listeners] = useState(() => ({
    move: (e: PointerEvent) => latest.current.onMove(e),
    up: (e: PointerEvent) => latest.current.onUp(e),
    cancel: () => latest.current.onCancel(),
    createMove: (e: PointerEvent) => latest.current.onCreateMove(e),
    createUp: (e: PointerEvent) => latest.current.onCreateUp(e),
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

  /* A milestone due at midnight is due on a day, not at an hour. Drawn in a
     strip under the day names rather than pinned to the 06:00 row, where it
     looked like an appointment nobody made. */
  const allDay = (i: TimelineItem) => {
    if (i.source !== 'milestone') return false
    const d = new Date(i.startsAt)
    return d.getHours() === 0 && d.getMinutes() === 0
  }
  const timed = shown.filter((i) => !allDay(i))
  const untimed = shown.filter(allDay)

  return (
    /* select-none: nothing on the grid is text to copy.

       glass-still, not glass: this panel is taller than the screen, and
       Chrome drew a stray pale band inside its backdrop blur (24 Sep, seen
       twice, in different places). What is behind it is the ambient field,
       already blurred 120px — blurring it again changed nothing you could
       see, so the panel keeps the fill and edge and drops the filter. */
    <div className="glass-still overflow-hidden rounded-[22px] select-none">
      <div className="grid border-b border-lift/[0.08]" style={columns}>
        <div />
        {days.map((day) => {
          const isToday = startOfDay(day).getTime() === todayKey
          return (
            <div
              key={day.getTime()}
              className={`flex flex-col items-center gap-1 px-2 py-2.5 ${
                isToday ? 'bg-lav-300/[0.05]' : ''
              }`}
            >
              <div className={`label-caps ${isToday ? 'text-lav-300' : ''}`}>
                {day.toLocaleDateString(undefined, { weekday: 'short' })}
              </div>
              {/* Lavender is reserved for live and focus things, and today is
                  the only live day in a week. */}
              <div
                className={`grid size-8 place-items-center rounded-full font-mono text-[15px] ${
                  isToday
                    ? 'bg-lav-300/20 text-lav-100 ring-1 ring-lav-300/50'
                    : 'text-ink-400'
                }`}
              >
                {day.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {untimed.length > 0 ? (
        <div className="grid border-b border-lift/[0.08]" style={columns}>
          <div className="flex items-center justify-end pr-2 font-mono text-[9px] tracking-[0.08em] text-ink-600 uppercase">
            due
          </div>
          {days.map((day) => {
            const dayStart = startOfDay(day).getTime()
            const dayEnd = addDays(startOfDay(day), 1).getTime()
            return (
              <div
                key={day.getTime()}
                className={`flex min-w-0 flex-col gap-1 border-l border-lift/[0.06] px-1 py-1.5 ${
                  dayStart === todayKey ? 'bg-lav-300/[0.035]' : ''
                }`}
              >
                {untimed
                  .filter((i) => i.startsAt >= dayStart && i.startsAt < dayEnd)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelect(item)}
                      title={
                        item.detail
                          ? `${item.title} — ${item.detail}`
                          : item.title
                      }
                      style={areaVars(item.area ?? 'life')}
                      className="motion-press truncate rounded-[3px] border-l-2 border-(--area) bg-(--area)/14 px-1.5 py-0.5 text-left text-[11px] text-foreground transition-colors hover:bg-(--area)/24"
                    >
                      ◆ {item.title}
                    </button>
                  ))}
              </div>
            )
          })}
        </div>
      ) : null}

      <div ref={gridRef} className="grid" style={columns}>
        <div className="relative">
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="relative border-b border-lift/[0.07]"
              style={{ height: ROW_HEIGHT }}
            >
              <span
                /* The first label sits inside its row: above it is the DUE
                   strip or the day names, and it overlapped them. */
                className={`absolute right-2 font-mono text-[10px] text-ink-600 ${
                  hour === FIRST_HOUR ? 'top-0.5' : '-top-[7px]'
                }`}
              >
                {String(hour).padStart(2, '0')}
              </span>
            </div>
          ))}
          {showsToday && nowTop >= 0 ? (
            /* The time now, where the line crosses the hours. */
            <span
              className="absolute right-1 z-10 -translate-y-1/2 rounded-full bg-lav-300 px-1.5 py-px font-mono text-[9.5px] font-medium text-background"
              style={{ top: nowTop }}
            >
              {minuteClock(nowMinute)}
            </span>
          ) : null}
        </div>

        {days.map((day, dayIndex) => {
          const dayStart = startOfDay(day).getTime()
          const dayEnd = addDays(startOfDay(day), 1).getTime()
          const ofDay = timed.filter(
            (i) => i.startsAt >= dayStart && i.startsAt < dayEnd,
          )

          return (
            <div
              key={day.getTime()}
              onPointerDown={(e) => onColumnPointerDown(e, dayIndex)}
              className={`relative border-l border-lift/[0.06] ${
                dayStart === todayKey ? 'bg-lav-300/[0.035]' : ''
              }`}
            >
              {dayStart === todayKey && nowTop >= 0 ? (
                /* Now. The one live line on the page, so lavender. */
                <div
                  ref={nowRef}
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-20 h-[2px] -translate-y-1/2 bg-lav-300 shadow-[0_0_8px_var(--color-lav-300)]"
                  style={{ top: nowTop }}
                >
                  <span className="absolute -top-[4px] -left-[5px] size-[10px] rounded-full bg-lav-300" />
                </div>
              ) : null}
              {HOURS.map((hour) => (
                <button
                  key={hour}
                  type="button"
                  aria-label={`Add an event at ${String(hour).padStart(2, '0')}:00 on ${day.toDateString()}`}
                  onClick={(e) => {
                    /* detail 0 is a keyboard press, which always counts. */
                    if (e.detail !== 0 && mouseCreate.current) return
                    onCreateAt(new Date(day).setHours(hour, 0, 0, 0))
                  }}
                  className="relative block w-full border-b border-lift/[0.07] transition-colors hover:bg-lift/[0.04]"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* The half hour, fainter: enough to place 9:30 by eye. */}
                  <span className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-lift/[0.04]" />
                </button>
              ))}

              {creating?.dayIndex === dayIndex ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-1 z-10 rounded-[7px] border border-dashed border-lav-300/60 bg-lav-300/10 px-2 py-1"
                  style={{
                    top: Math.max(
                      ((creating.from - FIRST_HOUR * 60) / 60) * ROW_HEIGHT,
                      0,
                    ),
                    height: Math.max(
                      ((creating.to - creating.from) / 60) * ROW_HEIGHT,
                      ROW_HEIGHT / 4,
                    ),
                  }}
                >
                  <span className="font-mono text-[10px] text-lav-300">
                    {minuteClock(creating.from)}–{minuteClock(creating.to)}
                  </span>
                </div>
              ) : null}

              {ofDay.map((item) => {
                const { top, height } = placement(item)
                const dragging = preview?.id === item.id
                const justLanded =
                  landed !== null &&
                  !dragging &&
                  rowKey(item) === landed.row &&
                  item.startsAt === landed.startsAt
                const movable = item.source !== 'milestone'
                const isFresh =
                  fresh !== null &&
                  item.source === 'event' &&
                  parseOccurrenceId(item.id)?.eventId === fresh.eventId
                const project =
                  item.projectId !== undefined
                    ? projectName(item.projectId)
                    : undefined
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-block
                    title={
                      item.source === 'milestone' && item.detail
                        ? `${item.title} — ${item.detail}`
                        : undefined
                    }
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
                      /* flex-col from the top: a button centres its
                         content, and a four-hour block read as empty. */
                      'absolute inset-x-1 flex flex-col justify-start overflow-hidden text-left transition-colors',
                      item.source === 'milestone'
                        ? 'rounded-r-[4px] px-1.5'
                        : 'rounded-[3px_7px_7px_3px] border-l-[3px] border-(--area) px-2 py-1',
                      movable ? 'cursor-grab touch-pan-y' : '',
                      dragging
                        ? 'z-20 cursor-grabbing shadow-[0_8px_24px_-6px_var(--color-sink)] ring-2 ring-lav-300/60'
                        : '',
                      justLanded ? 'motion-pop' : '',
                      /* A new event arrives (24 Sep: "add animation and
                         make it cool"): hidden behind the dialog until it
                         closes, then poured down into its slot from the top
                         edge, with a ring of its colour and a band of light
                         across it. A repeating one cascades, a day apart. */
                      isFresh && fresh.phase === 'waiting' ? 'opacity-0' : '',
                      isFresh && fresh.phase === 'landed'
                        ? 'motion-event-born z-10'
                        : '',
                      /* A quest is something you chose for today; an event is
                         something the day already contained. The accent marks
                         the first, per the design voice. */
                      /* Colour is the area (24 Sep: "grey slab on a grey
                         grid"). A quest you chose for today also carries the
                         lavender ring — the accent marks what you picked. */
                      item.source === 'task'
                        ? 'bg-(--area)/16 ring-1 ring-lav-300/40 hover:bg-(--area)/24'
                        : item.source === 'milestone'
                          ? /* A marker, not a block: a square edge in its
                               goal's colour. Pressing it opens the goal. */
                            'cursor-pointer border-l-2 border-(--area) bg-(--area)/[0.06] hover:bg-(--area)/14'
                          : 'bg-(--area)/16 hover:bg-(--area)/24',
                    ].join(' ')}
                    style={{
                      top,
                      height,
                      ...(isFresh
                        ? { animationDelay: `${dayIndex * 70}ms` }
                        : {}),
                      /* No area: the neutral grey, so it is still a block. */
                      ...(item.area
                        ? areaVars(item.area)
                        : ({
                            '--area': 'var(--color-neutral-400)',
                            '--area-ink': 'var(--color-neutral-400)',
                          } as React.CSSProperties)),
                    }}
                  >
                    <span
                      className={`block truncate text-[11.5px] text-foreground ${
                        item.source === 'milestone'
                          ? 'leading-[20px]'
                          : 'leading-[16px] font-medium'
                      }`}
                    >
                      {item.source === 'milestone' ? '◆ ' : ''}
                      {item.title}
                      {/* One line: a milestone is 18px tall, and its time on
                          a second line was cut in half (24 Sep). */}
                      {item.source === 'milestone' ? (
                        <span className="ml-1.5 font-mono text-[10px] text-ink-600">
                          {clock(item.startsAt)}
                        </span>
                      ) : null}
                    </span>
                    {item.source === 'milestone' ? null : (
                      <span className="block truncate font-mono text-[10px] text-ink-400">
                        {clock(item.startsAt)}
                        {/* Start–end, not start and minutes (R5): while
                            dragging, the end is the thing being decided. */}
                        {`–${clock(item.startsAt + (item.durationMin ?? 30) * 60_000)}`}
                        {project ? ` · ${project}` : ''}
                      </span>
                    )}
                    {isFresh && fresh.phase === 'landed' ? (
                      <span
                        aria-hidden
                        style={{ animationDelay: `${dayIndex * 70 + 260}ms` }}
                        className="motion-sweep pointer-events-none absolute inset-y-0 left-0 w-1/2"
                      />
                    ) : null}
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
