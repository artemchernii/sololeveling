import { useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'
import { CalendarPlus, CircleOff, Trash2, Trophy } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import { deadlineTone } from '@/components/projects/Chips'
import { SaveLabel, useSave } from '@/components/Saving'
import { GoalTimeline } from './GoalTimeline'
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

  const icon =
    'motion-press grid size-8 place-items-center rounded-[9px] text-ink-500 transition-colors hover:bg-lift/[0.06]'

  return (
    <article
      style={areaVars(goal.area)}
      className="glass motion-arrive relative flex flex-col gap-4 overflow-hidden rounded-[22px] p-6 pl-7"
    >
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
              <button
                type="button"
                title="Reached it"
                aria-label={`Reached: ${goal.title}`}
                onClick={() =>
                  void setStatus({ goalId: goal._id, status: 'done' })
                }
                className={`${icon} hover:text-state-good`}
              >
                <Trophy className="size-4" />
              </button>
              <button
                type="button"
                title="Drop it"
                aria-label={`Drop: ${goal.title}`}
                onClick={() =>
                  void setStatus({ goalId: goal._id, status: 'dropped' })
                }
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
        <GoalTimeline goal={goal} />
      </section>

      <GoalTasks goal={goal} />
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

/* What is waiting under this goal: open tasks filed to it, by title, linked
   to the backlog where they are worked. No count — "and more" is enough. */
function GoalTasks({ goal }: { goal: Doc<'goals'> }) {
  const result = useQuery(api.tasks.listByGoal, { goalId: goal._id, limit: 4 })
  if (result === undefined || result.tasks.length === 0) return null

  return (
    <section className="flex flex-col gap-1.5 border-t border-lift/[0.07] pt-4">
      <span className="label-caps">Waiting</span>
      <ul className="flex flex-col">
        {result.tasks.map((task) => (
          <li key={task._id}>
            <Link
              to="/backlog"
              className="motion-press flex items-center gap-2.5 rounded-[8px] px-1.5 py-1 text-[13px] text-ink-200 hover:bg-lift/[0.04] hover:text-foreground"
            >
              <span
                style={task.area ? areaVars(task.area) : undefined}
                className={`size-1.5 shrink-0 rounded-full ${task.area ? 'bg-(--area)' : 'bg-ink-600'}`}
              />
              <span className="truncate">{task.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {result.more ? (
        <Link
          to="/backlog"
          className="self-start px-1.5 text-[12px] text-ink-500 hover:text-ink-200"
        >
          and more in the backlog →
        </Link>
      ) : null}
    </section>
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
