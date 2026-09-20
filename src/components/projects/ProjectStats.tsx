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
  Target as TargetIcon,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
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
   read.

   Fourth pass, 20 Sep: "a lot of dead space and spinner is not meaningful…
   it looks a bit disconnected". Measured at 1600px, justify-between was
   holding a 98-150px hole open between each number and its ring, and the
   ring's own target sat in a chip at the other corner of the block — three
   parts of one idea in three places. The ring is now the number's emblem: it
   sits against it, and the icon lives in its hole, which is what Ring's
   `children` was written for and no caller ever passed. Blocks with no target
   get the same puck without the arc, so every block has one anatomy and none
   of them look half-built. */
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

  /* A target he set beats the live count as the denominator; with neither
     there is no ring, as §1 requires. */
  const denominator =
    project.taskTargetTotal ??
    (total !== undefined && total > 0 ? total : undefined)
  const reached = denominator !== undefined && (done ?? 0) >= denominator
  const noneDone = total !== undefined && total > 0 && (done ?? 0) === 0
  const minutes = time?.minutes ?? 0
  const thisWeek = commits?.thisWeek ?? 0

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Block>
        <div className="flex items-center gap-3.5">
          {/* Without a target the denominator is the live task count, a real
              entity count (§1 source 3) — which can only ever reach "all of
              the ones that exist". A target he sets is the size he reckons
              the project is, and it takes over the denominator (20 Sep). */}
          <Puck
            icon={reached ? <CircleCheckBig /> : <Circle />}
            value={done ?? 0}
            target={denominator}
            tone={reached ? 'good' : 'accent'}
          />
          <Figure
            n={
              total === undefined
                ? undefined
                : `${done ?? 0}/${denominator ?? total}`
            }
            label="tasks done"
            tone={reached ? 'good' : noneDone ? 'warn' : 'plain'}
            note={
              reached
                ? 'all clear'
                : noneDone
                  ? 'nothing ticked yet'
                  : undefined
            }
          />
        </div>
        <Target
          projectId={projectId}
          field="taskTargetTotal"
          current={project.taskTargetTotal}
          unit="tasks in all"
          shown={
            project.taskTargetTotal === undefined
              ? undefined
              : `of ${project.taskTargetTotal}`
          }
        />
      </Block>

      <Block>
        <div className="flex items-center gap-3.5">
          <Puck
            icon={<Clock />}
            value={minutes}
            target={project.minutesTargetMonthly}
            tone={
              project.minutesTargetMonthly !== undefined &&
              minutes >= project.minutesTargetMonthly
                ? 'good'
                : 'accent'
            }
          />
          <Figure
            n={time === undefined ? undefined : durationLabel(minutes)}
            label="this month"
            tone={minutes === 0 ? 'warn' : 'good'}
            note={minutes === 0 ? 'log some time' : undefined}
          />
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
          <div className="flex items-center gap-3.5">
            <Puck
              icon={<GitCommitHorizontal />}
              value={thisWeek}
              target={project.commitTargetWeekly}
              tone={
                project.commitTargetWeekly !== undefined &&
                thisWeek >= project.commitTargetWeekly
                  ? 'good'
                  : 'accent'
              }
            />
            <Figure
              n={String(thisWeek)}
              label="commits this week"
              tone="plain"
            />
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

/* The emblem: the block's icon, wearing its own progress. With a target it
   is the Ring with the icon in the hole; without one it is the same disc,
   quiet, so a block that has no target still looks finished rather than
   missing a piece. §1 is unchanged — no target, no arc, nothing inferred. */
function Puck({
  icon,
  value,
  target,
  tone,
}: {
  icon: ReactNode
  value: number
  target: number | undefined
  tone: 'good' | 'warn' | 'accent'
}) {
  const glyph = (
    <span
      className={`[&>svg]:size-4 ${
        target === undefined
          ? 'text-ink-600'
          : tone === 'good'
            ? 'text-state-good'
            : 'text-lav-300'
      }`}
    >
      {icon}
    </span>
  )

  if (target === undefined) {
    return (
      <div className="grid size-[52px] shrink-0 place-items-center rounded-full ring-1 ring-lift/10 ring-inset">
        {glyph}
      </div>
    )
  }

  return (
    <Ring value={value} target={target} tone={tone} size={52} stroke={5}>
      {glyph}
    </Ring>
  )
}

function Figure({
  n,
  label,
  tone,
  note,
}: {
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
      <span className={`text-[26px] leading-none font-light ${text}`}>
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
  field: 'minutesTargetMonthly' | 'commitTargetWeekly' | 'taskTargetTotal'
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
    /* A chip with an edge and an icon, not bare text (20 Sep). It was
       styled as a label, so "OF 100" read as a caption and he could not
       find where targets were set — the control was invisible because it
       was dressed as a number. */
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="motion-press label-caps inline-flex items-center gap-1.5 self-start rounded-full border border-lift/12 px-2 py-1 text-ink-500 transition-colors hover:border-lav-500/50 hover:text-lav-300"
      >
        <TargetIcon className="size-3" />
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
      <div className="flex items-center gap-3.5">
        <div className="grid size-[52px] shrink-0 place-items-center rounded-full ring-1 ring-lav-500/25 ring-inset">
          <Clock className="size-4 text-lav-300/70" />
        </div>
        <div className="flex min-w-0 flex-col">
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
              className="w-14 rounded-[8px] border border-lift/10 bg-sink/20 px-2 py-1.5 text-center font-mono text-[13px] text-ink-200 outline-none transition-colors focus:border-lav-500/60 placeholder:text-ink-700"
            />
            <span className="font-mono text-[11.5px] text-ink-600">min</span>
            <button
              type="button"
              disabled={saving.busy}
              onClick={() => void log()}
              className="motion-press flex items-center gap-1.5 rounded-[8px] bg-lav-900/70 px-3 py-1.5 text-[12px] text-lav-200 ring-1 ring-lav-500/50 ring-inset transition-colors hover:bg-lav-800"
            >
              <Plus className="size-3" />
              <SaveLabel status={saving.status} onSettled={saving.settle}>
                Add
              </SaveLabel>
            </button>
          </div>
          <span className="label-caps pt-2">log time</span>
        </div>
      </div>
    </Block>
  )
}
