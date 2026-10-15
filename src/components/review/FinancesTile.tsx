import { DollarSign } from 'lucide-react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { Caps, CountUp, Stat, Tile } from '@/components/review/parts'
import { categoryLabel, euros } from '@/lib/money'

type Sums = FunctionReturnType<typeof api.aggregate.moneySums>
type Worth = FunctionReturnType<typeof api.aggregate.worthHistory>

const day = (t: number) =>
  new Date(t)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
    .toUpperCase()
    .replace(',', '')

/* The biggest tile ("finances is most important"): out and in this week,
   each with last week's, worth on the last day read with the week before's
   close, out by category, and worth day by day. Sums of logged rows and the
   stored worth series — the tile divides nothing but bar widths. */
export function FinancesTile({
  money,
  lastMoney,
  worth,
  dayEnds,
}: {
  money: Sums
  lastMoney: Sums
  worth: Worth
  dayEnds: ReadonlyArray<number>
}) {
  const cats = money.buckets
    .filter((b) => b.kind === 'expense')
    .sort((a, b) => b.sum - a.sum)
    .slice(0, 5)
  const widest = cats[0]?.sum ?? 1
  const points = worth.total
    .map((v, i) => ({ v, t: dayEnds[i] }))
    .filter((p): p is { v: number; t: number } => p.v !== null)
  const now = points.at(-1)
  const was = points.length > 1 ? points[0] : undefined

  return (
    <Tile
      name="Finances"
      to="/finances"
      area="var(--area-money)"
      icon={<DollarSign />}
      index={1}
      span="col-span-2 lg:col-span-3 lg:row-span-2"
      photo={{ src: '/finances/dollar.jpg', className: 'inset-y-0 w-[38%]' }}
    >
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <Stat label="OUT" was={euros(lastMoney.out.sum)}>
          <span className="text-state-danger">
            <CountUp to={money.out.sum} format={(n) => euros(Math.round(n))} />
          </span>
        </Stat>
        <Stat label="IN" was={euros(lastMoney.in.sum)}>
          <span className="text-state-good">
            <CountUp to={money.in.sum} format={(n) => euros(Math.round(n))} />
          </span>
        </Stat>
        {now ? (
          <Stat
            label={`WORTH · ${day(now.t)}`}
            was={
              was ? `${euros(Math.round(was.v))} · ${day(was.t)}` : undefined
            }
          >
            <CountUp to={now.v} format={(n) => euros(Math.round(n))} />
          </Stat>
        ) : null}
      </div>
      <div className="mt-auto grid gap-4 sm:grid-cols-2 sm:items-end">
        <div className="flex flex-col gap-[7px]">
          <Caps>OUT · BY CATEGORY</Caps>
          {cats.length === 0 ? (
            <Caps className="py-2 text-ink-500">0 OUT</Caps>
          ) : (
            cats.map((c, i) => (
              <div
                key={c.category ?? 'none'}
                className="grid grid-cols-[92px_1fr_56px] items-center gap-2"
              >
                <Caps className="truncate text-[8.5px] text-ink-300">
                  {categoryLabel('expense', c.category)}
                </Caps>
                <div className="h-[5px] overflow-hidden rounded-full bg-lift/[0.07]">
                  <b
                    style={{
                      width: `${(c.sum / widest) * 100}%`,
                      animationDelay: `${400 + i * 80}ms`,
                    }}
                    className="bento-fill block h-full rounded-full bg-state-danger"
                  />
                </div>
                <span className="text-right font-mono text-[11px]">
                  {euros(Math.round(c.sum))}
                </span>
              </div>
            ))
          )}
        </div>
        {points.length > 1 ? <WorthLine points={points} /> : null}
      </div>
    </Tile>
  )
}

function WorthLine({
  points,
}: {
  points: ReadonlyArray<{ v: number; t: number }>
}) {
  const w = 300
  const h = 70
  const values = points.map((p) => p.v)
  const pad = (Math.max(...values) - Math.min(...values)) * 0.25 || 1
  const min = Math.min(...values) - pad
  const max = Math.max(...values) + pad
  const xy = points.map(
    (p, i) =>
      [
        (i * w) / (points.length - 1),
        h - ((p.v - min) / (max - min)) * h,
      ] as const,
  )
  const d = xy
    .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ')
  const [ex, ey] = xy[xy.length - 1]
  return (
    <div className="flex flex-col gap-1">
      <Caps>WORTH · {points.length} DAYS</Caps>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block h-[70px] w-full overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id="review-worth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--area-money)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--area-money)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${d} L ${w} ${h} L 0 ${h} Z`}
          fill="url(#review-worth)"
          className="motion-fade"
        />
        <path
          d={d}
          fill="none"
          stroke="var(--area-money)"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          className="bento-line"
        />
        <circle
          cx={ex}
          cy={ey}
          r="3.5"
          fill="var(--area-money)"
          className="system-pulse"
        />
      </svg>
      <div className="flex justify-between">
        <Caps className="text-[8.5px]">{day(points[0].t)}</Caps>
        <Caps className="text-[8.5px]">{day(points[points.length - 1].t)}</Caps>
      </div>
    </div>
  )
}
