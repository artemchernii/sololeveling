import { useState } from 'react'
import { useMutation } from 'convex/react'
import { CircleOff, Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { TargetBar, TargetInput } from '@/components/dashboard/ActionsLogged'
import { areaVars } from '@/lib/areas'
import { targetLine } from '@/lib/month'
import type { MonthTile } from '@/lib/tiles'

/* A monthly target (24 Sep). It sat on this page as a goal card like any
   other — "target 4 sessions a month" — and never said how many had been
   done, which is the only thing anyone opens it for.

   So it is drawn the way its tile on Today is: the count this month from
   monthCounts (a log count, source 1), "of" the goal's targetValue, the
   bar that only a real denominator earns, and the words "2 to go · 6 days
   left". Two sanctioned values set side by side, never a ratio stored.

   Every one of the six tiles has a card here, set or not (24 Sep: "we have
   languages and body, maybe we should have finances"). A tile without a
   target shows its count and one way to set one — this page is where you
   set them now, not only the Today tile. The number on a set target is
   tapped to change it, the same input the tile uses. */
export function MonthTarget({
  goal,
  tile,
  count,
  daysLeft,
}: {
  /** The target's goal, or undefined when this tile has none. */
  goal: Doc<'goals'> | undefined
  tile: MonthTile
  /** This month's count for the tile; undefined while loading. */
  count: number | undefined
  daysLeft: number
}) {
  const setStatus = useMutation(api.goals.setStatus)
  const [editing, setEditing] = useState(false)
  const target = goal?.targetValue
  const set = goal !== undefined && target !== undefined

  return (
    <div
      style={tile.area ? areaVars(tile.area) : undefined}
      className={`glass flex flex-col gap-1 rounded-[20px] p-5 transition-opacity ${
        set || editing ? '' : 'opacity-75 hover:opacity-100'
      }`}
    >
      <div className="flex min-h-7 items-center gap-2">
        <span
          className={`label-caps flex-1 truncate ${tile.area ? 'text-(--area)' : ''}`}
        >
          {tile.label}
        </span>
        {/* Clearing only (24 Sep). There was a Delete beside Drop that took
            the target away for good with no way back, and Artem worried it
            would break Today. This does exactly what clearing the target on
            the tile does — the tile keeps counting from the log, and the
            target can be set again. */}
        {set && !editing ? (
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
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-[34px] leading-none font-light text-foreground">
          {count ?? '—'}
        </span>
        {set && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Change the monthly target"
            className="-mx-1 rounded-[5px] px-1 text-[16px] font-light text-ink-400 transition-colors hover:bg-lift/10 hover:text-ink-200"
          >
            of {target}
          </button>
        ) : null}
        <span className="text-[12.5px] text-ink-500">{tile.noun}</span>
      </div>

      {goal?.targetLabel && !editing ? (
        <div className="text-[12px] text-ink-600 italic">
          {goal.targetLabel}
        </div>
      ) : null}

      {editing ? (
        <div className="motion-arrive mt-2 flex items-center font-mono">
          <TargetInput
            tile={tile.key}
            current={
              set
                ? {
                    value: target,
                    ...(goal.targetLabel ? { label: goal.targetLabel } : {}),
                  }
                : undefined
            }
            onClose={() => setEditing(false)}
          />
        </div>
      ) : set && count !== undefined ? (
        <>
          <TargetBar count={count} target={target} area={tile.area} />
          <div className="mt-1.5 font-mono text-[11px] text-ink-500">
            {targetLine(count, target, daysLeft)}
          </div>
        </>
      ) : !set ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`motion-press mt-2 inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1 text-[12px] ring-1 transition-colors ${
            tile.area
              ? 'text-(--area) ring-(--area)/35 hover:bg-(--area)/10'
              : 'text-ink-300 ring-lift/15 hover:bg-lift/[0.05]'
          }`}
        >
          <Plus className="size-3.5" />
          Set a target
        </button>
      ) : null}
    </div>
  )
}
