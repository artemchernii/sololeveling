import { KindIcon, kindName } from '@/components/body/kinds'
import { useWeeklyProgress, WeekChip } from '@/components/track/Weekly'
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
        <WeekChip
          key={k.category}
          area="body"
          kind={k.kind}
          category={k.category}
          name={kindName(k.category)}
          icon={<KindIcon kind={k.category} className="size-4" />}
          questIcon={<KindIcon kind={k.category} className="size-6" />}
          suggested={k.category === 'stretch' ? 7 : 3}
          editSpan="col-span-5"
          delay={80 + i * 50}
        />
      ))}
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
              met ? 'bg-state-good' : 'bg-lav-400'
            }`}
            style={{ width: `${Math.min(1, count / target) * 100}%` }}
          />
        </span>
      ) : null}
    </div>
  )
}
