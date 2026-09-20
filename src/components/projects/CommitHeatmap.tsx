import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { areaVars } from '@/lib/areas'
import type { Area } from '@/lib/capture-parser'
import { addDays, startOfWeek } from '@/lib/weeks'

const WEEKS = 53
/* Never shrink below a season: a grid that resized every time he pushed
   would make the shape of the thing depend on the last commit. */
const MIN_WEEKS = 14
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
   figure, the square only says more or less.

   It starts at the first commit, not 53 weeks back (20 Sep, second pass).
   A three-week-old repo drew 50 weeks of empty squares — 360 of 424 cells
   said nothing, and "nothing stored" and "did not work" looked identical.
   Weeks before the project existed are not a year of not working, so they
   are not drawn. The window still grows to a full year as the repo ages. */
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

  /* The first week that holds anything. Everything before it is time this
     repo did not exist for, so it is not drawn. */
  const firstDay = activity.days.findIndex((n) => n > 0)
  const firstWeek =
    firstDay === -1
      ? WEEKS - MIN_WEEKS
      : Math.min(Math.floor(firstDay / 7), WEEKS - MIN_WEEKS)
  const weeks = WEEKS - firstWeek
  const at = (w: number, d: number) => (firstWeek + w) * 7 + d

  /* A month's label sits over the first column that contains its 1st. */
  const labels = Array.from({ length: weeks }, (_, w) => {
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(dayStarts[at(w, d)])
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

      {/* 13px, not 10 and not stretched. Letting the columns flex to fill the
          card made them 51px squares and the card 600px tall — worse than the
          447px of dead space it was meant to cure. The grid takes the width it
          needs and the commit list beside it absorbs the rest. */}
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          <div className="flex gap-[3px]">
            {labels.map((label, w) => (
              <span
                key={w}
                className="label-caps w-[13px] shrink-0 overflow-visible whitespace-nowrap"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="flex gap-[3px]">
            {Array.from({ length: weeks }, (_, w) => (
              /* The year draws itself in, a week at a time (20 Sep). Staggered
                 per column rather than per cell: 98 separately animated
                 squares is a lot of work for the same 400ms, and the eye reads
                 the sweep, not the cell. */
              <div
                key={w}
                style={{ animationDelay: `${Math.min(w * 14, 700)}ms` }}
                className="motion-arrive flex flex-col gap-[3px]"
              >
                {Array.from({ length: 7 }, (__, d) => {
                  const i = at(w, d)
                  const n = activity.days[i] ?? 0
                  const date = new Date(dayStarts[i])
                  const future = dayStarts[i] > Date.now()
                  return (
                    <span
                      key={d}
                      title={`${n} commit${n === 1 ? '' : 's'} · ${date.toDateString()}`}
                      className={`size-[13px] rounded-[3px] ${
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
