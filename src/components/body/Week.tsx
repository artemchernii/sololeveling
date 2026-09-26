import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, Minus, Plus, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { KindIcon, kindName } from '@/components/body/kinds'
import { useDayStarts } from '@/components/track/useDayStarts'
import { BODY_ORDER } from '@/lib/body/log-groups'
import { addDays, startOfWeek } from '@/lib/weeks'

/* This week against what he means to do (26 Sep: "we lack a bit of emotion
   or motivation"). A kind with a weekly target — a goal row,
   goals.setWeeklyTarget — gets a bar: this week's logs of it
   (aggregate.kindCount, Monday to Sunday) over the target he set. A kind
   without one shows its count and nothing to fill; tap it to set one. When
   the count reaches the target the chip turns to the good state: the only
   thing the colour says is "done". */

type WeekKind = {
  category: string
  kind: 'workout' | 'intake'
}

/* The same order History uses (BODY_ORDER). */
export const WEEK_KINDS: ReadonlyArray<WeekKind> = BODY_ORDER.map(
  (category) => ({
    category,
    kind: category === 'supplements' ? 'intake' : 'workout',
  }),
)

/** Monday this week to Monday next, local — moving on at midnight. */
export function useWeekRange(): { start: number; end: number } {
  const today = useDayStarts(1).at(-1) as number
  const start = startOfWeek(new Date(today))
  return { start: start.getTime(), end: addDays(start, 7).getTime() }
}

/** This week's count of one kind and its target, if it has one. */
export function useWeekProgress(category: string) {
  const { start, end } = useWeekRange()
  const shape = WEEK_KINDS.find((k) => k.category === category)
  const count = useQuery(api.aggregate.kindCount, {
    kind: shape?.kind ?? 'workout',
    area: 'body',
    category,
    start,
    end,
  })
  const targets = useQuery(api.goals.weeklyTargets, {})
  const target = targets?.find((t) => t.category === category)?.targetValue
  return { count, target }
}

export function WeekChips() {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {WEEK_KINDS.map((k, i) => (
        <WeekChip key={k.category} category={k.category} delay={80 + i * 50} />
      ))}
    </div>
  )
}

function WeekChip({ category, delay }: { category: string; delay: number }) {
  const { count, target } = useWeekProgress(category)
  const [editing, setEditing] = useState(false)
  const met = target !== undefined && count !== undefined && count >= target
  const name = kindName(category)

  if (editing) {
    return (
      <TargetEditor
        category={category}
        current={target}
        onDone={() => setEditing(false)}
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
          : 'bg-background/30 ring-lift/10 hover:ring-lift/25'
      }`}
    >
      <span className="flex items-center justify-between gap-1">
        <span className={met ? 'text-state-good' : 'text-area'}>
          <KindIcon kind={category} className="size-4" />
        </span>
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
              met ? 'bg-state-good' : 'bg-(--area)'
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

/* One number, stepped: how many a week. Clear drops the goal. */
function TargetEditor({
  category,
  current,
  onDone,
}: {
  category: string
  current: number | undefined
  onDone: () => void
}) {
  const set = useMutation(api.goals.setWeeklyTarget)
  const clear = useMutation(api.goals.clearWeeklyTarget)
  const [n, setN] = useState(current ?? (category === 'stretch' ? 7 : 3))
  const step =
    'motion-press grid size-6 place-items-center rounded-full text-ink-300 ring-1 ring-lift/15 ring-inset hover:text-foreground'
  return (
    <div className="motion-pop col-span-5 flex flex-wrap items-center gap-2 rounded-[14px] bg-background/40 p-2.5 ring-1 ring-lift/20 ring-inset">
      <span className="text-area">
        <KindIcon kind={category} className="size-4" />
      </span>
      <span className="text-[13px] text-ink-200">
        {kindName(category)} a week
      </span>
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
            void set({ category, targetValue: n }).then(onDone)
          }}
          className="motion-press rounded-full bg-(--area) px-3 py-1 text-[12.5px] font-medium text-background"
        >
          Set
        </button>
        {current !== undefined ? (
          <button
            type="button"
            onClick={() => {
              void clear({ category }).then(onDone)
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

/* The line the Finish moment shows: this kind, this week, against the
   target — or just the count when there is none. */
export function WeekLine({ category }: { category: string }) {
  const { count, target } = useWeekProgress(category)
  if (count === undefined) return null
  const met = target !== undefined && count >= target
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-ink-200">
        {kindName(category)} this week:{' '}
        <span className="font-mono text-foreground">{count}</span>
        {target !== undefined ? (
          <>
            {' '}
            of <span className="font-mono text-foreground">{target}</span>
            {met ? (
              <span className="text-state-good"> — target reached</span>
            ) : null}
          </>
        ) : null}
      </span>
      {target !== undefined ? (
        <span className="h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-lift/[0.08]">
          <span
            className={`block h-full rounded-full transition-[width] duration-700 ${
              met ? 'bg-state-good' : 'bg-(--area)'
            }`}
            style={{ width: `${Math.min(1, count / target) * 100}%` }}
          />
        </span>
      ) : null}
    </div>
  )
}
