import { useState } from 'react'
import { useMutation } from 'convex/react'
import { CircleOff, Trash2 } from 'lucide-react'

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
  const removeGoal = useMutation(api.goals.remove)
  const [confirming, setConfirming] = useState(false)
  const target = goal.targetValue
  const icon =
    'motion-press grid size-7 place-items-center rounded-[8px] text-ink-600 transition-colors hover:bg-lift/[0.06]'

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
        {confirming ? (
          <button
            type="button"
            autoFocus
            onBlur={() => setConfirming(false)}
            onClick={() => void removeGoal({ goalId: goal._id })}
            className="motion-arrive rounded-full bg-state-danger/15 px-2.5 py-0.5 text-[11.5px] text-state-danger ring-1 ring-state-danger/40"
          >
            Delete?
          </button>
        ) : (
          <>
            <button
              type="button"
              title="Stop this target"
              aria-label={`Drop: ${goal.title}`}
              onClick={() =>
                void setStatus({ goalId: goal._id, status: 'dropped' })
              }
              className={`${icon} hover:text-ink-200`}
            >
              <CircleOff className="size-3.5" />
            </button>
            <button
              type="button"
              title="Delete"
              aria-label={`Delete: ${goal.title}`}
              onClick={() => setConfirming(true)}
              className={`${icon} hover:text-state-danger`}
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
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
