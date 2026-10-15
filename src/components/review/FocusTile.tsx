import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Crosshair } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { CountUp, Stat, Tile } from '@/components/review/parts'

/* The focus project: its tasks done of all its tasks (entity counts — the
   bar's denominator is real), and the week's commits against last week's. */
export function FocusTile({
  focus,
  weekStart,
  end,
}: {
  focus: { id: Id<'projects'>; title: string; done: number; total: number }
  weekStart: number
  end: number
}) {
  const commits = useQuery(api.aggregate.projectCommits, {
    projectId: focus.id,
    lastWeekStart: weekStart - 7 * 86_400_000,
    weekStart,
    nextWeekStart: end,
  })
  return (
    <Tile
      name={focus.title}
      to={`/projects/${focus.id}`}
      area="var(--area-projects)"
      icon={<Crosshair />}
      index={5}
      span="col-span-2"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
        <Stat label="TASKS">
          <CountUp to={focus.done} />
          <span className="text-[15px] text-ink-500"> of {focus.total}</span>
        </Stat>
        {commits?.repo ? (
          <Stat label="COMMITS" was={commits.lastWeek}>
            <CountUp to={commits.thisWeek} />
          </Stat>
        ) : null}
      </div>
      {focus.total > 0 ? (
        <div className="mt-auto h-[5px] overflow-hidden rounded-full bg-lift/[0.07]">
          <b
            style={{ width: `${(focus.done / focus.total) * 100}%` }}
            className="bento-fill block h-full rounded-full bg-(--area)"
          />
        </div>
      ) : null}
    </Tile>
  )
}
