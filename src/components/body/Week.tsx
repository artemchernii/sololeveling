import { useState } from 'react'
import { Check } from 'lucide-react'

import { KindIcon, kindName } from '@/components/body/kinds'
import { useQuestOnReach } from '@/components/track/QuestComplete'
import { TargetEditor, useWeeklyProgress } from '@/components/track/Weekly'
import { BODY_ORDER } from '@/lib/body/log-groups'

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

/** This week's count of one Body kind and its target, if it has one. */
export function useWeekProgress(category: string) {
  const shape = WEEK_KINDS.find((k) => k.category === category)
  return useWeeklyProgress('body', shape?.kind ?? 'workout', category)
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
  useQuestOnReach(count, target, () => ({
    title: name,
    line: `${count} of ${target} this week`,
    area: 'body',
    icon: <KindIcon kind={category} className="size-6" />,
  }))

  if (editing) {
    return (
      <TargetEditor
        area="body"
        category={category}
        name={name}
        icon={<KindIcon kind={category} className="size-4" />}
        current={target}
        suggested={category === 'stretch' ? 7 : 3}
        onDone={() => setEditing(false)}
        className="col-span-5"
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
