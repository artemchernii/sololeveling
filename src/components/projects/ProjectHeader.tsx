import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  CircleCheck,
  Pause,
  Target,
  FolderInput,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { LogoUpload } from '@/components/projects/LogoUpload'
import { ProjectVitals } from '@/components/projects/ProjectVitals'
import { SaveLabel, useSave } from '@/components/Saving'
import type { Area } from '@/lib/capture-parser'
import { daysUntil, deadlineLabel, isOverdue } from '@/lib/format'
import { localToday } from '@/lib/today'

/* A project's header (20 Sep, rebuilt from his feedback). It used to be a
   title, a stray status word pinned right, and one thin grey line — "0 of 2
   tasks · no time logged this month" — which said almost nothing about a
   project you are actually building.

   What it says now is what this project is and how it is going: his own
   description, the three numbers, a deadline he can move, and the time he
   just spent. What it no longer says is what the project answers to — the
   goal is one quiet line, and its timeline lives on Goals where it means
   something. */
export function ProjectHeader({
  project,
  goal,
  counts,
  logoUrl,
}: {
  project: Doc<'projects'>
  goal: Doc<'goals'> | null | undefined
  counts: { done: number; total: number } | undefined
  logoUrl: string | null
}) {
  const projectId = project._id
  const setFocus = useMutation(api.projects.setFocus)
  const setStatus = useMutation(api.projects.setStatus)

  const isFocus = project.status === 'focus'

  return (
    <div className="glass flex flex-col gap-4 rounded-[22px] p-6">
      <Link
        to="/projects"
        className="label-caps flex items-center gap-1.5 self-start transition-colors hover:text-ink-300"
      >
        <ArrowLeft className="size-3" />
        Projects
      </Link>

      {/* The identity row spans the card, and the numbers row carries the
          deadline and the log on its right (20 Sep). Everything used to stack
          in one left-hand column with two thirds of the panel empty beside
          it, which is what made a full-width card read as a narrow one —
          but squeezing the title into a column of its own just wrapped the
          badge onto a second line. Rows, not columns. */}
      <div className="flex items-center gap-3">
        <LogoUpload
          projectId={projectId}
          url={logoUrl}
          title={project.title}
          area={goal?.area}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] leading-none font-light text-foreground">
              {project.title}
            </h1>
            <StatusBadge status={project.status} />
          </div>
        </div>
      </div>

      <Description project={project} />

      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <ProjectVitals
          projectId={projectId}
          done={counts?.done}
          total={counts?.total}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Deadline project={project} />
          <LogTime projectId={projectId} area={goal?.area} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-lift/[0.07] pt-3">
        {/* Focus is one project at a time, and setFocus already demotes the
            one that held it. What was missing was a way to simply stop —
            pausing or completing a project you are still doing is a lie about
            its status just to free the slot (20 Sep). */}
        {isFocus ? (
          <Action
            icon={Target}
            onClick={() => void setStatus({ projectId, status: 'active' })}
          >
            Stop focusing
          </Action>
        ) : (
          <Action icon={Target} onClick={() => void setFocus({ projectId })}>
            Make this the focus
          </Action>
        )}
        <Action
          icon={Pause}
          onClick={() => void setStatus({ projectId, status: 'paused' })}
        >
          Pause
        </Action>
        <Action
          icon={CircleCheck}
          onClick={() => void setStatus({ projectId, status: 'completed' })}
        >
          Complete the project
        </Action>
        <Action
          icon={Archive}
          onClick={() => void setStatus({ projectId, status: 'archived' })}
        >
          Archive
        </Action>
        {goal ? <MoveToGoal goal={goal} projectId={projectId} /> : null}
        <DeleteAction projectId={projectId} />
      </div>
    </div>
  )
}

/* The focus badge, awake (20 Sep). It was grey mono caps in a rounded box —
   he called it boring four times, and he was right: the one project that
   matters this week looked like a field label.

   Lavender, a live dot that breathes, and a glow. The accent is reserved for
   live and focus things, and this is the most focus thing in the app. Every
   other status stays quiet, because a paused project is not an event. */
