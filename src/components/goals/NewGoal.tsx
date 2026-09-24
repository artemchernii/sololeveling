import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { CalendarDays, Inbox, Plus, Search, X } from 'lucide-react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { SaveLabel, useSave } from '@/components/Saving'
import { areaVars, useAreas } from '@/lib/areas'
import { failureMessage } from '@/lib/convex-errors'
import { agoLabel, shortDate } from '@/lib/format'
import { QUICK_DEADLINES, quickDeadline } from '@/lib/goal-deadline'
import type { QuickDeadline } from '@/lib/goal-deadline'
import { localToday } from '@/lib/today'

/* A new goal (24 Sep). It was a settings form, always open at the top of a
   page opened once or twice a week: a raw select, a raw date box, grey
   labels, and a Target field — and a target is a number, which lives in
   Targets now, not on a goal. Artem: "looks bad, boring and not aligned".

   Now it is folded into one button, and opening it gives you the card the
   goal will become: its area's colour down the edge as you pick one, its
   title in the card's own type, a deadline as one tap, the line drawn from
   today to that day, and the first steps on it as you write them. "Set it"
   makes the goal and its steps, and the real card arrives below. */
export function NewGoal() {
  const createGoal = useMutation(api.goals.create)
  const createStep = useMutation(api.milestones.create)
  const stepFromTask = useMutation(api.milestones.fromTask)
  const areas = useAreas()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState('life')
  const [deadline, setDeadline] = useState<string | undefined>(undefined)
  const [quick, setQuick] = useState<QuickDeadline | 'picked' | null>(null)
  const [steps, setSteps] = useState<Array<Draft>>([])
  const [step, setStep] = useState('')
  /* Notes are written, then added or cancelled — their own small editor,
     like the goal card's (24 Sep: "note without cancel and add buttons"). */
  const [notes, setNotes] = useState('')
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saving = useSave()
  const picker = useRef<HTMLInputElement>(null)
  const today = localToday()

  function reset() {
    setTitle('')
    setArea('life')
    setDeadline(undefined)
    setQuick(null)
    setSteps([])
    setStep('')
    setNotes('')
    setNotesDraft(null)
    setError(null)
  }

  function addStep() {
    const t = step.trim()
    if (t.length === 0) return
    setSteps((s) => [...s, { kind: 'typed', key: `t${Date.now()}`, title: t }])
    setStep('')
  }

  async function submit() {
    if (saving.busy) return
    if (title.trim().length === 0) {
      setError('A goal needs a name.')
      return
    }
    /* A step still in the field counts: pressing Set it is not a reason
       to lose the words you just typed. */
    const all: Array<Draft> = step.trim()
      ? [...steps, { kind: 'typed', key: 'last', title: step.trim() }]
      : steps
    /* Notes still open count too, for the same reason. */
    const description = (notesDraft ?? notes).trim()
    try {
      await saving.run(async () => {
        const goalId = await createGoal({
          title: title.trim(),
          area,
          deadline,
          description: description || undefined,
        })
        /* In order, each after the one before: a typed step is written; a
           task from the backlog is moved (archived, refiled under this
           goal — milestones.fromTask), the same as dragging it on. */
        let after: Id<'milestones'> | null = null
        for (const d of all) {
          after =
            d.kind === 'typed'
              ? await createStep({ goalId, title: d.title, after })
              : await stepFromTask({
                  taskId: d.task._id,
                  after,
                  today,
                  goalId,
                })
        }
      })
      setError(null)
    } catch (e) {
      setError(failureMessage(e) ?? 'That did not work.')
    }
  }

  /* Closes once the tick has been seen, and only then clears — the goal
     has already arrived below it by then. */
  function finish() {
    saving.settle()
    reset()
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass motion-press group flex items-center gap-2.5 self-start rounded-full py-2 pr-4 pl-2 text-[13px] text-ink-200 transition-colors hover:text-foreground"
      >
        <span className="grid size-6 place-items-center rounded-full bg-lav-300/16 text-lav-200 ring-1 ring-lav-300/40 transition-transform duration-(--motion-base) group-hover:rotate-90">
          <Plus className="size-3.5" strokeWidth={2.5} />
        </span>
        New goal
      </button>
    )
  }

  const chip =
    'motion-press rounded-full px-2.5 py-1 text-[12px] ring-1 transition-colors'

  return (
    <div
      style={areaVars(area)}
      className="glass motion-arrive relative flex flex-col gap-4 overflow-hidden rounded-[22px] p-6 pl-7"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          reset()
          setOpen(false)
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          void submit()
        }
      }}
    >
      {/* The area, as an edge — the same one the card will wear. */}
      <span className="motion-edge absolute top-5 bottom-5 left-0 w-[3px] rounded-r-full bg-(--area) transition-colors duration-(--motion-base)" />

      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            void submit()
          }
        }}
        aria-label="Goal"
        placeholder="What are you walking towards?"
        className="w-full bg-transparent text-[19px] leading-tight font-light text-foreground outline-none placeholder:text-ink-600"
      />

      {/* Area, as the colours it will be. */}
      <div
        className="flex flex-wrap gap-1.5"
        role="radiogroup"
        aria-label="Area"
      >
        {areas.map((a) => {
          const on = a.slug === area
          return (
            <button
              key={a.slug}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setArea(a.slug)}
              style={areaVars(a.slug)}
              className={`${chip} inline-flex items-center gap-1.5 ${
                on
                  ? 'bg-(--area)/15 text-(--area) ring-(--area)/55'
                  : 'text-ink-500 ring-lift/10 hover:text-(--area) hover:ring-(--area)/30'
              }`}
            >
              {/* Every area shows its colour, picked or not. */}
              <span className="size-1.5 rounded-full bg-(--area)" />
              {a.label}
            </button>
          )
        })}
      </div>

      {/* By when, in one tap — or a date of your own, or none. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_DEADLINES.map((q) => {
          const on = quick === q.key
          return (
            <button
              key={q.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (on) {
                  setQuick(null)
                  setDeadline(undefined)
                } else {
                  setQuick(q.key)
                  setDeadline(quickDeadline(q.key, today))
                }
              }}
              className={`${chip} ${
                on
                  ? 'bg-(--area)/15 text-(--area) ring-(--area)/55'
                  : 'text-ink-400 ring-lift/10 hover:text-ink-200'
              }`}
            >
              {q.label}
            </button>
          )
        })}
        <span className="relative inline-flex">
          <button
            type="button"
            aria-pressed={quick === 'picked'}
            onClick={() => {
              const el = picker.current
              if (!el) return
              try {
                el.showPicker()
              } catch {
                el.focus()
              }
            }}
            className={`${chip} inline-flex items-center gap-1.5 ${
              quick === 'picked'
                ? 'bg-(--area)/15 text-(--area) ring-(--area)/55'
                : 'text-ink-400 ring-lift/10 hover:text-ink-200'
            }`}
          >
            <CalendarDays className="size-3.5" />
            {quick === 'picked' && deadline
              ? shortDate(deadline)
              : 'Pick a day'}
          </button>
          <input
            ref={picker}
            type="date"
            tabIndex={-1}
            aria-hidden
            min={today}
            value={quick === 'picked' ? (deadline ?? '') : ''}
            onChange={(e) => {
              setDeadline(e.target.value || undefined)
              setQuick(e.target.value ? 'picked' : null)
            }}
            className="pointer-events-none absolute inset-0 opacity-0"
          />
        </span>
      </div>

      <Preview deadline={deadline} steps={steps} />

      <Steps
        steps={steps}
        setSteps={setSteps}
        step={step}
        setStep={setStep}
        onAdd={addStep}
        today={today}
      />

      <Notes
        notes={notes}
        draft={notesDraft}
        setDraft={setNotesDraft}
        onAdd={() => {
          setNotes((notesDraft ?? '').trim())
          setNotesDraft(null)
        }}
      />

      {error ? <p className="text-[12.5px] text-state-warn">{error}</p> : null}

      <div className="flex items-center gap-2 border-t border-lift/[0.07] pt-4">
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => {
            if (saving.status === 'saved') return finish()
            reset()
            setOpen(false)
          }}
          className="motion-press rounded-full px-3 py-1.5 text-[12.5px] text-ink-500 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={saving.busy}
          onClick={() => void submit()}
          className="motion-press rounded-full bg-(--area)/15 px-4 py-1.5 text-[12.5px] text-(--area) ring-1 ring-(--area)/50 transition-colors hover:bg-(--area)/25 disabled:opacity-50"
        >
          <SaveLabel status={saving.status} onSettled={finish}>
            Set it
          </SaveLabel>
        </button>
      </div>
    </div>
  )
}

/* The line the goal will have: today, the steps written so far, and the
   goal at its deadline — drawn evenly, since nothing is dated yet. Its
   segments draw in as the deadline is chosen. */
function Preview({
  deadline,
  steps,
}: {
  deadline: string | undefined
  steps: Array<Draft>
}) {
  return (
    <div className="flex flex-col gap-1.5 py-1" aria-hidden>
      <div className="flex items-center">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-background font-mono text-[9.5px] text-ink-500 ring-1 ring-lift/15">
          0
        </span>
        {steps.map((d, i) => (
          <span key={d.key} className="flex flex-1 items-center">
            <span className="h-px flex-1 bg-lift/12" />
            <span className="motion-step-born grid size-5 shrink-0 place-items-center rounded-full bg-background font-mono text-[9.5px] text-ink-400 ring-1 ring-lift/20">
              {i + 1}
            </span>
          </span>
        ))}
        <span
          className={`h-px flex-1 transition-colors duration-(--motion-linger) ${
            deadline ? 'bg-(--area)/60' : 'bg-lift/12'
          }`}
        />
        <span
          key={deadline ?? 'none'}
          className={`grid size-5 shrink-0 place-items-center rounded-full bg-background text-[10px] ring-1 ${
            deadline
              ? 'motion-pop text-(--area) ring-(--area)/60 shadow-[0_0_12px_-3px_var(--area)]'
              : 'text-ink-600 ring-lift/15'
          }`}
        >
          ◆
        </span>
      </div>
      <div className="flex justify-between font-mono text-[10.5px] text-ink-600">
        <span>today</span>
        <span className={deadline ? 'text-(--area)' : ''}>
          {deadline ? `by ${shortDate(deadline)}` : 'no deadline yet'}
        </span>
      </div>
    </div>
  )
}

/** A step before the goal exists: written here, or a backlog task that
    will be moved onto the line when the goal is set. */
type Draft =
  | { kind: 'typed'; key: string; title: string }
  | { kind: 'task'; key: string; title: string; task: Doc<'tasks'> }

/* Steps are checkpoints on the way — "5k without stopping" — not tasks.
   Artem asked what a "first step" was, which means the composer never
   said. Now it does, and a task already in the backlog can be pulled in
   as one (24 Sep): it is moved, not copied, the same as dragging a
   waiting task onto a goal's line. */
function Steps({
  steps,
  setSteps,
  step,
  setStep,
  onAdd,
  today,
}: {
  steps: Array<Draft>
  setSteps: (next: (s: Array<Draft>) => Array<Draft>) => void
  step: string
  setStep: (v: string) => void
  onAdd: () => void
  today: string
}) {
  const [picking, setPicking] = useState(false)
  const picked = new Set(
    steps.flatMap((d) => (d.kind === 'task' ? [d.task._id] : [])),
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="label-caps">Steps</span>
        <span className="text-[11.5px] text-ink-600">
          checkpoints on the way — write one, or pull a task from the backlog
        </span>
      </div>

      {steps.map((d, i) => (
        <div
          key={d.key}
          className="motion-land group/step flex items-center gap-2.5 py-0.5"
        >
          <span className="motion-step-born grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px] text-(--area) ring-1 ring-(--area)/45">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-200">
            {d.title}
          </span>
          {d.kind === 'task' ? (
            <span
              title="Moved from the backlog when the goal is set"
              className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10.5px] text-ink-500 ring-1 ring-lift/10"
            >
              <Inbox className="size-3" />
              backlog
            </span>
          ) : null}
          <button
            type="button"
            aria-label={`Remove ${d.title}`}
            onClick={() =>
              setSteps((all) => all.filter((x) => x.key !== d.key))
            }
            className="grid size-6 place-items-center rounded-[7px] text-ink-700 opacity-0 transition-opacity group-hover/step:opacity-100 hover:text-ink-300 focus-visible:opacity-100 max-md:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}

      <div className="flex items-center gap-2.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-full text-(--area) ring-1 ring-(--area)/40">
          <Plus className="size-3" strokeWidth={2.5} />
        </span>
        <input
          value={step}
          onChange={(e) => setStep(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
              e.preventDefault()
              onAdd()
            }
          }}
          aria-label="A step"
          placeholder={
            steps.length === 0 ? 'Write a step, Enter to add' : 'Another step'
          }
          className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-foreground outline-none placeholder:text-ink-700"
        />
        <button
          type="button"
          aria-expanded={picking}
          onClick={() => setPicking((p) => !p)}
          className={`motion-press inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ring-1 transition-colors ${
            picking
              ? 'bg-(--area)/15 text-(--area) ring-(--area)/55'
              : 'text-ink-400 ring-lift/10 hover:text-ink-200'
          }`}
        >
          <Inbox className="size-3.5" />
          From the backlog
        </button>
      </div>

      {picking ? (
        <BacklogPicker
          today={today}
          exclude={picked}
          onPick={(task) =>
            setSteps((all) => [
              ...all,
              { kind: 'task', key: task._id, title: task.title, task },
            ])
          }
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  )
}

/* The backlog, in a frosted tray that drops open under the steps. Rows
   arrive one after another; a picked row slides out as its step lands
   above. Search narrows it; the newest waiting tasks come first. */
function BacklogPicker({
  today,
  exclude,
  onPick,
  onClose,
}: {
  today: string
  exclude: Set<Id<'tasks'>>
  onPick: (task: Doc<'tasks'>) => void
  onClose: () => void
}) {
  const backlog = useQuery(api.tasks.listBacklog, { today })
  const [find, setFind] = useState('')
  const [leaving, setLeaving] = useState<Id<'tasks'> | null>(null)
  const needle = find.trim().toLowerCase()
  const rows = (backlog ?? [])
    .filter((t) => !exclude.has(t._id) && t._id !== leaving)
    .filter((t) => needle === '' || t.title.toLowerCase().includes(needle))
    .sort((a, b) => b._creationTime - a._creationTime)
    .slice(0, 8)
  const leavingRow = (backlog ?? []).find((t) => t._id === leaving)

  function pick(task: Doc<'tasks'>) {
    setLeaving(task._id)
    window.setTimeout(() => {
      onPick(task)
      setLeaving(null)
    }, 200)
  }

  return (
    <div className="glass-menu motion-arrive mt-1 flex flex-col gap-1 rounded-[16px] p-2 ring-1 ring-(--area)/20">
      <div className="flex items-center gap-2 px-2 pt-1 pb-1.5">
        <Search className="size-3.5 text-ink-600" />
        <input
          autoFocus
          value={find}
          onChange={(e) => setFind(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              onClose()
            }
          }}
          aria-label="Find in the backlog"
          placeholder="Find in the backlog"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
        />
        <button
          type="button"
          aria-label="Close the backlog"
          onClick={onClose}
          className="grid size-6 place-items-center rounded-[7px] text-ink-600 hover:text-ink-300"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {backlog === undefined ? (
        <p className="motion-breathe px-2.5 py-2 text-[12.5px] text-ink-600">
          Opening the backlog…
        </p>
      ) : rows.length === 0 && leavingRow === undefined ? (
        <p className="px-2.5 py-2 text-[12.5px] text-ink-500">
          {needle
            ? 'Nothing like that in the backlog.'
            : 'The backlog is empty.'}
        </p>
      ) : (
        <>
          {leavingRow ? (
            <Row task={leavingRow} className="motion-leave" onPick={() => {}} />
          ) : null}
          {rows.map((task, i) => (
            <Row
              key={task._id}
              task={task}
              className="motion-arrive"
              delay={i * 35}
              onPick={() => pick(task)}
            />
          ))}
        </>
      )}
    </div>
  )
}

function Row({
  task,
  className,
  delay = 0,
  onPick,
}: {
  task: Doc<'tasks'>
  className: string
  delay?: number
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        ...(task.area ? areaVars(task.area) : {}),
        animationDelay: `${delay}ms`,
      }}
      className={`group/row flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-lift/[0.05] ${className}`}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${task.area ? 'bg-(--area)' : 'bg-ink-600'}`}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink-200 group-hover/row:text-foreground">
        {task.title}
      </span>
      <span className="font-mono text-[11px] text-ink-700">
        {agoLabel(task._creationTime)}
      </span>
      <span className="grid size-5 place-items-center rounded-full text-ink-600 ring-1 ring-lift/15 transition-colors group-hover/row:bg-lift/[0.06] group-hover/row:text-foreground">
        <Plus className="size-3" />
      </span>
    </button>
  )
}

/* Notes on the goal: "+ Notes" opens a small editor with Cancel and Add;
   added, they read as text, and a tap edits them again. */
function Notes({
  notes,
  draft,
  setDraft,
  onAdd,
}: {
  notes: string
  draft: string | null
  setDraft: (v: string | null) => void
  onAdd: () => void
}) {
  if (draft === null) {
    return notes ? (
      <button
        type="button"
        onClick={() => setDraft(notes)}
        title="Edit the notes"
        className="motion-arrive line-clamp-3 self-start rounded-[10px] px-1 text-left text-[13px] leading-relaxed whitespace-pre-wrap text-ink-400 hover:text-ink-200"
      >
        {notes}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setDraft('')}
        className="self-start text-[12.5px] text-ink-600 transition-colors hover:text-ink-300"
      >
        + Notes
      </button>
    )
  }
  return (
    <div className="motion-arrive flex flex-col gap-2">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            setDraft(null)
          }
        }}
        rows={3}
        aria-label="Notes"
        placeholder="Why this, what it looks like when it is done, anything you pasted"
        className="w-full resize-y rounded-[12px] bg-lift/[0.04] px-3 py-2 text-[13px] leading-relaxed text-ink-200 ring-1 ring-lift/[0.08] outline-none placeholder:text-ink-700 focus:ring-(--area)/40"
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={() => setDraft(null)}
          className="motion-press rounded-full px-3 py-1 text-[12px] text-ink-500 hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={draft.trim() === notes}
          onClick={onAdd}
          className="motion-press rounded-full bg-(--area)/15 px-3 py-1 text-[12px] text-(--area) ring-1 ring-(--area)/45 hover:bg-(--area)/25 disabled:opacity-40"
        >
          {notes ? 'Save notes' : 'Add notes'}
        </button>
      </div>
    </div>
  )
}
