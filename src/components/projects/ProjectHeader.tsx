import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  CircleCheck,
  CornerDownLeft,
  Pause,
  PenLine,
  Target,
  Infinity as InfinityIcon,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { LogoUpload } from '@/components/projects/LogoUpload'
import { ProjectStats } from '@/components/projects/ProjectStats'
import { SaveGlyph, useSave } from '@/components/Saving'
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
      {/* The actions sit beside the title rather than in a row of their own
          under the numbers (20 Sep, fourth pass). He boxed the empty right
          half of this card: the identity row stopped at the deadline pill and
          left roughly 600px of nothing beside it, while five buttons sat on a
          line of their own below. They are what you do to this project, so
          they belong next to its name, and the hole closes. */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-3">
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
              <Deadline project={project} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
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
            tone="go"
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

      <Description project={project} />

      <ProjectStats
        project={project}
        area={goal?.area}
        done={counts?.done}
        total={counts?.total}
      />
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

/* What the project is, in his words (20 Sep, rebuilt the same evening).

   It was a bare textarea with a Save button that appeared out of nowhere and
   no way back: "I clicked on it we show only save button no cancel… make it
   visible borders and enter icon", like the task and note fields. So it is
   the same object as those — an edge, the accent when you are in it, ⏎ to
   save, Escape or Cancel to put it back. */
function Description({ project }: { project: Doc<'projects'> }) {
  const setDescription = useMutation(api.projects.setDescription)
  const [text, setText] = useState(project.description ?? '')
  const [editing, setEditing] = useState(false)
  const saving = useSave()
  const dirty = text.trim() !== (project.description ?? '')

  function save() {
    if (!dirty) {
      setEditing(false)
      return
    }
    void saving
      .run(() => setDescription({ projectId: project._id, description: text }))
      .then(() => setEditing(false))
  }

  function cancel() {
    setText(project.description ?? '')
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="motion-press self-start rounded-[10px] px-1 text-left text-[13px] leading-relaxed transition-colors hover:bg-lift/[0.04]"
      >
        {project.description ? (
          <span className="text-ink-200">{project.description}</span>
        ) : (
          <span className="text-ink-700">What is this project?</span>
        )}
      </button>
    )
  }

  return (
    <div className="group/desc flex items-start gap-2.5 rounded-[12px] border border-lift/10 bg-sink/20 px-3 py-2.5 transition-colors focus-within:border-lav-500/60 focus-within:bg-lav-900/20">
      <PenLine className="mt-1 size-3.5 shrink-0 text-ink-600 transition-colors group-focus-within/desc:text-lav-300" />
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          /* ⏎ saves, ⇧⏎ makes a line — the same bargain as everywhere else. */
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            save()
          }
          if (e.key === 'Escape') cancel()
        }}
        rows={2}
        placeholder="What is this project?"
        className="min-w-0 flex-1 resize-none bg-transparent text-[13px] leading-relaxed text-foreground outline-none placeholder:text-ink-700"
      />
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={cancel}
          className="text-[11.5px] text-ink-700 transition-colors hover:text-ink-400"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          aria-label="Save"
          className="motion-press grid size-6 place-items-center rounded-[7px] bg-lav-900/70 text-lav-300 ring-1 ring-lav-500/50 ring-inset transition-colors hover:bg-lav-800"
        >
          <SaveGlyph
            status={saving.status}
            onSettled={saving.settle}
            idle={<CornerDownLeft className="size-3" />}
          />
        </button>
      </div>
    </div>
  )
}

/* A deadline you can move — or refuse to set (20 Sep).

   Three states, and each looks like what it is: a date that has passed is
   danger, a date inside a week is warn, and "ongoing" is a project being
   built with no date he is willing to promise, which reads as a band of
   light walking across the pill for as long as that is true.

   Ongoing is not the same as no end date. No end date is a project he has
   not thought about; ongoing is an answer. */
