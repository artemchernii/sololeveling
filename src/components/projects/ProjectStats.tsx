import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { ReactNode } from 'react'
import {
  Circle,
  CircleCheckBig,
  Clock,
  CornerDownLeft,
  GitCommitHorizontal,
  Plus,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { CommitStrip } from '@/components/projects/CommitStrip'
import { Ring } from '@/components/Ring'
import { SaveLabel, useSave } from '@/components/Saving'
import type { Area } from '@/lib/capture-parser'
import { durationLabel } from '@/lib/format'
import { addDays, addWeeks, startOfWeek } from '@/lib/weeks'

/* The header's stats, as blocks (20 Sep, third pass).

   The first two passes laid this out as loose flex rows with
   justify-between, so each row stopped where its content stopped and left a
   hole in the middle of a wide card — he drew red boxes round them — and the
   log field floated in a row with the deadline and the targets, belonging to
   nothing.

   So it is a grid that fills the width. Each number is a block; each block
   carries its own ring, because a target belongs beside the number it is a
   target for rather than in a separate column; and setting the target happens
   inside the block, which is what removed the stray "Targets" control. Log
   time is its own block, because logging is a thing you do, not a number you
   read. */
export function ProjectStats({
  project,
  area,
  done,
  total,
}: {
  project: Doc<'projects'>
  area: Area | undefined
  done: number | undefined
  total: number | undefined
}) {
  const projectId = project._id
  const now = new Date()
  const time = useQuery(api.aggregate.projectTime, {
    projectId,
    start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
  })

  const week = startOfWeek()
  const lastWeekStart = addWeeks(week, -1)
  const dayStarts = Array.from({ length: 14 }, (_, i) =>
    addDays(lastWeekStart, i).getTime(),
  )
  const commits = useQuery(api.aggregate.projectCommits, {
    projectId,
    lastWeekStart: lastWeekStart.getTime(),
    weekStart: week.getTime(),
    nextWeekStart: addWeeks(week, 1).getTime(),
    dayStarts,
  })

  const allDone = total !== undefined && total > 0 && done === total
  const noneDone = total !== undefined && total > 0 && (done ?? 0) === 0
  const minutes = time?.minutes ?? 0
  const thisWeek = commits?.thisWeek ?? 0

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Block>
        <Figure
          icon={allDone ? <CircleCheckBig /> : <Circle />}
          n={total === undefined ? undefined : `${done ?? 0}/${total}`}
          label="tasks done"
          tone={allDone ? 'good' : noneDone ? 'warn' : 'plain'}
          note={
            allDone ? 'all clear' : noneDone ? 'nothing ticked yet' : undefined
          }
        />
      </Block>

      <Block>
        <div className="flex items-start justify-between gap-3">
          <Figure
            icon={<Clock />}
            n={time === undefined ? undefined : durationLabel(minutes)}
            label="this month"
            tone={minutes === 0 ? 'warn' : 'good'}
            note={minutes === 0 ? 'log some time' : undefined}
          />
          {project.minutesTargetMonthly !== undefined ? (
            <Ring
              value={minutes}
              target={project.minutesTargetMonthly}
              tone={minutes >= project.minutesTargetMonthly ? 'good' : 'accent'}
              size={52}
              stroke={6}
            />
          ) : null}
        </div>
        <Target
          projectId={projectId}
          field="minutesTargetMonthly"
          current={project.minutesTargetMonthly}
          unit="min a month"
          shown={
            project.minutesTargetMonthly === undefined
              ? undefined
              : `of ${durationLabel(project.minutesTargetMonthly)}`
          }
        />
      </Block>

      {commits?.repo ? (
        <Block>
          <div className="flex items-start justify-between gap-3">
            <Figure
              icon={<GitCommitHorizontal />}
              n={String(thisWeek)}
              label="commits this week"
              tone="plain"
            />
            {project.commitTargetWeekly !== undefined ? (
              <Ring
                value={thisWeek}
                target={project.commitTargetWeekly}
                tone={
                  thisWeek >= project.commitTargetWeekly ? 'good' : 'accent'
                }
                size={52}
                stroke={6}
              />
            ) : null}
          </div>
          <div className="pt-1">
            <CommitStrip days={commits.days} />
          </div>
          <Target
            projectId={projectId}
            field="commitTargetWeekly"
            current={project.commitTargetWeekly}
            unit="a week"
            shown={
              project.commitTargetWeekly === undefined
                ? undefined
                : `of ${project.commitTargetWeekly}`
            }
          />
        </Block>
      ) : null}

      <LogBlock projectId={projectId} area={area} />
    </div>
  )
}

