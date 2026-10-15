import { BicepsFlexed } from 'lucide-react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { Caps, CountUp, Tile, dateLabel } from '@/components/review/parts'

type Body = FunctionReturnType<typeof api.aggregate.weekReview>['body']

/* Body (mockup real.html): workouts this week beside the four weeks, and
   the last weight with its day — a quiet week still says something true.
   The page hides this tile when four weeks have no workout and no weight. */
export function BodyTile({ body }: { body: Body }) {
  return (
    <Tile
      name="Body"
      to="/body"
      area="var(--area-body)"
      icon={<BicepsFlexed />}
      index={3}
      span="col-span-2 lg:col-span-2"
      photo={{
        src: '/body/body.jpg',
        className: 'inset-y-0 w-[45%]',
        position: '50% 25%',
      }}
    >
      <div className="flex flex-wrap items-start gap-x-[22px] gap-y-3">
        <div className="flex flex-col gap-1">
          <Caps>WORKOUTS</Caps>
          <span className="text-[30px] leading-none font-light tracking-tight tabular-nums">
            <CountUp to={body.workouts} testId="workouts" />
          </span>
          <span className="font-mono text-[10.5px] text-ink-500">
            {body.workouts4} in 4 weeks
          </span>
        </div>
        {body.weight !== null ? (
          <div className="flex flex-col gap-1">
            <Caps>WEIGHT · LAST</Caps>
            <span
              data-testid="weight"
              className="text-[22px] leading-none font-light tracking-tight tabular-nums"
            >
              {body.weight.value}{' '}
              <span className="text-[15px] text-ink-500">kg</span>
            </span>
            <span className="font-mono text-[10.5px] text-ink-500">
              {dateLabel(body.weight.at)}
            </span>
          </div>
        ) : null}
      </div>
    </Tile>
  )
}
