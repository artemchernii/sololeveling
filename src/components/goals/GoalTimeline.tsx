import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Skeleton } from '@/components/Skeleton'
import { areaVars } from '@/lib/areas'
import { failureMessage } from '@/lib/convex-errors'
import { shortDate } from '@/lib/format'
import { goalTimeline } from '@/lib/goal-timeline'
import type { TimelineNode } from '@/lib/goal-timeline'
import { gapDate, layoutTimeline, todayBefore } from '@/lib/timeline-layout'
import { localToday } from '@/lib/today'

/* A goal's timeline, placed by date (24 Sep: "with dates").

   0 — 1 — 2 — goal, each step where its day falls between the day the goal
   was made and its deadline, with today on the line. Everything about the
   steps happens here, on the line itself, instead of in a separate editor:

   - a tap on a dot reaches the step or takes it back — one tap, like
     ticking a task, and the segment into it fills in the goal's colour;
   - a tap on a title opens a small editor for that step;
   - a + in every gap adds a step right there, dated halfway between.

   Filled segments are per step, never a fraction of the line: nothing here
   says "2 of 4" (PLAN.md §1, goal-timeline.ts). Horizontal from md, and a
   vertical list on a phone, where a sideways line would be a scroll inside a
   scroll. */

/** Room between two neighbours: a caption's width plus the + between. */
const MIN_STEP = 150
/** Room at each end for a caption centred on its node. */
const PAD = 70
const LINE_Y = 36

type Open =
  | { kind: 'add'; gap: number; anchor: HTMLElement }
  | { kind: 'edit'; id: string; anchor: HTMLElement }

type Milestone = Extract<TimelineNode, { kind: 'milestone' }>

export function GoalTimeline({ goal }: { goal: Doc<'goals'> }) {
  const milestones = useQuery(api.milestones.listByGoal, { goalId: goal._id })
  const setReached = useMutation(api.milestones.setReached)
  const [open, setOpen] = useState<Open | null>(null)
  /* The step just reached by a tap, for as long as its pop and ring last. */
  const [justReached, setJustReached] = useState<string | null>(null)

  /* Steps that arrived while the card was on screen pop in; the ones that
     were there when it loaded simply are (styles.css §3d.1). */
  const known = useRef<Set<string> | null>(null)
  const born = useRef(new Set<string>())
  if (milestones !== undefined) {
    if (known.current === null) {
      known.current = new Set(milestones.map((m) => m._id))
    } else {
      for (const m of milestones) {
        if (!known.current.has(m._id)) {
          known.current.add(m._id)
          born.current.add(m._id)
        }
      }
    }
  }

  useEffect(() => {
    if (justReached === null) return
    const t = window.setTimeout(() => setJustReached(null), 700)
    return () => window.clearTimeout(t)
  }, [justReached])

  if (milestones === undefined) {
    return <Skeleton className="h-[96px] w-full" />
  }

  const nodes = goalTimeline(goal, milestones)
  const today = localToday()

  function toggle(node: Milestone) {
    const reached = node.state !== 'reached'
    if (reached) setJustReached(node.id)
    void setReached({
      milestoneId: node.id as Id<'milestones'>,
      reached,
    })
  }

  const shared = {
    nodes,
    today,
    born: born.current,
    justReached,
    onToggle: toggle,
    onAdd: (gap: number, anchor: HTMLElement) =>
      setOpen({ kind: 'add', gap, anchor }),
    onEdit: (id: string, anchor: HTMLElement) =>
      setOpen({ kind: 'edit', id, anchor }),
  }

  const editing =
    open?.kind === 'edit'
      ? nodes.find(
          (n): n is Milestone => n.kind === 'milestone' && n.id === open.id,
        )
      : undefined

  return (
    <>
      <Line {...shared} />
      <List {...shared} />

      {open?.kind === 'add' ? (
        <Popover
          anchor={open.anchor}
          area={goal.area}
          label="Add a step"
          onClose={() => setOpen(null)}
        >
          <AddStep
            goalId={goal._id}
            after={afterFor(nodes, open.gap)}
            initialDate={gapDate(nodes, open.gap)}
            onDone={() => setOpen(null)}
          />
        </Popover>
      ) : null}

      {editing ? (
        <Popover
          anchor={open!.anchor}
          area={goal.area}
          label={`Edit ${editing.title}`}
          onClose={() => setOpen(null)}
        >
          <EditStep
            key={editing.id}
            node={editing}
            isFirst={editing.number === 1}
            isLast={editing.number === milestones.length}
            onReached={() => setJustReached(editing.id)}
            onDone={() => setOpen(null)}
          />
        </Popover>
      ) : null}
    </>
  )
}

