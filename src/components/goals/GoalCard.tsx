import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { ConvexError } from 'convex/values'
import { CalendarPlus, CircleOff, Trash2, Trophy } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import { deadlineTone } from '@/components/projects/Chips'
import { SaveLabel, useSave } from '@/components/Saving'
import { GoalTimeline } from './GoalTimeline'
import { announceClosed } from './GoalShelf'
import { WaitingList } from './WaitingList'
import type { CarryTask } from './WaitingList'
import { UndoLine } from '@/components/calendar/UndoLine'
import type { Undoable } from '@/components/calendar/UndoLine'
import { failureMessage } from '@/lib/convex-errors'
import { localToday } from '@/lib/today'
import { areaVars } from '@/lib/areas'

/* One long-term goal (24 Sep). Artem asked what I thought of the page, and
   the answer was: a settings form. A raw date field beside the same date in
   words, three equally loud buttons on every card, the area as grey caps in
   a corner, and a goal that never showed the tasks filed under it.

   Now the card is the goal's colour down one edge, its title, and the facts
   in the voice the rest of the app has: the deadline as a chip that turns
   amber inside a week and red once passed, the steps, and what is waiting.
   Reached, Drop and Delete are quiet icons; Delete asks once. */
export function GoalCard({ goal }: { goal: Doc<'goals'> }) {
  const setStatus = useMutation(api.goals.setStatus)
  const removeGoal = useMutation(api.goals.remove)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Closing the goal, as a sequence the card plays before the write:
     reaching — the line runs into the goal, it bursts, REACHED is stamped
     on; leaving — the card drops away towards the shelf; dropping — it
     greys and slides aside. The write comes last, so the card is still
     here to be watched, and the shelf catches it (GoalShelf). */
  const [closing, setClosing] = useState<
    null | 'reaching' | 'leaving' | 'dropping'
  >(null)
  /* A waiting task on its way onto the line (WaitingList → GoalTimeline),
     the row leaving once it lands, and the five seconds to take it back. */
  const [carry, setCarry] = useState<CarryTask | null>(null)
  const [leaving, setLeaving] = useState<Id<'tasks'> | null>(null)
  const [undoable, setUndoable] = useState<Undoable | null>(null)
  const fromTask = useMutation(api.milestones.fromTask)
  const backToTask = useMutation(api.milestones.backToTask)
  const complete = useMutation(api.tasks.complete)
  /* Stable, or every render of the card would restart the Undo's clock. */
  const clearUndo = useCallback(() => setUndoable(null), [])

  useEffect(() => {
    if (carry === null) return
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') setCarry(null)
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [carry])

  /* The row slides out first, then the write: a row that vanished the
     instant the query changed would be a row you never saw go. */
  async function leave(taskId: Id<'tasks'>, write: () => Promise<unknown>) {
    setLeaving(taskId)
    await new Promise((r) => window.setTimeout(r, 200))
    try {
      await write()
    } catch (e) {
      setError(failureMessage(e) ?? 'That did not work.')
    } finally {
      setLeaving(null)
    }
  }

  async function close(status: 'done' | 'dropped') {
    setError(null)
    setCarry(null)
    if (status === 'done') {
      setClosing('reaching')
      await wait(1400)
      setClosing('leaving')
      await wait(520)
    } else {
      setClosing('dropping')
      await wait(240)
    }
    try {
      await setStatus({ goalId: goal._id, status })
      announceClosed({ goalId: goal._id, status })
    } catch (e) {
      setClosing(null)
      setError(failureMessage(e) ?? 'That did not work.')
    }
  }

  function place(
    taskId: Id<'tasks'>,
    after: Id<'milestones'> | null,
    dueDate?: string,
  ) {
    setCarry(null)
    setError(null)
    void leave(taskId, async () => {
      const milestoneId = await fromTask({
        taskId,
        after,
        dueDate,
        today: localToday(),
      })
      setUndoable({
        text: 'Moved to the timeline',
        at: Date.now(),
        undo: () => backToTask({ milestoneId, taskId }),
      })
    })
  }

  const icon =
    'motion-press grid size-8 place-items-center rounded-[9px] text-ink-500 transition-colors hover:bg-lift/[0.06]'

  return (
    <article
      style={areaVars(goal.area)}
      className={`glass relative flex flex-col gap-4 overflow-hidden rounded-[22px] p-6 pl-7 transition-shadow duration-(--motion-linger) ${
        closing === 'leaving'
          ? 'motion-goal-away pointer-events-none'
          : closing === 'dropping'
            ? 'motion-leave pointer-events-none grayscale'
            : 'motion-arrive'
      } ${
        closing === 'reaching' || closing === 'leaving'
          ? 'shadow-[0_0_48px_-10px_var(--color-state-good)] ring-1 ring-state-good/50'
          : ''
      }`}
    >
      {closing === 'reaching' || closing === 'leaving' ? (
        <span
          aria-hidden
          className="motion-stamp pointer-events-none absolute top-5 right-[120px] z-10 rounded-[8px] bg-state-good/12 px-3 py-1 font-mono text-[15px] tracking-[0.3em] text-state-good ring-2 ring-state-good/70 backdrop-blur-sm"
        >
          REACHED
        </span>
      ) : null}
      {/* The goal's area, as an edge. */}
      <span className="absolute top-5 bottom-5 left-0 w-[3px] rounded-r-full bg-(--area)" />

      <header className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-[19px] leading-tight font-light text-foreground">
            {goal.title}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <AreaBadge area={goal.area} />
            <DeadlineChip goal={goal} />
            <TargetText goal={goal} />
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          {confirming ? (
            <button
              type="button"
              autoFocus
              onBlur={() => setConfirming(false)}
              onClick={async () => {
                try {
                  await removeGoal({ goalId: goal._id })
                } catch (e) {
                  /* A goal something still depends on refuses, and says
                     what; ConvexError carries that sentence in .data. */
                  setError(
                    e instanceof ConvexError
                      ? String(e.data)
                      : 'That did not work.',
                  )
                  setConfirming(false)
                }
              }}
              className="motion-arrive rounded-full bg-state-danger/15 px-3 py-1 text-[12px] text-state-danger ring-1 ring-state-danger/40"
            >
              Delete for good?
            </button>
          ) : (
            <>
              <HoldToReach
                title={goal.title}
                disabled={closing !== null}
                onReached={() => void close('done')}
              />
              <button
                type="button"
                title="Drop it"
                aria-label={`Drop: ${goal.title}`}
                disabled={closing !== null}
                onClick={() => void close('dropped')}
                className={`${icon} hover:text-ink-200`}
              >
                <CircleOff className="size-4" />
              </button>
              <button
                type="button"
                title="Delete"
                aria-label={`Delete: ${goal.title}`}
                onClick={() => {
                  setError(null)
                  setConfirming(true)
                }}
                className={`${icon} hover:text-state-danger`}
              >
                <Trash2 className="size-4" />
              </button>
            </>
          )}
        </div>
      </header>

      {error ? <p className="text-[12.5px] text-state-warn">{error}</p> : null}

      <GoalNotes goal={goal} />

      <section className="flex flex-col gap-3 border-t border-lift/[0.07] pt-4">
        <GoalTimeline
          goal={goal}
          carry={carry}
          onPlace={(after, dueDate) => {
            if (carry) place(carry.taskId, after, dueDate)
          }}
          onCancelCarry={() => setCarry(null)}
          finale={closing === 'reaching' || closing === 'leaving'}
        />
      </section>

      <WaitingList
        goal={goal}
        carry={carry}
        setCarry={setCarry}
        leaving={leaving}
        onPlace={place}
        onDone={(taskId) => void leave(taskId, () => complete({ taskId }))}
      />
      <UndoLine undoable={undoable} onDone={clearUndo} />
    </article>
  )
}

/* The deadline as the same chip a project's is — amber inside a week, red
   once passed (deadlineTone) — with the date picker behind it rather than
   beside it. The picker is the browser's own, opened from the chip. */
function DeadlineChip({ goal }: { goal: Doc<'goals'> }) {
  const update = useMutation(api.goals.update)
  const input = useRef<HTMLInputElement>(null)
  const tone = deadlineTone(goal)

  function open() {
    const el = input.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={open}
        className={`motion-press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11.5px] ${
          goal.deadline
            ? tone.skin
            : 'text-ink-600 ring-1 ring-lift/10 hover:text-ink-300'
        }`}
      >
        {goal.deadline && tone.Icon ? (
          <tone.Icon className="size-3" />
        ) : (
          <CalendarPlus className="size-3" />
        )}
        {goal.deadline ? tone.label : 'set a deadline'}
      </button>
      <input
        ref={input}
        type="date"
        tabIndex={-1}
        aria-label={`Deadline for ${goal.title}`}
        value={goal.deadline ?? ''}
        onChange={(e) =>
          void update({ goalId: goal._id, deadline: e.target.value || null })
        }
        className="pointer-events-none absolute inset-0 opacity-0"
      />
    </span>
  )
}

/* PLAN.md §1: a target with a number says it; one in words says those; one
   with neither says nothing. The line that used to fill that silence ("Not
   everything worth doing has a number") appeared on every such goal. */
function TargetText({ goal }: { goal: Doc<'goals'> }) {
  const text =
    goal.targetValue !== undefined && goal.unit
      ? `${goal.targetValue} ${goal.unit}`
      : goal.targetLabel
  if (!text) return null
  return (
    <span className="rounded-full bg-lift/[0.05] px-2.5 py-1 font-mono text-[11.5px] text-ink-300">
      target {text}
    </span>
  )
}

/* The description, written in place (20 Sep). Opened by "+ Notes", and
   while it is open there is always a way out and a way to keep it: Cancel
   and Save, like every other editor in the app (24 Sep — the Save button
   used to appear only once the text changed, and there was no Cancel). */
function GoalNotes({ goal }: { goal: Doc<'goals'> }) {
  const update = useMutation(api.goals.update)
  const stored = goal.description ?? ''
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(stored)
  const saving = useSave()

  if (!editing) {
    return stored === '' ? (
      <button
        type="button"
        onClick={() => {
          setDraft('')
          setEditing(true)
        }}
        className="self-start text-[12.5px] text-ink-600 transition-colors hover:text-ink-300"
      >
        + Notes
      </button>
    ) : (
      /* Read, and a tap on the words edits them. */
      <button
        type="button"
        onClick={() => {
          setDraft(stored)
          setEditing(true)
        }}
        title="Edit notes"
        className="self-start rounded-[10px] px-1 py-0.5 text-left text-[13px] leading-relaxed whitespace-pre-wrap text-ink-300 transition-colors hover:bg-lift/[0.04] hover:text-ink-100"
      >
        {stored}
      </button>
    )
  }

  const dirty = draft.trim() !== stored

  function cancel() {
    setDraft(stored)
    setEditing(false)
  }

  async function save() {
    await saving.run(() =>
      update({ goalId: goal._id, description: draft.trim() || null }),
    )
  }
  return (
    <div className="motion-arrive flex flex-col gap-2">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (dirty) void save()
          }
        }}
        rows={3}
        aria-label={`Notes on ${goal.title}`}
        placeholder="Why this, what it looks like when it is done, anything you pasted"
        className="w-full resize-y rounded-[12px] bg-lift/[0.04] px-3 py-2 text-[13px] leading-relaxed text-ink-200 ring-1 ring-lift/[0.08] outline-none placeholder:text-ink-700 focus:ring-(--area)/40"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={cancel}
          className="motion-press rounded-full px-3 py-1 text-[12px] text-ink-500 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving.busy || !dirty}
          onClick={() => void save()}
          className="motion-press rounded-full bg-lav-300/16 px-3 py-1 text-[12px] text-lav-200 ring-1 ring-lav-300/40 hover:bg-lav-300/24 disabled:opacity-40 disabled:hover:bg-lav-300/16"
        >
          <SaveLabel
            status={saving.status}
            onSettled={() => {
              saving.settle()
              setEditing(false)
            }}
          >
            Save notes
          </SaveLabel>
        </button>
        <span className="font-mono text-[10.5px] text-ink-700">⌘↵</span>
      </div>
    </div>
  )
}

