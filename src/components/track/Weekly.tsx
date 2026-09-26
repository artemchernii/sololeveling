import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, Minus, Plus, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { useQuestOnReach } from '@/components/track/QuestComplete'
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

/* One kind this week, as a small chip (Body's since 26 Sep; Languages'
   too the same day, so the two heroes read alike). With a target it gets a
   bar — this week's logs over the target — and turns to the good state when
   met: the only thing the colour says is "done". Without one it shows its
   count and "+ goal". Tap it to set or change the target. The chip that
   reaches its target pops [ QUEST COMPLETE ]. */
export function WeekChip({
  area,
  kind,
  category,
  name,
  icon,
  questIcon,
  questTitle = name,
  suggested,
  editSpan,
  delay,
}: {
  area: string
  kind: 'workout' | 'intake' | 'session'
  category: string
  name: string
  icon: ReactNode
  /** The same icon, drawn big for the popup. */
  questIcon: ReactNode
  /** What the popup calls it — "Class · Português". */
  questTitle?: string
  suggested: number
  /** The grid span the editor takes when it opens — the whole row. */
  editSpan: string
  delay: number
}) {
  const { count, target } = useWeeklyProgress(area, kind, category)
  const [editing, setEditing] = useState(false)
  const met = target !== undefined && count !== undefined && count >= target
  useQuestOnReach(count, target, () => ({
    title: questTitle,
    line: `${count} of ${target} this week`,
    area,
    icon: questIcon,
  }))

  if (editing) {
    return (
      <TargetEditor
        area={area}
        category={category}
        name={name}
        icon={icon}
        current={target}
        suggested={suggested}
        onDone={() => setEditing(false)}
        className={editSpan}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      style={{ animationDelay: `${delay}ms` }}
      aria-label={`${name}: ${count ?? 0} this week${
        target === undefined ? ', no target — set one' : ` of ${target}`
      }`}
      className={`motion-land flex min-w-0 flex-col gap-1.5 rounded-[14px] px-1.5 py-2 text-left ring-1 transition-colors ring-inset sm:p-2.5 ${
        met
          ? 'bg-state-good/10 ring-state-good/40'
          : 'bg-background/30 ring-lav-400/15 hover:bg-lav-400/8 hover:ring-lav-400/40'
      }`}
    >
      <span className="flex items-center justify-between gap-1">
        <span className={met ? 'text-state-good' : 'text-area'}>{icon}</span>
        {met ? (
          <Check
            className="motion-draw size-3.5 text-state-good"
            strokeWidth={3}
          />
        ) : null}
      </span>
      <span className="font-mono text-[15px] leading-none text-foreground sm:text-[17px]">
        <span key={count} className="motion-pop inline-block">
          {count ?? '—'}
        </span>
        {target !== undefined ? (
          <span className="text-[12px] text-ink-500">/{target}</span>
        ) : null}
      </span>
      {target !== undefined ? (
        <span className="h-1 w-full overflow-hidden rounded-full bg-lift/[0.08]">
          <span
            className={`block h-full rounded-full transition-[width] duration-500 ${
              met
                ? 'bg-state-good'
                : 'bg-lav-400 shadow-[0_0_6px_var(--system-shine)]'
            }`}
            style={{
              width: `${Math.min(1, (count ?? 0) / target) * 100}%`,
            }}
          />
        </span>
      ) : (
        <span className="font-mono text-[9.5px] tracking-[0.06em] whitespace-nowrap text-ink-600 uppercase">
          + goal
        </span>
      )}
      <span className="label-caps truncate text-[9.5px] tracking-[0.04em] sm:text-[10.5px] sm:tracking-[0.14em]">
        {name}
      </span>
    </button>
  )
}