/* A panel rather than a column of loose text: it has an edge, so the grid
   reads as blocks that fill the card instead of items that ran out. */
function Block({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col justify-between gap-2 rounded-[14px] bg-lift/[0.03] px-4 py-3 ring-1 ring-lift/[0.06] ring-inset">
      {children}
    </div>
  )
}

function Figure({
  icon,
  n,
  label,
  tone,
  note,
}: {
  icon: ReactNode
  n: string | undefined
  label: string
  tone: 'good' | 'warn' | 'plain'
  note?: string
}) {
  const text =
    tone === 'good'
      ? 'text-state-good'
      : tone === 'warn'
        ? 'text-state-warn'
        : 'text-foreground'

  return (
    <div className="flex min-w-0 flex-col">
      <span
        className={`flex items-center gap-1.5 text-[26px] leading-none font-light ${text}`}
      >
        <span
          className={`[&>svg]:size-3.5 ${tone === 'plain' ? 'text-ink-600' : ''}`}
        >
          {icon}
        </span>
        {n ?? '—'}
      </span>
      <span className="label-caps truncate pt-2">{label}</span>
      {note ? (
        <span className={`pt-0.5 text-[11px] ${text} opacity-80`}>{note}</span>
      ) : null}
    </div>
  )
}

/* The target, set where the number it belongs to lives. §1 still decides
   whether a ring exists at all: empty means no ring, never a guessed one. */
function Target({
  projectId,
  field,
  current,
  unit,
  shown,
}: {
  projectId: Doc<'projects'>['_id']
  field: 'minutesTargetMonthly' | 'commitTargetWeekly'
  current: number | undefined
  unit: string
  shown: string | undefined
}) {
  const setTargets = useMutation(api.projects.setTargets)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(current?.toString() ?? '')

  function save() {
    void setTargets({
      projectId,
      [field]: value.trim() === '' ? null : Number(value),
    })
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="label-caps self-start text-ink-700 transition-colors hover:text-ink-400"
      >
        {shown ?? 'set a target'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        inputMode="numeric"
        placeholder="—"
        className="w-14 rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-center font-mono text-[12px] text-ink-300 outline-none"
      />
      <span className="label-caps">{unit}</span>
      <button
        type="button"
        onClick={save}
        aria-label="Save target"
        className="motion-press grid size-5 place-items-center rounded-[6px] bg-lav-900/70 text-lav-300 ring-1 ring-lav-500/50 ring-inset"
      >
        <CornerDownLeft className="size-2.5" />
      </button>
    </div>
  )
}

/* Logging is a thing you do, so it is a block of its own rather than a field
   adrift in a row of readings (20 Sep). */
function LogBlock({
  projectId,
  area,
}: {
  projectId: Doc<'projects'>['_id']
  area: Area | undefined
}) {
  const createLog = useMutation(api.logs.create)
  const [minutes, setMinutes] = useState('')
  const saving = useSave()

  async function log() {
    const value = Number(minutes)
    /* No area means the goal above this project has gone missing. Defaulting
       one would file the session under an area he never chose, and a log is
       evidence. */
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
    <Block>
      <span className="label-caps">Log time</span>
      <div className="flex items-center gap-2">
        <input
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void log()
          }}
          inputMode="numeric"
          placeholder="45"
          aria-label="Minutes spent on this project"
          className="w-16 rounded-[8px] border border-lift/10 bg-sink/20 px-2 py-1.5 text-center font-mono text-[13px] text-ink-200 outline-none transition-colors focus:border-lav-500/60 placeholder:text-ink-700"
        />
        <span className="font-mono text-[11.5px] text-ink-600">min</span>
        <button
          type="button"
          disabled={saving.busy}
          onClick={() => void log()}
          className="motion-press ml-auto flex items-center gap-1.5 rounded-[8px] bg-lav-900/70 px-3 py-1.5 text-[12px] text-lav-200 ring-1 ring-lav-500/50 ring-inset transition-colors hover:bg-lav-800"
        >
          <Plus className="size-3" />
          <SaveLabel status={saving.status} onSettled={saving.settle}>
            Add
          </SaveLabel>
        </button>
      </div>
    </Block>
  )
}
