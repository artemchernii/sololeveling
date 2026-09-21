import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { areaVars } from '@/lib/areas'
import { dayStartsBack, STRIP_WEEKS } from '@/lib/day-strip'
import { drift, geometry } from '@/lib/weight-line'

const WIDTH = 520
const HEIGHT = 96

/* The weigh-ins, and the target if a goal gives one (R6b).

   A line and not a bar, which was the argument this section exists to settle:
   a bar needs a starting weight, and a start nobody recorded is the number §1
   forbids inventing. What is drawn is the stored rows — a dot where he
   weighed himself, a straight segment between consecutive dots, and the
   target as a flat rule. Nothing is smoothed and nothing is projected.

   `3.4 to go` is the target less the latest reading: a subtraction of two
   sanctioned values, the same composition §1 allows for holding x price. */
export function WeightLine() {
  const dayStarts = dayStartsBack(STRIP_WEEKS)
  const start = dayStarts[0]
  const end = dayStarts[dayStarts.length - 1] + 86_400_000

  const history = useQuery(api.aggregate.stateHistory, {
    key: 'weight',
    start,
    end,
  })
  const goals = useQuery(api.goals.listActive, {})

  if (history === undefined || goals === undefined) return null

  const readings = history.rows
    .filter((row) => row.value !== undefined)
    .map((row) => ({ value: row.value as number, recordedAt: row.recordedAt }))

  /* The first active body goal carrying a real number in kilograms.
     `targetLabel` alone is words — it cannot put a line on an axis — and
     `area === 'body'` alone is not enough either: "Workouts each month" is a
     body goal too, with a `targetValue` of 12 and a `unit` of "workouts". A
     weigh-in is always kg (the number above is shown with that suffix), so
     only a goal recorded in the same unit can be the weight's target. */
  const goal = goals.find(
    (g) => g.area === 'body' && g.unit === 'kg' && g.targetValue !== undefined,
  )
  const target = goal?.targetValue

  const latest =
    readings.length > 0 ? readings[readings.length - 1] : undefined
  const state = drift(readings, target)
  const g = geometry(readings, { width: WIDTH, height: HEIGHT, target })

  return (
    <section style={areaVars('body')} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="label-caps">weight</h2>
        {!history.complete ? (
          /* Said out loud rather than drawn as a line that simply stops: a
             read that hit its row bound is missing its NEWEST readings, not
             its oldest — the same failure CommitHeatmap and Consistency guard
             against, said the same way. */
          <span className="font-mono text-[11px] text-ink-500">
            older weigh-ins not all stored
          </span>
        ) : null}
      </div>

      {latest === undefined ? (
        <p className="text-[13px] text-ink-500">
          No weight recorded in the last {STRIP_WEEKS} weeks. Press{' '}
          <span className="font-mono text-ink-300">⌘K</span> and type{' '}
          <span className="font-mono text-ink-300">weight 75.4</span>.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span
              className={`text-[34px] leading-none font-light ${
                state === 'good'
                  ? 'text-state-good'
                  : state === 'warn'
                    ? 'text-state-warn'
                    : 'text-ink-100'
              }`}
            >
              {latest.value}
              <span className="ml-1 text-[15px] text-ink-500">kg</span>
            </span>
            {target !== undefined ? (
              <span className="font-mono text-[12px] text-ink-500">
                {Math.round(Math.abs(latest.value - target) * 10) / 10} to go
              </span>
            ) : null}
            <span className="font-mono text-[11px] text-ink-600">
              {new Date(latest.recordedAt).toDateString()}
            </span>
          </div>

          {g === null || g.points.length < 2 ? (
            /* One dot is not a line, and a graphic whose only content is a
               single point reads as a broken element (the lesson CommitStrip
               records). The number above already says it. */
            null
          ) : (
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="motion-arrive h-24 w-full"
              preserveAspectRatio="none"
              aria-hidden
            >
              {g.targetY !== null ? (
                <line
                  x1={0}
                  y1={g.targetY}
                  x2={WIDTH}
                  y2={g.targetY}
                  stroke="var(--area)"
                  strokeOpacity={0.35}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              <polyline
                points={g.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="var(--area)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              {g.points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={2.5}
                  fill="var(--area)"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          )}

          {target === undefined ? (
            <p className="text-[11px] text-ink-700">
              A body goal with a number puts a target line on this chart.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
