import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  Archive,
  ArrowLeft,
  CircleCheck,
  Pause,
  Target,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { LogoUpload } from '@/components/projects/LogoUpload'
import { ProjectVitals } from '@/components/projects/ProjectVitals'
import { SaveLabel, useSave } from '@/components/Saving'
import type { Area } from '@/lib/capture-parser'
import { deadlineLabel, isOverdue } from '@/lib/format'
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

      <div className="flex flex-wrap items-center gap-3">
        <LogoUpload
          projectId={projectId}
          url={logoUrl}
          title={project.title}
          area={goal?.area}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[26px] leading-none font-light text-foreground">
            {project.title}
          </h1>
          {goal ? <GoalLine goal={goal} projectId={projectId} /> : null}
        </div>
        <span
          className={`label-caps ml-auto rounded-[4px] px-1.5 py-0.5 ${
            isFocus ? 'bg-lav-900/70 text-lav-300' : 'bg-lift/5'
          }`}
        >
          {project.status}
        </span>
      </div>

      <Description project={project} />

      <ProjectVitals
        projectId={projectId}
        done={counts?.done}
        total={counts?.total}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Deadline project={project} />
        <LogTime projectId={projectId} area={goal?.area} />
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
        <DeleteAction projectId={projectId} />
      </div>
    </div>
  )
}

/* The goal, as a line rather than a card (20 Sep). The FOR card carried the
   goal's whole timeline and a labelled MOVE TO select, and he found both
   confusing on a project page: a project is where you build a thing, and a
   goal's shape in time belongs on the screen about goals.

   Refiling survives, because losing it would mean a project under the wrong
   goal could only be fixed by deleting it — the exact bug setGoal was added
   to end. The line itself is the control: read it, or press change and pick
   another. */
function GoalLine({
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
        className="self-start rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-[12px] text-ink-300"
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
    <span className="group/goal flex items-center gap-2">
      <Link
        to="/goals"
        hash={`goal-${goal._id}`}
        className="label-caps transition-colors hover:text-ink-300"
      >
        for {goal.title}
      </Link>
      {choices.length > 1 ? (
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="label-caps text-ink-700 opacity-0 transition-opacity group-hover/goal:opacity-100 focus-visible:opacity-100"
        >
          change
        </button>
      ) : null}
    </span>
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

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`font-mono text-[11.5px] transition-colors hover:text-ink-200 ${
        late ? 'text-ink-300' : 'text-ink-600'
      }`}
    >
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
