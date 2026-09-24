import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Archive, ArchiveRestore, ArrowUp, Check, Trash2 } from 'lucide-react'

import type { Doc } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import { BindSelect } from './BindSelect'
import { ScheduleTask } from './ScheduleTask'
import { areaVars } from '@/lib/areas'
import { agoLabel, shortDate } from '@/lib/format'

/* One task in the backlog (24 Sep). Artem: "backlog is bad atm … a bit too
   bland" — every row was a title over a grey form: a bordered "unbound"
   select, a bordered "Calendar" button, a trash can, the same on every line.

   Now a row is the task: its area as a coloured edge, the title, and
   underneath only what is actually true of it — how long it has waited,
   what it is for, when it is on the calendar. Pickers for what is not set
   yet appear on hover (always, on a phone). Archive and Delete are always
   there — hidden until hover, they were hard to find (24 Sep). Done is a
   button on the right:
   a round tick on the left read as a checkbox for selecting (24 Sep). In
   Select mode a checkbox appears there, and that is the only one. */
export function TaskRow({
  task,
  projects,
  goals,
  full,
  archivedView,
  selecting,
  checked,
  onToggle,
  onComplete,
  onPick,
  onArea,
  onArchive,
  onDelete,
}: {
  task: Doc<'tasks'>
  projects: Array<Doc<'projects'>>
  goals: Array<Doc<'goals'>>
  /** Today already has its three. */
  full: boolean
  archivedView: boolean
  selecting: boolean
  checked: boolean
  onToggle: () => void
  onComplete: () => void
  onPick: () => void
  onArea: (area: string) => void
  onArchive: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  /* Finishing plays before the row goes: the title is struck through in
     green, then the row slides out, then the write is sent — so the list
     does not jump from under the animation. */
  const [finishing, setFinishing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  function finish() {
    if (finishing) return
    setFinishing(true)
    window.setTimeout(() => setLeaving(true), 420)
    window.setTimeout(onComplete, 700)
  }
  const tone: CSSProperties = task.area
    ? areaVars(task.area)
    : ({ '--area': 'var(--color-neutral-500)' } as CSSProperties)

  const action =
    'motion-press grid size-8 shrink-0 place-items-center rounded-[9px] text-ink-600 transition-colors hover:bg-lift/[0.06]'

  return (
    <div
      style={tone}
      onMouseLeave={() => setConfirming(false)}
      /* Wraps on a phone: the title keeps the full width and the actions
         drop to a line of their own (24 Sep: "on mobile it looks awful" —
         the action cluster had squeezed titles to one word per line). */
      className={`group relative flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] py-2.5 pr-2 pl-4 transition-colors duration-(--motion-base) ${
        finishing
          ? 'bg-state-good/[0.08]'
          : checked
            ? 'bg-(--area)/10'
            : 'hover:bg-lift/[0.035]'
      } ${leaving ? 'motion-leave' : ''}`}
    >
      {/* The area, as an edge. Unfiled is a quiet grey, not a colour. */}
      <span className="absolute top-2.5 bottom-2.5 left-1 w-[3px] rounded-full bg-(--area)/70" />

      {selecting ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          aria-label={`Select ${task.title}`}
          onClick={onToggle}
          className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] ring-1 transition-colors ${
            checked
              ? 'bg-(--area) text-background ring-(--area)'
              : 'ring-lift/25 hover:ring-lift/40'
          }`}
        >
          {checked ? <Check className="motion-pop size-3" /> : null}
        </button>
      ) : null}

      <div
        className={`flex min-w-[60%] flex-1 flex-col gap-1 ${selecting ? 'cursor-pointer' : ''}`}
        onClick={selecting ? onToggle : undefined}
      >
        <span
          className={`relative self-start text-[14px] leading-[20px] transition-colors duration-(--motion-base) ${
            finishing ? 'text-ink-400' : 'text-foreground'
          }`}
        >
          {task.title}
          {/* The strike, drawn left to right in green. */}
          <span
            aria-hidden
            className={`absolute top-1/2 left-0 h-[1.5px] w-full origin-left rounded-full bg-state-good transition-transform duration-[380ms] ease-out ${
              finishing ? 'scale-x-100' : 'scale-x-0'
            }`}
          />
        </span>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-[10.5px] text-ink-600">
            {agoLabel(task._creationTime)}
          </span>
          {/* Chosen for a day that ended without it being ticked. */}
          {task.todayFor ? (
            <span className="rounded-full bg-state-warn/12 px-2 py-0.5 font-mono text-[10.5px] text-state-warn">
              picked {shortDate(task.todayFor)}, not done
            </span>
          ) : null}
          {selecting ? null : (
            <>
              <BindSelect task={task} projects={projects} goals={goals} />
              <ScheduleTask task={task} />
            </>
          )}
        </div>
      </div>

      <div className="flex w-full items-center gap-1 md:w-auto md:shrink-0">
        <AreaBadge area={task.area} onChange={selecting ? undefined : onArea} />
        {selecting ? null : confirming ? (
          <button
            type="button"
            autoFocus
            onClick={onDelete}
            onBlur={() => setConfirming(false)}
            className="motion-arrive rounded-full bg-state-danger/15 px-3 py-1 text-[12px] text-state-danger ring-1 ring-state-danger/40"
          >
            Delete for good?
          </button>
        ) : (
          <>
            {archivedView ? null : (
              <button
                type="button"
                disabled={full}
                onClick={onPick}
                title={
                  full
                    ? 'Today is full. Finish one or drop one.'
                    : 'Put it on today'
                }
                className="motion-press ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] text-ink-400 ring-1 ring-lift/10 md:ml-0 transition-colors hover:bg-lav-300/12 hover:text-lav-200 hover:ring-lav-300/40 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-400 disabled:hover:ring-lift/10"
              >
                <ArrowUp className="size-3" />
                Today
              </button>
            )}
            {archivedView ? null : (
              /* Done, as on Today: a task_done log and nothing more (§3b.1).
                 Always visible — it is what a task is for. */
              <button
                type="button"
                aria-label={`Done: ${task.title}`}
                title="Done"
                onClick={finish}
                className={`motion-press grid size-8 shrink-0 place-items-center rounded-[9px] transition-colors ${
                  finishing
                    ? 'bg-state-good/20 text-state-good'
                    : 'text-ink-500 hover:bg-state-good/12 hover:text-state-good'
                }`}
              >
                <Check className={`size-4 ${finishing ? 'motion-pop' : ''}`} />
              </button>
            )}
            <button
              type="button"
              aria-label={archivedView ? 'Unarchive' : 'Archive'}
              title={archivedView ? 'Unarchive' : 'Archive'}
              onClick={onArchive}
              className={`${action} hover:text-ink-200`}
            >
              {archivedView ? (
                <ArchiveRestore className="size-4" />
              ) : (
                <Archive className="size-4" />
              )}
            </button>
            <button
              type="button"
              aria-label={`Delete ${task.title}`}
              title="Delete"
              onClick={() => setConfirming(true)}
              className={`${action} hover:text-state-danger`}
            >
              <Trash2 className="size-4" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
