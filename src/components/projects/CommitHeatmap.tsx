import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { areaVars } from '@/lib/areas'
import type { Area } from '@/lib/capture-parser'
import { addDays, startOfWeek } from '@/lib/weeks'

const WEEKS = 53
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/* A year of commits as a grid (20 Sep), the shape he asked for.

   It reads the same stored rows the counts beside it read, so the grid and
   the numbers can never disagree, and merge commits are left out of both. The
   colour is the project's area rather than GitHub's green: this is his app
   showing his repo, and the one thing colour means here is what kind of thing
   something is.

   Four steps, not a gradient: a gradient invites you to read a shade back as
   a number, and these are counts of stored rows — the tooltip says the real
   figure, the square only says more or less. */
export function CommitHeatmap({
  projectId,
  area,
}: {
  projectId: Id<'projects'>
  area: Area | undefined
}) {
  /* 53 columns ending with the current week, each a local Monday — computed
     here because a day boundary depends on where you are. */
  const thisWeek = startOfWeek()
  const first = addDays(thisWeek, -7 * (WEEKS - 1))
  const dayStarts = Array.from({ length: WEEKS * 7 }, (_, i) =>
    addDays(first, i).getTime(),
  )

  const activity = useQuery(api.aggregate.projectActivity, {
    projectId,
    dayStarts,
    end: addDays(thisWeek, 7).getTime(),
  })

  if (activity === undefined || activity.repo === null) return null

  const busiest = Math.max(...activity.days, 1)
  const step = (n: number) => {
    if (n === 0) return 0
    if (n <= busiest * 0.25) return 1
    if (n <= busiest * 0.5) return 2
    if (n <= busiest * 0.75) return 3
    return 4
  }
  const tone = [
    'bg-lift/[0.06]',
    'bg-(--area)/25',
    'bg-(--area)/45',
    'bg-(--area)/70',
    'bg-(--area)',
  ]

  /* A month's label sits over the first column that contains its 1st. */
  const labels = Array.from({ length: WEEKS }, (_, w) => {
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(dayStarts[w * 7 + d])
      if (date.getDate() === 1) return MONTHS[date.getMonth()]
    }
    return ''
  })

  return (
    <div
      style={area ? areaVars(area) : undefined}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-caps">{activity.total} commits this year</span>
        {!activity.complete ? (
          /* Said out loud rather than drawn as empty squares: a grid that
             stopped early would read as a year of not working. */
          <span className="font-mono text-[11px] text-ink-500">
            older commits not all stored
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-[3px]">
            {labels.map((label, w) => (
              <span
                key={w}
                className="label-caps w-[10px] shrink-0 overflow-visible whitespace-nowrap"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex gap-[3px]">
            {Array.from({ length: WEEKS }, (_, w) => (
              <div key={w} className="flex flex-col gap-[3px]">
                {Array.from({ length: 7 }, (__, d) => {
                  const i = w * 7 + d
                  const n = activity.days[i] ?? 0
                  const date = new Date(dayStarts[i])
                  const future = dayStarts[i] > Date.now()
                  return (
                    <span
                      key={d}
                      title={`${n} commit${n === 1 ? '' : 's'} · ${date.toDateString()}`}
                      className={`size-[10px] rounded-[2px] ${
                        future ? 'bg-transparent' : tone[step(n)]
                      }`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
