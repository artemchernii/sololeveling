import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Minus, Plus, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { useDayStarts } from '@/components/track/useDayStarts'
import { addDays, startOfWeek } from '@/lib/weeks'

/* This week against what he means to do, for any tracking page (26 Sep).
   Body had it first; Languages asked for the same ("target for weekly
   lessons 2"). A count — aggregate.kindCount, Monday to Sunday — and the
   targetValue of the goal goals.setWeeklyTarget keeps for that area and
   kind. Nothing here divides one by the other except the bar that shows
   them side by side. */

const BODY = 'body'

/** Monday this week to Monday next, local — moving on at midnight. */
export function useWeekRange(): { start: number; end: number } {
  const today = useDayStarts(1).at(-1) as number
  const start = startOfWeek(new Date(today))
  return { start: start.getTime(), end: addDays(start, 7).getTime() }
}

/** This week's count of one kind in one area, and its target if it has one. */
export function useWeeklyProgress(
  area: string,
  kind: 'workout' | 'intake' | 'session',
  category: string,
) {
  const { start, end } = useWeekRange()
  const count = useQuery(api.aggregate.kindCount, {
    kind,
    area,
    category,
    start,
    end,
  })
  const targets = useQuery(api.goals.weeklyTargets, {})
  const target = targets?.find(
    (t) => t.area === area && t.category === category,
  )?.targetValue
  return { count, target }
}

/* One number, stepped: how many a week. Clear drops the goal. */
export function TargetEditor({
  area,
  category,
  name,
  icon,
  current,
  suggested = 3,
  onDone,
  className = '',
}: {
  area: string
  category: string
  /** "Gym", "Class" — read as "Gym a week". */
  name: string
  icon: ReactNode
  current: number | undefined
  /** Where the stepper starts when there is no target yet. */
  suggested?: number
  onDone: () => void
  className?: string
}) {
  const set = useMutation(api.goals.setWeeklyTarget)
  const clear = useMutation(api.goals.clearWeeklyTarget)
  const [n, setN] = useState(current ?? suggested)
  /* Body's goals were written before a target had an area; the mutation
     reads no area as Body, so Body sends none. */
  const where = area === BODY ? {} : { area }
  const step =
    'motion-press grid size-6 place-items-center rounded-full text-ink-300 ring-1 ring-lav-400/25 ring-inset hover:text-foreground hover:ring-lav-400/50'
  return (
    <div
      className={`motion-pop flex flex-wrap items-center gap-2 rounded-[10px] bg-background/40 p-2.5 ring-1 ring-lav-400/30 ring-inset ${className}`}
    >
      <span className="text-area">{icon}</span>
      <span className="text-[13px] text-ink-200">{name} a week</span>
      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          aria-label="One fewer"
          onClick={() => setN((v) => Math.max(1, v - 1))}
          className={step}
        >
          <Minus className="size-3" />
        </button>
        <span className="w-5 text-center font-mono text-[16px] text-foreground">
          {n}
        </span>
        <button
          type="button"
          aria-label="One more"
          onClick={() => setN((v) => Math.min(14, v + 1))}
          className={step}
        >
          <Plus className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => {
            void set({ ...where, category, targetValue: n }).then(onDone)
          }}
          className="motion-press rounded-full bg-lav-400 px-3 py-1 text-[12.5px] font-medium text-background shadow-[0_0_14px_-4px_var(--system-shine)]"
        >
          Set
        </button>
        {current !== undefined ? (
          <button
            type="button"
            onClick={() => {
              void clear({ ...where, category }).then(onDone)
            }}
            className="motion-press rounded-full px-2 py-1 text-[12px] text-ink-400 hover:text-state-danger"
          >
            Clear
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Cancel"
          onClick={onDone}
          className="motion-press grid size-6 place-items-center rounded-full text-ink-500 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </span>
    </div>
  )
}
