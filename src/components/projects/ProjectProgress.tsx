import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { Ring } from '@/components/Ring'
import { durationLabel } from '@/lib/format'
import { addWeeks, startOfWeek } from '@/lib/weeks'

/* The right-hand side of a project's header (20 Sep).

   The numbers keep their place on the left, as they were — he asked for that
   twice. What goes here is the reading of them against a target, in the space
   that was doing nothing on a wide screen.

   A ring appears only where he has set a target (PLAN.md §1: a bar needs a
   real denominator, and a plausible one is still invented). Set neither, and
   this whole column is nothing — which is honest, and better than a ring with
   a made-up "typical week" behind it. */
export function ProjectProgress({ project }: { project: Doc<'projects'> }) {
  const now = new Date()
  const time = useQuery(api.aggregate.projectTime, {
    projectId: project._id,
    start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
  })

  const week = startOfWeek()
  const commits = useQuery(api.aggregate.projectCommits, {
    projectId: project._id,
    lastWeekStart: addWeeks(week, -1).getTime(),
    weekStart: week.getTime(),
    nextWeekStart: addWeeks(week, 1).getTime(),
  })

  const minutesTarget = project.minutesTargetMonthly
  const commitTarget = project.commitTargetWeekly
  if (minutesTarget === undefined && commitTarget === undefined) return null

  const minutes = time?.minutes ?? 0
  const done = commits?.thisWeek ?? 0

  return (
    <div className="flex items-start gap-6">
      {minutesTarget !== undefined ? (
        <Dial
          value={minutes}
          target={minutesTarget}
          tone={minutes >= minutesTarget ? 'good' : 'accent'}
          middle={durationLabel(minutes)}
          label="this month"
          of={durationLabel(minutesTarget)}
        />
      ) : null}

      {commitTarget !== undefined && commits?.repo ? (
        <Dial
          value={done}
          target={commitTarget}
          tone={done >= commitTarget ? 'good' : 'accent'}
          middle={String(done)}
          label="commits"
          of={String(commitTarget)}
        />
      ) : null}
    </div>
  )
}

function Dial({
  value,
  target,
  tone,
  middle,
  label,
  of,
}: {
  value: number
  target: number
  tone: 'good' | 'accent'
  middle: string
  label: string
  of: string
}) {
  const there = value >= target

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Ring value={value} target={target} tone={tone} size={72} stroke={7}>
        <span
          className={`text-[15px] leading-none font-light ${
            there ? 'text-state-good' : 'text-foreground'
          }`}
        >
          {middle}
        </span>
      </Ring>
      <div className="flex flex-col items-center">
        <span className="label-caps">{label}</span>
        <span className="label-caps text-ink-700">
          {there ? 'target met' : `of ${of}`}
        </span>
      </div>
    </div>
  )
}
