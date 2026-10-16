import { BicepsFlexed } from 'lucide-react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { kindName } from '@/components/body/kinds'
import {
  Badge,
  Caps,
  CountUp,
  Tile,
  dateLabel,
} from '@/components/review/parts'

type Body = FunctionReturnType<typeof api.aggregate.weekReview>['body']

/* Body (mockup real2.html, "workouts, activities, and shakes (protein) are
   important, weight is not that important"): workouts and shakes this week
   beside the four weeks, each kind trained in those four weeks, and the
   last weight as one small line. The page hides the tile when four weeks
   hold none of it. */
export function BodyTile({ body, span }: { body: Body; span: string }) {
  return (
    <Tile
      name="Body"
      to="/body"
      area="var(--area-body)"
      icon={<BicepsFlexed />}
      index={3}
      span={span}
      photo={{
        src: '/body/body.jpg',
        className: 'inset-y-0 w-[40%]',
        position: '50% 25%',
      }}
    >
      <div className="flex flex-wrap items-start gap-x-[26px] gap-y-3">
        <Count label="WORKOUTS" n={body.workouts} four={body.workouts4} />
        <Count label="SHAKES" n={body.shakes} four={body.shakes4} />
      </div>
      {body.kinds.length > 0 ? (
        <div className="flex flex-wrap gap-[5px] sm:max-w-[70%]">
          {body.kinds.map((k) => (
            <Badge
              key={k.category}
              className="bg-(--area-body)/10 text-(--area-body)"
            >
              {kindName(k.category)} {k.count}
            </Badge>
          ))}
        </div>
      ) : null}
      {body.weight !== null ? (
        <span
          data-testid="weight"
          className="mt-auto font-mono text-[10.5px] text-ink-500"
        >
          WEIGHT · {body.weight.value} kg · {dateLabel(body.weight.at)}
        </span>
      ) : null}
    </Tile>
  )
}

function Count({ label, n, four }: { label: string; n: number; four: number }) {
  return (
    <div className="flex flex-col gap-1">
      <Caps>{label}</Caps>
      <span className="text-[30px] leading-none font-light tracking-tight tabular-nums">
        <CountUp to={n} testId={label.toLowerCase()} />
      </span>
      <span className="font-mono text-[10.5px] text-ink-500">
        {four} in 4 weeks
      </span>
    </div>
  )
}
