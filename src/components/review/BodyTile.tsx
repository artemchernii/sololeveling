import { BicepsFlexed, Check } from 'lucide-react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { kindName } from '@/components/body/kinds'
import {
  Caps,
  CountUp,
  DAY_LETTERS,
  DayCells,
  Stat,
  Tile,
} from '@/components/review/parts'
import { BODY_ORDER } from '@/lib/body/log-groups'

type Week = FunctionReturnType<typeof api.aggregate.weekReview>['week']
type Reading = FunctionReturnType<
  typeof api.aggregate.stateHistory
>['rows'][number]
type Target = FunctionReturnType<typeof api.goals.weeklyTargets>[number]

const day = (t: number) =>
  new Date(t)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
    .toUpperCase()
    .replace(',', '')

/* Body: workouts against last week, the latest weight against the one
   before the week, and a row per kind — its days lit, `2 of 3` against the
   weekly target it has (Body's own Week chips), ticked when met. */
export function BodyTile({
  week,
  lastWorkouts,
  weight,
  weekStart,
  targets,
}: {
  week: Week
  lastWorkouts: number
  weight: ReadonlyArray<Reading>
  weekStart: number
  targets: ReadonlyArray<Target>
}) {
  const target = (category: string) =>
    targets.find((t) => t.area === 'body' && t.category === category)
      ?.targetValue
  const kinds = BODY_ORDER.map((category) => ({
    category,
    days: week.body.find((b) => b.category === category)?.days ?? [],
    target: target(category),
  })).filter((k) => k.days.length > 0 || k.target !== undefined)

  const readings = weight
    .filter((r) => r.value !== undefined)
    .sort((a, b) => a.recordedAt - b.recordedAt)
  const inWeek = readings.filter((r) => r.recordedAt >= weekStart).at(-1)
  const before = readings.filter((r) => r.recordedAt < weekStart).at(-1)
  const cols = 'grid grid-cols-[48px_repeat(7,1fr)_78px] items-center gap-1'

  return (
    <Tile
      name="Body"
      to="/body"
      area="var(--area-body)"
      icon={<BicepsFlexed />}
      index={2}
      span="col-span-2 lg:col-span-3 lg:row-span-2"
      photo={{
        src: '/body/body.jpg',
        className: 'inset-y-0 w-[40%]',
        position: '50% 25%',
      }}
    >
      <div className="flex flex-wrap items-start gap-x-7 gap-y-3">
        <Stat label="WORKOUTS" was={lastWorkouts}>
          <CountUp to={week.workouts} testId="workouts" />
        </Stat>
        {inWeek?.value !== undefined ? (
          <Stat
            label={`WEIGHT · ${day(inWeek.recordedAt)}`}
            was={
              before?.value !== undefined
                ? `${before.value} · ${day(before.recordedAt)}`
                : undefined
            }
          >
            <CountUp to={inWeek.value} format={(n) => n.toFixed(1)} />
            <span className="text-[15px] text-ink-500"> kg</span>
          </Stat>
        ) : (
          <div className="flex flex-col gap-1">
            <Caps>WEIGHT</Caps>
            <span className="self-start rounded-full border border-current bg-state-warn/10 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-state-warn uppercase">
              MISSING
            </span>
          </div>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-1.5 sm:w-[66%]">
        <div className={cols}>
          <span />
          {DAY_LETTERS.map((d, i) => (
            <Caps key={i} className="text-center text-[8px]">
              {d}
            </Caps>
          ))}
          <span />
        </div>
        {kinds.length === 0 ? (
          <Caps className="py-2 text-ink-500">0 WORKOUTS</Caps>
        ) : (
          kinds.map((k, r) => {
            const n = k.days.reduce((a, b) => a + b, 0)
            const met = k.target !== undefined && n >= k.target
            return (
              <div key={k.category} className={cols}>
                <Caps className="truncate text-[8.5px] text-ink-300">
                  {kindName(k.category)}
                </Caps>
                <DayCells
                  days={k.days.length ? k.days : [0, 0, 0, 0, 0, 0, 0]}
                  height="h-5"
                  delay={500 + r * 40}
                />
                <span
                  className="justify-self-end"
                  data-testid={`kind-${k.category}`}
                >
                  {k.target === undefined ? (
                    <span className="font-mono text-[12px]">{n}</span>
                  ) : (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border border-current px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] uppercase ${met ? 'bento-lit bg-state-good/10 text-state-good [--area:var(--state-good)]' : 'bg-state-warn/10 text-state-warn'}`}
                    >
                      {met ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : null}
                      {n} of {k.target}
                    </span>
                  )}
                </span>
              </div>
            )
          })
        )}
      </div>
    </Tile>
  )
}
