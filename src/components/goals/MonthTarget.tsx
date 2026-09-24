import { useMutation } from 'convex/react'
import { CircleOff } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { TargetBar } from '@/components/dashboard/ActionsLogged'
import { areaVars } from '@/lib/areas'
import { targetLine } from '@/lib/month'
import type { MonthTile } from '@/lib/tiles'

/* A monthly target (24 Sep). It sat on this page as a goal card like any
   other — "target 4 sessions a month" — and never said how many had been
   done, which is the only thing anyone opens it for.

   So it is drawn the way its tile on Today is: the count this month from
   monthCounts (a log count, source 1), "of" the goal's targetValue, the
   bar that only a real denominator earns, and the words "2 to go · 6 days
   left". Two sanctioned values set side by side, never a ratio stored. */
export function MonthTarget({
  goal,
  tile,
  count,
  daysLeft,
}: {
  goal: Doc<'goals'>
  tile: MonthTile | undefined
  /** This month's count for the goal's tile; undefined while loading. */
  count: number | undefined
  daysLeft: number
}) {
  const setStatus = useMutation(api.goals.setStatus)
  const target = goal.targetValue

  return (
    <div
      style={tile?.area ? areaVars(tile.area) : undefined}
      className="glass motion-arrive flex flex-col gap-1 rounded-[20px] p-5"
    >
      <div className="flex items-center gap-2">
        <span
          className={`label-caps flex-1 truncate ${tile?.area ? 'text-(--area)' : ''}`}
        >
          {tile?.label ?? goal.title}
        </span>
        {/* Clearing only (24 Sep). This card is the target set on a Today
            tile, and there was a Delete beside Drop that took the target
            away for good with no way back. Artem worried it would break
            Today. What it does is exactly what clearing the target on the
            tile does — the tile keeps counting from the log, and the
            target can be set there again. */}
        <button
          type="button"
          title="Takes the target off the Today tile. What you logged stays."
          aria-label={`Clear the target: ${goal.title}`}
          onClick={() =>
            void setStatus({ goalId: goal._id, status: 'dropped' })
          }
          className="motion-press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] text-ink-500 ring-1 ring-lift/10 transition-colors hover:text-ink-200 hover:ring-lift/20"
        >
          <CircleOff className="size-3.5" />
          Clear target
        </button>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[34px] leading-none font-light text-foreground">
          {count ?? '—'}
        </span>
        {target !== undefined ? (
          <span className="text-[16px] font-light text-ink-400">
            of {target}
          </span>
        ) : null}
        <span className="text-[12.5px] text-ink-500">
          {tile?.noun ?? goal.unit ?? ''}
        </span>
      </div>

      {goal.targetLabel ? (
        <div className="text-[12px] text-ink-600 italic">
          {goal.targetLabel}
        </div>
      ) : null}

      {target !== undefined && count !== undefined ? (
        <>
          <TargetBar count={count} target={target} area={tile?.area} />
          <div className="mt-1.5 font-mono text-[11px] text-ink-500">
            {targetLine(count, target, daysLeft)}
          </div>
        </>
      ) : null}
    </div>
  )
}
