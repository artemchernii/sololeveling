import type { ReactNode } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  CircleCheckBig,
  Clock,
  GitCommitHorizontal,
  Circle,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { CommitStrip } from '@/components/projects/CommitStrip'
import { Ring } from '@/components/Ring'
import { durationLabel } from '@/lib/format'
import { addDays, addWeeks, startOfWeek } from '@/lib/weeks'

/* A project's vitals (20 Sep). On the focus card, where §3c.2 keeps every
   other project to a title and a next action, and on a project's own page.

   Rewritten the same day, because grey numerals under grey labels told him
   nothing: "2/2 tasks done should have some color… it should CALL TO ACTION".
   So each number carries an icon and a tone, and the tone marks a state
   rather than grading anything (PLAN.md §3d.3):

   - every task done is good; none of them done is a nudge, not a failure
   - no time logged this month is a nudge; any time logged is good
   - commits are neutral unless he has set a target to read them against

   The ring only exists where he set a target, because §1 allows a bar only
   where a real denominator does. No target, no ring — never an invented one. */
export function ProjectVitals({
  projectId,
  project,
  done,
  total,
}: {
  projectId: Id<'projects'>
  project?: Doc<'projects'>
  done: number | undefined
  total: number | undefined
}) {
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

  const minutesTarget = project?.minutesTargetMonthly
  const commitTarget = project?.commitTargetWeekly

  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      <Vital
        icon={allDone ? <CircleCheckBig /> : <Circle />}
        n={total === undefined ? undefined : `${done ?? 0}/${total}`}
        label="tasks done"
        tone={allDone ? 'good' : noneDone ? 'warn' : 'plain'}
        note={
          allDone ? 'all clear' : noneDone ? 'nothing ticked yet' : undefined
        }
      />

      <Vital
        icon={<Clock />}
        n={time === undefined ? undefined : durationLabel(minutes)}
        label="this month"
        tone={minutes === 0 ? 'warn' : 'good'}
        note={minutes === 0 ? 'log some time' : undefined}
        ring={
          minutesTarget !== undefined
            ? {
                value: minutes,
                target: minutesTarget,
                label: `of ${durationLabel(minutesTarget)}`,
              }
            : undefined
        }
      />

      {commits?.repo ? (
        <div className="flex items-end gap-3">
          <Vital
            icon={<GitCommitHorizontal />}
            n={String(commits.thisWeek)}
            label="commits this week"
            tone="plain"
            ring={
              commitTarget !== undefined
                ? {
                    value: commits.thisWeek,
                    target: commitTarget,
                    label: `of ${commitTarget}`,
                  }
                : undefined
            }
          />
          <div className="pb-[18px]">
            <CommitStrip days={commits.days} />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Vital({
  icon,
  n,
  label,
  tone,
  note,
  ring,
}: {
  icon: ReactNode
  n: string | undefined
  label: string
  tone: 'good' | 'warn' | 'plain'
  note?: string
  ring?: { value: number; target: number; label: string }
}) {
  const text =
    tone === 'good'
      ? 'text-state-good'
      : tone === 'warn'
        ? 'text-state-warn'
        : 'text-foreground'

  const body = (
    <div className="flex flex-col">
      <span
        className={`flex items-center gap-1.5 text-[24px] leading-none font-light ${text}`}
      >
        <span
          className={`[&>svg]:size-3.5 ${tone === 'plain' ? 'text-ink-600' : ''}`}
        >
          {icon}
        </span>
        {n ?? '—'}
      </span>
      <span className="label-caps pt-1.5">{label}</span>
      {note ? (
        <span className={`pt-0.5 text-[11px] ${text} opacity-80`}>{note}</span>
      ) : null}
    </div>
  )

  if (ring === undefined) return body

  return (
    <div className="flex items-center gap-3">
      <div className="relative grid place-items-center">
        <Ring
          value={ring.value}
          target={ring.target}
          tone={tone === 'plain' ? 'accent' : tone}
        />
      </div>
      <div className="flex flex-col">
        {body}
        <span className="label-caps pt-0.5 text-ink-700">{ring.label}</span>
      </div>
    </div>
  )
}