function StatusBadge({ status }: { status: Doc<'projects'>['status'] }) {
  if (status !== 'focus') {
    return (
      <span className="label-caps rounded-full bg-lift/5 px-2 py-0.5 text-ink-500">
        {status}
      </span>
    )
  }

  return (
    <span className="motion-pop label-caps inline-flex items-center gap-1.5 rounded-full bg-lav-900/80 px-2.5 py-1 text-lav-200 shadow-[0_0_20px_-4px_var(--color-accent)] ring-1 ring-lav-500/50 ring-inset">
      <span className="motion-breathe size-1.5 rounded-full bg-lav-300" />
      focus
    </span>
  )
}

/* Refiling a project, as an action (20 Sep). First it was a card with the
   goal's whole timeline; then one line under the title reading "for improve
   solo leveling". He called both bad, and he is right that a project page is
   about the thing being built, not the thing it answers to.

   It cannot simply go: without it a project under the wrong goal can only be
   fixed by deleting it, which is the exact bug setGoal was added to end. So
   it sits with the other actions, saying nothing until pressed. */
function MoveToGoal({
  goal,
  projectId,
}: {
  goal: Doc<'goals'>
  projectId: Id<'projects'>
}) {
  const goals = useQuery(api.goals.listActive, {})
  const setGoal = useMutation(api.projects.setGoal)
  const [picking, setPicking] = useState(false)

  /* A monthly tile target is not something a project hangs on. */
  const choices = (goals ?? []).filter((g) => g.tile === undefined)

  if (picking) {
    return (
      <select
        autoFocus
        value={goal._id}
        aria-label="Move this project to another goal"
        onChange={(e) => {
          void setGoal({ projectId, goalId: e.target.value as Id<'goals'> })
          setPicking(false)
        }}
        onBlur={() => setPicking(false)}
        className="rounded-[7px] border border-lift/10 bg-sink/20 px-2 py-1 text-[12px] text-ink-300"
      >
        {choices.map((g) => (
          <option key={g._id} value={g._id}>
            {g.title}
          </option>
        ))}
      </select>
    )
  }

  return (
    <Action icon={FolderInput} onClick={() => setPicking(true)}>
      Move to another goal
    </Action>
  )
}

/* What the project is, in his words. The field has existed since R1 and
   nothing ever wrote to it. Saved by a visible button, as the goal's notes
   are: a write must be something you pressed and saw land. */
function Description({ project }: { project: Doc<'projects'> }) {
  const setDescription = useMutation(api.projects.setDescription)
  const [text, setText] = useState(project.description ?? '')
  const saving = useSave()
  const dirty = text.trim() !== (project.description ?? '')

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="What is this project?"
        className="w-full resize-none bg-transparent text-[13px] leading-relaxed text-ink-200 outline-none placeholder:text-ink-700"
      />
      {dirty ? (
        <button
          type="button"
          disabled={saving.busy}
          onClick={() =>
            void saving.run(() =>
              setDescription({ projectId: project._id, description: text }),
            )
          }
          className="self-start rounded-[7px] border border-lav-500/60 px-3 py-1 text-[12px] text-lav-300 transition-colors hover:bg-lav-900/60"
        >
          <SaveLabel status={saving.status} onSettled={saving.settle}>
            Save
          </SaveLabel>
        </button>
      ) : null}
    </div>
  )
}

/* A deadline you can move. "ended Sep 12 · 8 days ago" was a fact you could
   only obey — but a date passing while you are still working is the normal
   case, so it is editable where it is shown. */
