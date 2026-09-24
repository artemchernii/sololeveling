import { useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, GripVertical, Milestone } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type { Carry } from './GoalTimeline'
import { areaVars } from '@/lib/areas'
import { nearestTarget } from '@/lib/drop-target'
import { agoLabel, shortDate } from '@/lib/format'
import { localToday } from '@/lib/today'

/** The task in hand, as GoalCard holds it. */
export type CarryTask = Carry & { taskId: Id<'tasks'> }

/** How near a + a dragged task must be to land on it, in px. */
const REACH = 48

/* A goal's waiting tasks (24 Sep; spec 2026-09-24-waiting-to-steps.md).

   Each row says what the task is, how long it has waited, and when it is
   owed, with the two things you do to a waiting task right there: tick it,
   or move it onto the goal's line as a step. On a desktop the grip drags it
   onto a +; anywhere, the step icon picks it up and a tap on a + puts it
   down. A task on today's three cannot be moved — that would free a slot,
   which only dropping it from today may do.

   Four rows, then "more in the backlog". No count of open tasks. */
export function WaitingList({
  goal,
  carry,
  setCarry,
  leaving,
  onPlace,
  onDone,
}: {
  goal: Doc<'goals'>
  carry: CarryTask | null
  setCarry: (next: (c: CarryTask | null) => CarryTask | null) => void
  leaving: Id<'tasks'> | null
  onPlace: (
    taskId: Id<'tasks'>,
    after: Id<'milestones'> | null,
    dueDate?: string,
  ) => void
  onDone: (taskId: Id<'tasks'>) => void
}) {
  const result = useQuery(api.tasks.listByGoal, { goalId: goal._id, limit: 4 })
  const [ghost, setGhost] = useState<Ghost | null>(null)
  const today = localToday()
  const tomorrow = localToday(new Date(Date.now() + 24 * 60 * 60 * 1000))

  if (result === undefined || result.tasks.length === 0) return null

  /* The + buttons of this goal's line that are on screen, by centre. */
  function targets() {
    return [
      ...document.querySelectorAll<HTMLElement>(`[data-gap^="${goal._id}:"]`),
    ]
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          key: el.dataset.gap!,
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
        }
      })
  }

  function startDrag(task: Doc<'tasks'>, e: ReactPointerEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    const origin = { x: e.clientX, y: e.clientY }
    setCarry(() => ({
      taskId: task._id,
      title: task.title,
      mode: 'drag',
      hotKey: null,
    }))
    setGhost({ title: task.title, area: task.area, ...origin, back: false })
    const select = document.body.style.userSelect
    document.body.style.userSelect = 'none'

    function move(ev: PointerEvent) {
      setGhost((g) => g && { ...g, x: ev.clientX, y: ev.clientY })
      const key = nearestTarget(
        { x: ev.clientX, y: ev.clientY },
        targets(),
        REACH,
      )
      setCarry((c) => (c && c.hotKey !== key ? { ...c, hotKey: key } : c))
    }
    function end(ev: PointerEvent) {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      document.body.style.userSelect = select
      const key =
        ev.type === 'pointerup'
          ? nearestTarget({ x: ev.clientX, y: ev.clientY }, targets(), REACH)
          : null
      const el =
        key === null
          ? null
          : document.querySelector<HTMLElement>(`[data-gap="${key}"]`)
      if (el) {
        setGhost(null)
        onPlace(
          task._id,
          (el.dataset.after || null) as Id<'milestones'> | null,
          el.dataset.date,
        )
      } else {
        /* Nowhere to land: it flies back to where it was picked up. */
        setCarry(() => null)
        setGhost((g) => g && { ...g, ...origin, back: true })
        window.setTimeout(() => setGhost(null), 240)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  return (
    <section className="flex flex-col gap-1.5 border-t border-lift/[0.07] pt-4">
      <span className="label-caps">Waiting</span>
      <ul className="flex flex-col">
        {result.tasks.map((task) => {
          const onToday = task.todayFor === today
          const picked = carry?.taskId === task._id
          const due = task.dueDate
          const dueTone =
            due === undefined
              ? ''
              : due < today
                ? 'text-state-danger'
                : due <= tomorrow
                  ? 'text-state-warn'
                  : 'text-ink-500'
          return (
            <li
              key={task._id}
              style={task.area ? areaVars(task.area) : undefined}
              className={`group/row flex items-center gap-1.5 rounded-[10px] py-0.5 pr-1 transition-colors ${
                leaving === task._id ? 'motion-leave' : ''
              } ${picked ? 'bg-lift/[0.05] ring-1 ring-(--area)/30' : 'hover:bg-lift/[0.03]'}`}
            >
              {onToday ? (
                <span className="hidden w-5 md:block" />
              ) : (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={`Drag ${task.title} onto the timeline`}
                  title="Drag onto the line"
                  onPointerDown={(e) => startDrag(task, e)}
                  className="hidden size-5 shrink-0 cursor-grab touch-none place-items-center rounded-[6px] text-ink-700 opacity-60 group-hover/row:opacity-100 hover:text-ink-300 active:cursor-grabbing md:grid"
                >
                  <GripVertical className="size-3.5" />
                </span>
              )}
              <span
                className={`size-1.5 shrink-0 rounded-full ${task.area ? 'bg-(--area)' : 'bg-ink-600'}`}
              />
              <Link
                to="/backlog"
                className="min-w-0 flex-1 truncate py-1 pl-1 text-[13px] text-ink-200 hover:text-foreground"
              >
                {task.title}
              </Link>
              {onToday ? (
                <span className="font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase">
                  today
                </span>
              ) : null}
              {due ? (
                <span className={`font-mono text-[11px] ${dueTone}`}>
                  {due < today ? 'was due' : 'by'} {shortDate(due)}
                </span>
              ) : null}
              <span className="hidden font-mono text-[11px] text-ink-700 sm:inline">
                {agoLabel(task._creationTime)}
              </span>
              {onToday ? null : (
                <button
                  type="button"
                  aria-label={`Make ${task.title} a step`}
                  aria-pressed={picked}
                  title="Make it a step"
                  onClick={() =>
                    setCarry((c) =>
                      c?.taskId === task._id
                        ? null
                        : {
                            taskId: task._id,
                            title: task.title,
                            mode: 'pick',
                            hotKey: null,
                          },
                    )
                  }
                  className={`motion-press grid size-7 shrink-0 place-items-center rounded-[8px] transition-colors ${
                    picked
                      ? 'bg-(--area)/15 text-(--area)'
                      : 'text-ink-600 hover:bg-lift/[0.06] hover:text-ink-200'
                  }`}
                >
                  <Milestone className="size-3.5" />
                </button>
              )}
              <button
                type="button"
                aria-label={`Done: ${task.title}`}
                title="Done"
                onClick={() => onDone(task._id)}
                className="motion-press grid size-7 shrink-0 place-items-center rounded-[8px] text-ink-600 transition-colors hover:bg-state-good/10 hover:text-state-good"
              >
                <Check className="size-3.5" />
              </button>
            </li>
          )
        })}
      </ul>
      {result.more ? (
        <Link
          to="/backlog"
          className="self-start px-1.5 text-[12px] text-ink-500 hover:text-ink-200"
        >
          and more in the backlog →
        </Link>
      ) : null}
      {ghost ? <GhostChip ghost={ghost} /> : null}
    </section>
  )
}

type Ghost = {
  title: string
  area?: string
  x: number
  y: number
  /** Flying back after a drop that landed nowhere. */
  back: boolean
}

/* The task under the pointer while it is dragged — portalled, since the
   card's glass would pin a fixed element to the card. */
function GhostChip({ ghost }: { ghost: Ghost }) {
  return createPortal(
    <div
      style={{
        ...(ghost.area ? areaVars(ghost.area) : {}),
        left: ghost.x + 14,
        top: ghost.y + 10,
        transition: ghost.back
          ? 'left 220ms var(--motion-ease), top 220ms var(--motion-ease), opacity 220ms'
          : undefined,
        opacity: ghost.back ? 0 : 1,
      }}
      className={`glass-menu pointer-events-none fixed z-50 flex max-w-[240px] items-center gap-2 rounded-full py-1.5 pr-3 pl-2.5 shadow-[0_8px_24px_-8px_var(--area,var(--color-accent))] motion-pop`}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-(--area,var(--color-accent))" />
      <span className="truncate text-[12.5px] text-foreground">
        {ghost.title}
      </span>
    </div>,
    document.body,
  )
}
