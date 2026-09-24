import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ChevronDown, CircleOff, RotateCcw, Trophy } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import { UndoLine } from '@/components/calendar/UndoLine'
import type { Undoable } from '@/components/calendar/UndoLine'
import { areaVars } from '@/lib/areas'
import { shortDate } from '@/lib/format'
import { localToday } from '@/lib/today'

/* Reached and dropped goals, at the bottom of Goals (24 Sep). Artem reached
   a goal and it "simply disappeared" — nothing listed a goal once it
   stopped being active. Now it lands here, dated, with its steps, and can
   be reopened. Both groups start folded; a goal arriving opens its group
   and is scrolled to, so you see where it went. */

const CLOSED = 'goal-closed'

type Closed = { goalId: Id<'goals'>; status: 'done' | 'dropped' }

/** Tell the shelf a goal just closed, so it opens, catches it, and offers
    to take it back. GoalCard calls this once the write has landed. */
export function announceClosed(detail: Closed) {
  window.dispatchEvent(new CustomEvent<Closed>(CLOSED, { detail }))
}

export function GoalShelf() {
  const shelf = useQuery(api.goals.listClosed, {})
  const setStatus = useMutation(api.goals.setStatus)
  const [open, setOpen] = useState({ reached: false, dropped: false })
  const [landed, setLanded] = useState<Id<'goals'> | null>(null)
  const [undoable, setUndoable] = useState<Undoable | null>(null)
  const clearUndo = useCallback(() => setUndoable(null), [])

  useEffect(() => {
    function onClosed(e: Event) {
      const { goalId, status } = (e as CustomEvent<Closed>).detail
      setOpen((o) => ({
        ...o,
        [status === 'done' ? 'reached' : 'dropped']: true,
      }))
      setLanded(goalId)
      setUndoable({
        text: status === 'done' ? 'Goal reached' : 'Goal dropped',
        at: Date.now(),
        undo: () => setStatus({ goalId, status: 'active' }),
      })
    }
    window.addEventListener(CLOSED, onClosed)
    return () => window.removeEventListener(CLOSED, onClosed)
  }, [setStatus])

  const undo = <UndoLine undoable={undoable} onDone={clearUndo} />
  if (
    shelf === undefined ||
    (shelf.reached.length === 0 && shelf.dropped.length === 0)
  ) {
    return undo
  }

  return (
    <>
      {shelf.reached.length > 0 ? (
        <Group
          label="Reached"
          open={open.reached}
          onToggle={() => setOpen((o) => ({ ...o, reached: !o.reached }))}
        >
          {shelf.reached.map((goal) => (
            <ClosedGoal key={goal._id} goal={goal} landed={landed} />
          ))}
        </Group>
      ) : null}
      {shelf.dropped.length > 0 ? (
        <Group
          label="Dropped"
          open={open.dropped}
          onToggle={() => setOpen((o) => ({ ...o, dropped: !o.dropped }))}
        >
          {shelf.dropped.map((goal) => (
            <ClosedGoal key={goal._id} goal={goal} landed={landed} />
          ))}
        </Group>
      ) : null}
      {undo}
    </>
  )
}

function Group({
  label,
  open,
  onToggle,
  children,
}: {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="motion-press flex items-center gap-1.5 self-start rounded-full px-1 py-0.5 text-ink-500 hover:text-ink-200"
      >
        <span className="label-caps text-inherit">{label}</span>
        <ChevronDown
          className={`size-3.5 transition-transform duration-(--motion-base) ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open ? (
        <div className="motion-arrive grid gap-2 sm:grid-cols-2">
          {children}
        </div>
      ) : null}
    </section>
  )
}

/* One closed goal: what it was, when it closed, the steps it had (filled
   where reached — the same honest dots as the line), and a way back. */
function ClosedGoal({
  goal,
  landed,
}: {
  goal: Doc<'goals'>
  landed: Id<'goals'> | null
}) {
  const milestones = useQuery(api.milestones.listByGoal, { goalId: goal._id })
  const setStatus = useMutation(api.goals.setStatus)
  const ref = useRef<HTMLDivElement>(null)
  const reached = goal.status === 'done'
  const isLanded = landed === goal._id

  useEffect(() => {
    if (isLanded) {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isLanded])

  const when = goal.closedAt
    ? `${reached ? 'reached' : 'dropped'} ${shortDate(localToday(new Date(goal.closedAt)))}`
    : reached
      ? 'reached'
      : 'dropped'

  return (
    <div
      ref={ref}
      style={areaVars(goal.area)}
      className={`glass flex flex-col gap-2 rounded-[16px] p-4 ${
        isLanded ? 'motion-land' : ''
      } ${reached ? '' : 'opacity-70'}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full ${
            reached
              ? 'bg-state-good/12 text-state-good ring-1 ring-state-good/35'
              : 'text-ink-600 ring-1 ring-lift/10'
          } ${isLanded && reached ? 'motion-pop' : ''}`}
        >
          {reached ? (
            <Trophy className="size-3.5" />
          ) : (
            <CircleOff className="size-3.5" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={`text-[14px] leading-snug ${reached ? 'text-foreground' : 'text-ink-400'}`}
          >
            {goal.title}
          </span>
          <span
            className={`font-mono text-[11px] ${reached ? 'text-state-good' : 'text-ink-600'}`}
          >
            {when}
          </span>
        </div>
        <button
          type="button"
          title="Reopen"
          aria-label={`Reopen: ${goal.title}`}
          onClick={() => void setStatus({ goalId: goal._id, status: 'active' })}
          className="motion-press grid size-7 shrink-0 place-items-center rounded-[8px] text-ink-600 transition-colors hover:bg-lift/[0.06] hover:text-ink-200"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <AreaBadge area={goal.area} />
        {milestones && milestones.length > 0 ? (
          <span
            className="flex items-center gap-1"
            title={milestones.map((m) => m.title).join(' · ')}
          >
            {milestones.map((m) => (
              <span
                key={m._id}
                className={`size-1.5 rounded-full ${
                  m.reachedAt ? 'bg-(--area)' : 'ring-1 ring-lift/25'
                }`}
              />
            ))}
          </span>
        ) : null}
      </div>
    </div>
  )
}