function Deadline({ project }: { project: Doc<'projects'> }) {
  const setDeadline = useMutation(api.projects.setDeadline)
  const setOngoing = useMutation(api.projects.setOngoing)
  const [open, setOpen] = useState(false)

  const late = project.deadline !== undefined && isOverdue(project.deadline)
  const soon =
    !late && project.deadline !== undefined && daysUntil(project.deadline) <= 7

  if (open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
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
          className="rounded-[8px] border border-lift/10 bg-sink/20 px-2 py-1 font-mono text-[12px] text-ink-300"
        />
        <button
          type="button"
          onClick={() => {
            void setOngoing({ projectId: project._id, ongoing: true })
            setOpen(false)
          }}
          className="motion-press inline-flex items-center gap-1.5 rounded-full bg-lav-900/60 px-2.5 py-1 text-[11.5px] text-lav-300 ring-1 ring-lav-500/40 ring-inset transition-colors hover:bg-lav-800"
        >
          <InfinityIcon className="size-3" />
          Ongoing
        </button>
        {project.deadline !== undefined || project.ongoing === true ? (
          <button
            type="button"
            onClick={() => {
              void setDeadline({ projectId: project._id, deadline: null })
              void setOngoing({ projectId: project._id, ongoing: false })
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

  if (project.ongoing === true) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="motion-press motion-building inline-flex items-center gap-1.5 rounded-full bg-lav-900/40 px-2.5 py-1 font-mono text-[11.5px] text-lav-200 ring-1 ring-lav-500/30 ring-inset"
      >
        <InfinityIcon className="size-3" />
        ongoing
      </button>
    )
  }

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

/* Delete asks first (20 Sep, second pass). It used to fire on the single
   click of a button that looked exactly like Pause, and projects.remove takes
   the logo file and every stored commit with it — the year the grid above is
   drawn from. An inline arm, not a dialog: the question belongs where the
   button was, and "Keep" is the easy one to hit. */
function DeleteAction({ projectId }: { projectId: Id<'projects'> }) {
  const removeProject = useMutation(api.projects.remove)
  const navigate = useNavigate()
  const [armed, setArmed] = useState(false)

  if (!armed) {
    return (
      <Action icon={Trash2} tone="danger" onClick={() => setArmed(true)}>
        Delete
      </Action>
    )
  }

  return (
    <span className="motion-pop inline-flex items-center gap-2 rounded-[7px] border border-state-danger/45 bg-state-danger/10 px-2.5 py-1">
      <span className="flex items-center gap-1.5 text-[11.5px] text-state-danger">
        <TriangleAlert className="size-3" />
        Delete this project and its commits?
      </span>
      <button
        type="button"
        onClick={() => {
          void (async () => {
            await removeProject({ projectId })
            await navigate({ to: '/projects' })
          })()
        }}
        className="motion-press rounded-[6px] bg-state-danger/25 px-2 py-0.5 text-[11.5px] text-state-danger transition-colors hover:bg-state-danger/40"
      >
        Delete
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-[11.5px] text-ink-400 transition-colors hover:text-ink-200"
      >
        Keep
      </button>
    </span>
  )
}

/* Three tones, because five identical buttons is what the row was (20 Sep,
   second pass). Measured: every one of them rendered transparent on
   rgb(178,182,202) — "Delete" and "Pause" were the same object to the eye,
   and Delete is the only one that cannot be undone. Colour marks the state a
   press would put the project in, which is what colour is for here. */
function Action({
  icon: Icon,
  onClick,
  tone = 'quiet',
  children,
}: {
  icon: LucideIcon
  onClick: () => void | Promise<void>
  tone?: 'quiet' | 'go' | 'danger'
  children: React.ReactNode
}) {
  const skin =
    tone === 'go'
      ? 'border-state-good/30 bg-state-good/10 text-state-good hover:border-state-good/55 hover:bg-state-good/20'
      : tone === 'danger'
        ? 'border-state-danger/25 text-state-danger/75 hover:border-state-danger/55 hover:bg-state-danger/15 hover:text-state-danger'
        : 'border-lift/10 text-ink-400 hover:border-lift/20 hover:text-ink-200'

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className={`motion-press flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1 text-[11.5px] transition-colors ${skin}`}
    >
      <Icon className="size-3" />
      {children}
    </button>
  )
}