function Deadline({ project }: { project: Doc<'projects'> }) {
  const setDeadline = useMutation(api.projects.setDeadline)
  const [open, setOpen] = useState(false)
  const late = project.deadline !== undefined && isOverdue(project.deadline)

  if (open) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="date"
          autoFocus
          defaultValue={project.deadline ?? localToday()}
          onChange={(e) => {
            const value = e.target.value
            if (value.length > 0) {
              void setDeadline({ projectId: project._id, deadline: value })
              setOpen(false)
            }
          }}
          className="rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 font-mono text-[12px] text-ink-300"
        />
        {project.deadline ? (
          <button
            type="button"
            onClick={() => {
              void setDeadline({ projectId: project._id, deadline: null })
              setOpen(false)
            }}
            className="text-[11.5px] text-ink-700 transition-colors hover:text-ink-400"
          >
            Clear
          </button>
        ) : null}
      </div>
    )
  }

  /* A passed deadline is danger, one inside two days is warn, anything else
     is quiet (20 Sep). Brighter ink was not enough — "ended Sep 12 · 8 days
     ago" still read exactly like "no end date". */
  const soon =
    !late && project.deadline !== undefined && daysUntil(project.deadline) <= 2

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`motion-press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11.5px] transition-colors ${
        late
          ? 'bg-state-danger/15 text-state-danger ring-1 ring-state-danger/35 ring-inset hover:bg-state-danger/25'
          : soon
            ? 'bg-state-warn/15 text-state-warn ring-1 ring-state-warn/30 ring-inset hover:bg-state-warn/25'
            : 'text-ink-600 hover:text-ink-200'
      }`}
    >
      {late ? (
        <TriangleAlert className="size-3" />
      ) : soon ? (
        <CalendarClock className="size-3" />
      ) : null}
      {project.deadline ? deadlineLabel(project.deadline) : 'no end date'}
    </button>
  )
}

/* Time on this project, logged where you are already standing (20 Sep). It
   writes the same `session` log the ⌘K capture writes — one row, one kind,
   no second way of recording the same thing. */
function LogTime({
  projectId,
  area,
}: {
  projectId: Id<'projects'>
  area: Area | undefined
}) {
  const createLog = useMutation(api.logs.create)
  const [minutes, setMinutes] = useState('')
  const saving = useSave()

  async function log() {
    const value = Number(minutes)
    /* No area means the goal above this project has gone missing, which
       should not happen — but defaulting one would file the session under an
       area he never chose, and a log is evidence. Better to do nothing. */
    if (area === undefined) return
    if (!Number.isFinite(value) || value <= 0 || saving.busy) return
    await saving.run(() =>
      createLog({
        kind: 'session',
        area,
        occurredAt: Date.now(),
        value,
        unit: 'min',
        projectId,
      }),
    )
    setMinutes('')
  }

  return (
    <div className="flex items-center gap-2">
      <span className="label-caps">Log</span>
      <input
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void log()
        }}
        inputMode="numeric"
        placeholder="45"
        aria-label="Minutes spent on this project"
        className="w-12 rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-center font-mono text-[12px] text-ink-300 outline-none placeholder:text-ink-700"
      />
      <span className="font-mono text-[11.5px] text-ink-600">min</span>
      <button
        type="button"
        disabled={saving.busy}
        onClick={() => void log()}
        className="rounded-[7px] border border-lift/10 px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lav-500/60 hover:text-lav-300"
      >
        <SaveLabel status={saving.status} onSettled={saving.settle}>
          Add
        </SaveLabel>
      </button>
    </div>
  )
}

function DeleteAction({ projectId }: { projectId: Id<'projects'> }) {
  const removeProject = useMutation(api.projects.remove)
  const navigate = useNavigate()
  return (
    <Action
      icon={Trash2}
      onClick={async () => {
        await removeProject({ projectId })
        await navigate({ to: '/projects' })
      }}
    >
      Delete
    </Action>
  )
}

function Action({
  icon: Icon,
  onClick,
  children,
}: {
  icon: LucideIcon
  onClick: () => void | Promise<void>
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className="flex items-center gap-1.5 rounded-[7px] border border-lift/10 px-2.5 py-1 text-[11.5px] text-ink-400 transition-colors hover:border-lift/20 hover:text-ink-200"
    >
      <Icon className="size-3" />
      {children}
    </button>
  )
}
