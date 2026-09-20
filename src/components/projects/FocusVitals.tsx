import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { durationLabel } from '@/lib/format'
import { addWeeks, startOfWeek } from '@/lib/weeks'

/* The focus project's vitals (20 Sep). Only the focus card gets these: §3c.2
   keeps every other project to a title and a next action, and the whole point
   of a focus project is that it does not look like the rest.

   Its own component, not props on ProjectCard, because these are two queries
   and only one project needs them — mounting it once is cheaper than asking
   the page for numbers it will throw away for every other card.

   Three of the four sanctioned sources, each read from aggregate.ts and none
   of them computed here: tasks are an entity count, hours are a log count,
   commits are a stored external reading. No percentage, no rate, no score. */
export function FocusVitals({
  projectId,
  done,
  total,
}: {
  projectId: Id<'projects'>
  done: number | undefined
  total: number | undefined
}) {
  /* Month and week bounds on the client, as everywhere else: the server does
     not know what month it is where you are. */
  const now = new Date()
  const time = useQuery(api.aggregate.projectTime, {
    projectId,
    start: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(),
  })

  const week = startOfWeek()
  const commits = useQuery(api.aggregate.projectCommits, {
    projectId,
    lastWeekStart: addWeeks(week, -1).getTime(),
    weekStart: week.getTime(),
    nextWeekStart: addWeeks(week, 1).getTime(),
  })

  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      <Vital
        n={total === undefined ? undefined : `${done ?? 0}/${total}`}
        label="tasks done"
      />
      <Vital
        n={time === undefined ? undefined : durationLabel(time.minutes)}
        label="this month"
      />
      {/* Only when a repo is connected. An absent repo is not a zero. */}
      {commits?.repo ? (
        <Vital n={String(commits.thisWeek)} label="commits this week" />
      ) : null}
    </div>
  )
}

function Vital({ n, label }: { n: string | undefined; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[24px] leading-none font-light text-foreground">
        {n ?? '—'}
      </span>
      <span className="label-caps pt-1.5">{label}</span>
    </div>
  )
}