/* What `milestones.create({ after })` wants for a gap: null before the
   first step, otherwise the step on the gap's left. */
function afterFor(
  nodes: Array<TimelineNode>,
  gap: number,
): Id<'milestones'> | null {
  const left = nodes[gap]
  return left.kind === 'milestone' ? (left.id as Id<'milestones'>) : null
}

function dateOf(node: TimelineNode): string | undefined {
  if (node.kind === 'start') return node.date
  if (node.kind === 'end') return node.deadline
  return node.dueDate
}

type Shared = {
  nodes: Array<TimelineNode>
  today: string
  born: Set<string>
  justReached: string | null
  onToggle: (node: Milestone) => void
  onAdd: (gap: number, anchor: HTMLElement) => void
  onEdit: (id: string, anchor: HTMLElement) => void
}

function keyOf(node: TimelineNode): string {
  return node.kind === 'milestone' ? node.id : node.kind
}

/* The segment into a node is filled once that node is a reached step. The
   segment into the goal never fills here — reaching the goal is its own act,
   on the card. */
function segmentFilled(nodes: Array<TimelineNode>, gap: number): boolean {
  const right = nodes[gap + 1]
  return right.kind === 'milestone' && right.state === 'reached'
}

/* ---------- md and up: the line ---------- */

function Line({
  nodes,
  today,
  born,
  justReached,
  onToggle,
  onAdd,
  onEdit,
}: Shared) {
  const scroller = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [fade, setFade] = useState({ left: false, right: false })
  const opened = useRef(false)

  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const layout =
    width > 0
      ? layoutTimeline(nodes, {
          width,
          minStep: MIN_STEP,
          pad: PAD,
          today,
        })
      : null

  function measureFade() {
    const el = scroller.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setFade((f) => (f.left === left && f.right === right ? f : { left, right }))
  }

  /* Opens at the next step, centred, when the line is wider than the card.
     Once: after that the scroll is his. */
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || layout === null) return
    if (!opened.current) {
      opened.current = true
      const next = nodes.findIndex(
        (n) => n.kind === 'milestone' && n.state === 'next',
      )
      const x = next === -1 ? layout.todayX : layout.xs[next]
      if (x !== null && layout.width > el.clientWidth) {
        el.scrollLeft = x - el.clientWidth / 2
      }
    }
    measureFade()
  })

  const mask = `linear-gradient(to right, ${fade.left ? 'transparent' : '#000'} 0, #000 48px, #000 calc(100% - 48px), ${fade.right ? 'transparent' : '#000'} 100%)`

  return (
    <div
      ref={scroller}
      onScroll={measureFade}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      className="hidden overflow-x-auto overflow-y-hidden [scrollbar-width:none] md:block"
    >
      {layout === null ? (
        <div className="h-[100px]" />
      ) : (
        <div className="relative h-[100px]" style={{ width: layout.width }}>
          {/* The line under everything, then each segment's fill. */}
          <span
            aria-hidden
            className="absolute h-px bg-lift/12"
            style={{
              top: LINE_Y,
              left: layout.xs[0],
              width: layout.xs[layout.xs.length - 1] - layout.xs[0],
            }}
          />
          {nodes.slice(0, -1).map((node, i) => (
            <span
              key={`seg-${keyOf(node)}`}
              aria-hidden
              className="absolute h-[2px] origin-left rounded-full bg-(--area)"
              style={{
                top: LINE_Y - 0.5,
                left: layout.xs[i],
                width: layout.xs[i + 1] - layout.xs[i],
                transform: `scaleX(${segmentFilled(nodes, i) ? 1 : 0})`,
                transition: `transform var(--motion-linger) var(--motion-ease), left var(--motion-base) var(--motion-ease), width var(--motion-base) var(--motion-ease)`,
                boxShadow: '0 0 10px -1px var(--area)',
              }}
            />
          ))}

          {layout.todayX !== null ? (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 flex -translate-x-1/2 flex-col items-center"
              style={{
                left: layout.todayX,
                transition: 'left var(--motion-base) var(--motion-ease)',
              }}
            >
              <span className="font-mono text-[9.5px] tracking-[0.14em] text-lav-300 uppercase">
                today
              </span>
              <span className="mt-0.5 h-[34px] w-px bg-lav-300/70 shadow-[0_0_8px_var(--color-accent)]" />
            </div>
          ) : null}

          {/* A + in every gap. */}
          {nodes.slice(0, -1).map((node, i) => (
            <button
              key={`add-${keyOf(node)}`}
              type="button"
              aria-label={addLabel(nodes, i)}
              title="Add a step here"
              onClick={(e) => onAdd(i, e.currentTarget)}
              className="motion-press absolute grid size-[20px] -translate-1/2 place-items-center rounded-full bg-background text-ink-600 opacity-70 ring-1 ring-lift/15 hover:text-lav-200 hover:opacity-100 hover:ring-lav-300/60 focus-visible:opacity-100"
              style={{
                top: LINE_Y,
                left: (layout.xs[i] + layout.xs[i + 1]) / 2,
                transition:
                  'left var(--motion-base) var(--motion-ease), opacity var(--motion-fast)',
              }}
            >
              <Plus className="size-3" />
            </button>
          ))}

          {nodes.map((node, i) => (
            <div
              key={keyOf(node)}
              className="absolute top-0 flex w-[130px] -translate-x-1/2 flex-col items-center"
              style={{
                left: layout.xs[i],
                transition: 'left var(--motion-base) var(--motion-ease)',
              }}
            >
              <div
                className={`mt-[24px] ${node.kind === 'milestone' && born.has(node.id) ? 'motion-pop' : ''}`}
              >
                <Dot
                  node={node}
                  reaching={
                    node.kind === 'milestone' && justReached === node.id
                  }
                  onToggle={onToggle}
                />
              </div>
              <Caption node={node} today={today} onEdit={onEdit} centred />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function addLabel(nodes: Array<TimelineNode>, gap: number): string {
  const left = nodes[gap]
  return left.kind === 'milestone'
    ? `Add a step after ${left.title}`
    : 'Add a first step'
}

/* ---------- a phone: the list ---------- */

function List({
  nodes,
  today,
  born,
  justReached,
  onToggle,
  onAdd,
  onEdit,
}: Shared) {
  const todayAt = todayBefore(nodes, today)

  return (
    <ol className="flex flex-col md:hidden">
      {nodes.map((node, i) => (
        <li key={keyOf(node)} className="flex flex-col">
          <div
            className={`flex items-stretch gap-3 ${node.kind === 'milestone' && born.has(node.id) ? 'motion-arrive' : ''}`}
          >
            {/* The dot, and the rail carried on under its caption. */}
            <div className="flex w-[24px] shrink-0 flex-col items-center">
              <div
                className={
                  node.kind === 'milestone' && born.has(node.id)
                    ? 'motion-pop'
                    : ''
                }
              >
                <Dot
                  node={node}
                  reaching={
                    node.kind === 'milestone' && justReached === node.id
                  }
                  onToggle={onToggle}
                />
              </div>
              {i < nodes.length - 1 ? (
                <Rail filled={segmentFilled(nodes, i)} />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 pb-2">
              <Caption node={node} today={today} onEdit={onEdit} />
            </div>
          </div>

          {i < nodes.length - 1 ? (
            <div className="flex min-h-9 items-stretch gap-3">
              <div className="relative grid w-[24px] shrink-0 place-items-center">
                <span className="absolute inset-y-0 flex">
                  <Rail filled={segmentFilled(nodes, i)} late />
                </span>
                <button
                  type="button"
                  aria-label={addLabel(nodes, i)}
                  onClick={(e) => onAdd(i, e.currentTarget)}
                  className="motion-press relative grid size-[20px] place-items-center rounded-full bg-background text-ink-600 ring-1 ring-lift/15 active:text-lav-200"
                >
                  <Plus className="size-3" />
                </button>
              </div>
              {todayAt === i + 1 ? <TodayRule /> : null}
            </div>
          ) : todayAt === nodes.length ? (
            <div className="flex min-h-9 items-center pl-[36px]">
              <TodayRule />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

/* A stretch of the phone's rail: the line, and the goal's colour running
   down it once the step below is reached. The second half of a segment
   waits for the first, so the fill reads as one stroke. */
function Rail({ filled, late = false }: { filled: boolean; late?: boolean }) {
  return (
    <span aria-hidden className="relative flex w-[2px] flex-1 justify-center">
      <span className="absolute inset-y-0 w-px bg-lift/12" />
      <span
        className="absolute inset-0 origin-top rounded-full bg-(--area)"
        style={{
          transform: `scaleY(${filled ? 1 : 0})`,
          transition: `transform var(--motion-base) var(--motion-ease) ${late && filled ? 'var(--motion-base)' : '0ms'}`,
        }}
      />
    </span>
  )
}

function TodayRule() {
  return (
    <span aria-label="Today" className="flex flex-1 items-center gap-2">
      <span className="font-mono text-[9.5px] tracking-[0.14em] text-lav-300 uppercase">
        today
      </span>
      <span className="h-px flex-1 bg-lav-300/60 shadow-[0_0_8px_var(--color-accent)]" />
    </span>
  )
}

/* ---------- a node ---------- */

function Dot({
  node,
  reaching,
  onToggle,
}: {
  node: TimelineNode
  reaching: boolean
  onToggle: (node: Milestone) => void
}) {
  const base =
    'grid size-[24px] shrink-0 place-items-center rounded-full font-mono text-[10.5px]'
  if (node.kind === 'start') {
    return (
      <span
        className={`${base} bg-background text-ink-500 ring-1 ring-lift/15`}
      >
        0
      </span>
    )
  }
  if (node.kind === 'end') {
    return (
      <span
        className={`${base} bg-background text-(--area) ring-1 ring-(--area)/50`}
      >
        ◆
      </span>
    )
  }
  const tone =
    node.state === 'reached'
      ? 'bg-(--area) text-background'
      : node.state === 'next'
        ? /* The one live step: lit, not just outlined (24 Sep). */
          'bg-background text-lav-200 ring-1 ring-lav-300 shadow-[0_0_14px_-3px_var(--color-accent)]'
        : 'bg-background text-ink-500 ring-1 ring-lift/15'
  /* A reach pops the dot and sends one ring of the goal's colour out
     (styles.css pop + pulse-once), once — taking it back does neither. */
  const reach: CSSProperties | undefined = reaching
    ? {
        animation:
          'pop var(--motion-base) var(--motion-ease) both, pulse-once var(--motion-linger) var(--motion-ease) both',
      }
    : undefined
  return (
    <button
      type="button"
      onClick={() => onToggle(node)}
      aria-pressed={node.state === 'reached'}
      aria-label={`${node.title}: ${node.state === 'reached' ? 'reached — tap to undo' : 'tap when reached'}`}
      style={reach}
      className={`${base} ${tone} motion-press transition-colors hover:ring-lav-500`}
    >
      {node.state === 'reached' ? (
        <Check className="size-3.5" strokeWidth={2.5} />
      ) : (
        node.number
      )}
    </button>
  )
}

function Caption({
  node,
  today,
  onEdit,
  centred = false,
}: {
  node: TimelineNode
  today: string
  onEdit: (id: string, anchor: HTMLElement) => void
  centred?: boolean
}) {
  const align = centred ? 'items-center text-center' : 'items-start pt-[3px]'
  if (node.kind !== 'milestone') {
    const date = dateOf(node)
    return (
      <div
        className={`mt-2 flex w-full flex-col ${align} ${centred ? '' : 'mt-0'}`}
      >
        <span className="label-caps">
          {node.kind === 'start' ? 'Started' : 'Goal'}
        </span>
        <span className="font-mono text-[11px] text-ink-600">
          {date ? shortDate(date) : 'no deadline'}
        </span>
      </div>
    )
  }

  /* A step not yet reached is late once its day has passed and close from
     the day before — the same two states a deadline has, in the same colours
     (tokens.css item 8). A reached step is neither. */
  const due = node.reachedAt === undefined ? node.dueDate : undefined
  const tomorrow = localToday(new Date(Date.now() + 24 * 60 * 60 * 1000))
  const dateTone =
    due === undefined
      ? 'text-ink-600'
      : due < today
        ? 'text-state-danger'
        : due <= tomorrow
          ? 'text-state-warn'
          : 'text-ink-600'

  return (
    <div
      className={`flex w-full min-w-0 flex-col ${align} ${centred ? 'mt-2' : ''}`}
    >
      <button
        type="button"
        onClick={(e) => onEdit(node.id, e.currentTarget)}
        title="Edit this step"
        className={`max-w-full truncate rounded-[4px] text-[12.5px] decoration-lift/25 decoration-dotted underline-offset-4 hover:underline ${
          node.state === 'next'
            ? 'text-lav-200'
            : node.state === 'reached'
              ? 'text-ink-400'
              : 'text-foreground'
        }`}
      >
        {node.title}
      </button>
      <span className={`font-mono text-[11px] ${dateTone}`}>
        {node.reachedAt
          ? `reached ${shortDate(localToday(new Date(node.reachedAt)))}`
          : node.dueDate
            ? `${node.dueDate < today ? 'was due' : 'by'} ${shortDate(node.dueDate)}${node.dueTime ? `, ${node.dueTime}` : ''}`
            : 'no date'}
      </span>
    </div>
  )
}

/* ---------- the small panels ---------- */

/* Portalled to body and placed under what opened it: inside the card's
   .glass it would be pinned to the card (backdrop-filter makes `fixed`
   local) and could not frost the page. Escape or a tap outside closes. */
function Popover({
  anchor,
  area,
  label,
  onClose,
  children,
}: {
  anchor: HTMLElement
  area: string
  label: string
  onClose: () => void
  children: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<CSSProperties>({
    top: 0,
    left: 0,
    visibility: 'hidden',
  })

  useLayoutEffect(() => {
    function measure() {
      if (!anchor.isConnected) return onClose()
      const r = anchor.getBoundingClientRect()
      /* Full width on a phone, where 300px leaves a strip either side. */
      const width = window.innerWidth < 768 ? window.innerWidth - 24 : 300
      const height = panel.current?.offsetHeight ?? 0
      let top = r.bottom + 8
      if (top + height > window.innerHeight - 12) {
        top = Math.max(12, r.top - 8 - height)
      }
      const left = Math.min(
        Math.max(r.left + r.width / 2 - width / 2, 12),
        window.innerWidth - width - 12,
      )
      setPlace({ top, left, width })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [anchor, onClose])

  useEffect(() => {
    function down(e: PointerEvent) {
      const t = e.target as Node
      if (panel.current?.contains(t) || anchor.contains(t)) return
      onClose()
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [anchor, onClose])

  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      style={{ ...areaVars(area), ...place }}
      className="glass-menu motion-arrive fixed z-40 rounded-[14px] p-3 shadow-[var(--glass-shadow)]"
    >
      {children}
    </div>,
    document.body,
  )
}

const field =
  'w-full rounded-[8px] bg-lift/[0.05] px-2.5 py-1.5 text-[13px] text-foreground ring-1 ring-lift/[0.08] outline-none placeholder:text-ink-700 focus:ring-(--area)/50'
const dateField =
  'min-w-0 flex-1 rounded-[8px] bg-lift/[0.05] px-2 py-1 font-mono text-[12px] text-ink-300 ring-1 ring-lift/[0.08] outline-none focus:ring-(--area)/50'
const primary =
  'motion-press rounded-full bg-lav-300/16 px-3 py-1 text-[12px] text-lav-200 ring-1 ring-lav-300/40 hover:bg-lav-300/24 disabled:opacity-40'
const quiet =
  'motion-press rounded-full px-3 py-1 text-[12px] text-ink-500 hover:text-foreground'

/* Day and hour, with the hour offered only once there is a day: the backend
   refuses a time without one, so the field that would break that rule is
   not shown. */
function When({
  date,
  time,
  setDate,
  setTime,
}: {
  date: string
  time: string
  setDate: (v: string) => void
  setTime: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="By when"
        className={dateField}
      />
      {date ? (
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          aria-label="At what time"
          className={`${dateField} max-w-[96px]`}
        />
      ) : null}
    </div>
  )
}

function AddStep({
  goalId,
  after,
  initialDate,
  onDone,
}: {
  goalId: Id<'goals'>
  after: Id<'milestones'> | null
  initialDate: string | undefined
  onDone: () => void
}) {
  const create = useMutation(api.milestones.create)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(initialDate ?? '')
  const [time, setTime] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={async (e) => {
        e.preventDefault()
        const trimmed = title.trim()
        if (trimmed.length === 0 || busy) return
        setBusy(true)
        try {
          await create({
            goalId,
            title: trimmed,
            after,
            dueDate: date || undefined,
            dueTime: date && time ? time : undefined,
          })
          onDone()
        } catch (err) {
          setError(failureMessage(err) ?? 'That did not save. Try again.')
          setBusy(false)
        }
      }}
    >
      <span className="label-caps">New step</span>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What happens here"
        aria-label="Step"
        className={field}
      />
      <When date={date} time={time} setDate={setDate} setTime={setTime} />
      {error ? <p className="text-[12px] text-state-warn">{error}</p> : null}
      <div className="flex items-center justify-end gap-1">
        <button type="button" onClick={onDone} className={quiet}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || title.trim().length === 0}
          className={primary}
        >
          Add step
        </button>
      </div>
    </form>
  )
}

function EditStep({
  node,
  isFirst,
  isLast,
  onReached,
  onDone,
}: {
  node: Milestone
  isFirst: boolean
  isLast: boolean
  onReached: () => void
  onDone: () => void
}) {
  const update = useMutation(api.milestones.update)
  const setReached = useMutation(api.milestones.setReached)
  const move = useMutation(api.milestones.move)
  const remove = useMutation(api.milestones.remove)
  const id = node.id as Id<'milestones'>

  const wasReached = node.state === 'reached'
  const [title, setTitle] = useState(node.title)
  const [date, setDate] = useState(node.dueDate ?? '')
  const [time, setTime] = useState(node.dueTime ?? '')
  const [reached, setReachedDraft] = useState(wasReached)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const keptTime = date && time ? time : ''
  const changed =
    title.trim() !== node.title ||
    date !== (node.dueDate ?? '') ||
    keptTime !== (node.dueTime ?? '')

  async function run(work: () => Promise<unknown>) {
    setBusy(true)
    try {
      await work()
      onDone()
    } catch (err) {
      setError(failureMessage(err) ?? 'That did not save. Try again.')
      setBusy(false)
    }
  }

  const arrow =
    'motion-press grid size-7 place-items-center rounded-[8px] text-ink-500 hover:bg-lift/[0.06] hover:text-ink-200 disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (title.trim().length === 0 || busy) return
        void run(async () => {
          if (changed) {
            await update({
              milestoneId: id,
              title: title.trim(),
              dueDate: date || null,
              dueTime: keptTime || null,
            })
          }
          if (reached !== wasReached) {
            if (reached) onReached()
            await setReached({ milestoneId: id, reached })
          }
        })
      }}
    >
      <div className="flex items-center gap-1">
        <span className="label-caps flex-1">Step {node.number}</span>
        <button
          type="button"
          aria-label="Move earlier"
          title="Move earlier"
          disabled={isFirst || busy}
          onClick={() =>
            void run(() => move({ milestoneId: id, direction: 'earlier' }))
          }
          className={arrow}
        >
          <ArrowLeft className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Move later"
          title="Move later"
          disabled={isLast || busy}
          onClick={() =>
            void run(() => move({ milestoneId: id, direction: 'later' }))
          }
          className={arrow}
        >
          <ArrowRight className="size-3.5" />
        </button>
      </div>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Step"
        className={field}
      />
      <When date={date} time={time} setDate={setDate} setTime={setTime} />
      <button
        type="button"
        aria-pressed={reached}
        onClick={() => setReachedDraft((r) => !r)}
        className={`motion-press flex items-center gap-2 self-start rounded-full px-2.5 py-1 text-[12px] ring-1 ${
          reached
            ? 'bg-(--area)/15 text-(--area) ring-(--area)/45'
            : 'text-ink-500 ring-lift/12 hover:text-ink-200'
        }`}
      >
        <span
          className={`grid size-4 place-items-center rounded-full ${reached ? 'bg-(--area) text-background' : 'ring-1 ring-lift/25'}`}
        >
          {reached ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>
        {reached ? 'Reached' : 'Not reached yet'}
      </button>
      {error ? <p className="text-[12px] text-state-warn">{error}</p> : null}
      <div className="flex items-center gap-1">
        {confirming ? (
          <button
            type="button"
            autoFocus
            disabled={busy}
            onBlur={() => setConfirming(false)}
            onClick={() => void run(() => remove({ milestoneId: id }))}
            className="motion-arrive rounded-full bg-state-danger/15 px-3 py-1 text-[12px] text-state-danger ring-1 ring-state-danger/40"
          >
            Delete for good?
          </button>
        ) : (
          <button
            type="button"
            aria-label="Delete this step"
            title="Delete"
            onClick={() => setConfirming(true)}
            className="motion-press grid size-7 place-items-center rounded-[8px] text-ink-500 hover:bg-lift/[0.06] hover:text-state-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onDone} className={quiet}>
          Cancel
        </button>
        <button
          type="submit"
          disabled={
            busy ||
            title.trim().length === 0 ||
            (!changed && reached === wasReached)
          }
          className={primary}
        >
          Save
        </button>
      </div>
    </form>
  )
}
