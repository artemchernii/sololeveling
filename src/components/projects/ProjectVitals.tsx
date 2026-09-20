import type { ReactNode } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  CircleCheckBig,
  Clock,
  GitCommitHorizontal,
  Circle,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { CommitStrip } from '@/components/projects/CommitStrip'
import { durationLabel, whenLabel } from '@/lib/format'
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

   The rings that read these against a target live in ProjectProgress, on the
   right of the header where there was nothing: he asked for the numbers to
   stay as they are and the spinners to fill the empty side. */
export function ProjectVitals({
  projectId,
  done,
  total,
}: {
  projectId: Id<'projects'>
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

  return (
    /* The numbers, then who they came from (21 Sep). The attribution is a
       line the card owed anyway: PLAN.md §1 says an external reading is
       shown as of a time, commit counts are source 4, and this card showed
       the same numbers the project page does with nothing saying when they
       were read. Its column places it; this only says what it is. */
    <div className="flex flex-col gap-4">
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
        />

        {commits?.repo ? (
          <div className="flex items-end gap-3">
            <Vital
              icon={<GitCommitHorizontal />}
              n={String(commits.thisWeek)}
              label="commits this week"
              tone="plain"
            />
            <div className="pb-[18px]">
              <CommitStrip days={commits.days} />
            </div>
          </div>
        ) : null}
      </div>

      {commits?.repo ? (
        <div className="flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] text-ink-700">
          <span className="truncate">{commits.repo}</span>
          <span>·</span>
          <span>
            {commits.checkedAt === null
              ? 'never checked'
              : `as of ${whenLabel(commits.checkedAt)}`}
          </span>
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
}