function wait(ms: number) {
  return new Promise((r) => window.setTimeout(r, ms))
}

const HOLD_MS = 800

/* Reaching a goal is a hold, not a tap (24 Sep): one tap on the trophy is
   how a goal was reached by accident and vanished. Press and hold; a ring
   fills round the trophy in the colour of a thing that went well, and at
   full it is reached. Let go early and nothing happens — a short tap says
   "hold" instead. Space and Enter hold too. */
function HoldToReach({
  title,
  disabled,
  onReached,
}: {
  title: string
  disabled: boolean
  onReached: () => void
}) {
  const [holding, setHolding] = useState(false)
  const [hint, setHint] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const started = useRef(0)

  function start() {
    if (disabled || timer.current !== undefined) return
    started.current = Date.now()
    setHint(false)
    setHolding(true)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      setHolding(false)
      onReached()
    }, HOLD_MS)
  }
  function stop() {
    if (timer.current === undefined) return
    window.clearTimeout(timer.current)
    timer.current = undefined
    setHolding(false)
    if (Date.now() - started.current < HOLD_MS / 2) setHint(true)
  }

  useEffect(() => {
    if (!hint) return
    const t = window.setTimeout(() => setHint(false), 1600)
    return () => window.clearTimeout(t)
  }, [hint])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <span className="relative inline-flex">
      {hint ? (
        <span className="motion-arrive pointer-events-none absolute top-1/2 right-full mr-1 -translate-y-1/2 rounded-full bg-state-good/12 px-2 py-0.5 font-mono text-[10.5px] whitespace-nowrap text-state-good ring-1 ring-state-good/30">
          hold to reach
        </span>
      ) : null}
      <button
        type="button"
        title="Hold to reach"
        aria-label={`Hold to reach: ${title}`}
        disabled={disabled}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
            e.preventDefault()
            start()
          }
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') stop()
        }}
        className={`motion-press relative grid size-8 touch-none place-items-center rounded-[9px] transition-[color,scale] select-none hover:bg-lift/[0.06] hover:text-state-good ${
          holding ? 'scale-110 text-state-good' : 'text-ink-500'
        }`}
      >
        <svg
          viewBox="0 0 32 32"
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full -rotate-90"
        >
          <circle
            cx="16"
            cy="16"
            r="14"
            fill="none"
            stroke="var(--color-state-good)"
            strokeWidth="2"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={holding ? 0 : 1}
            style={{
              transition: holding
                ? `stroke-dashoffset ${HOLD_MS}ms linear`
                : 'stroke-dashoffset 150ms ease-out',
            }}
          />
        </svg>
        <Trophy className="size-4" />
      </button>
    </span>
  )
}
