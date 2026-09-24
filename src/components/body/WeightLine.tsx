import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { CornerDownLeft, Target, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { SaveGlyph, useSave } from '@/components/Saving'
import { TrackPanel } from '@/components/track/TrackPanel'
import { dayStartsBack, STRIP_WEEKS } from '@/lib/day-strip'
import { whenLabel } from '@/lib/format'
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
export function WeightLine({ delay = 0 }: { delay?: number }) {
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

  const latest = readings.length > 0 ? readings[readings.length - 1] : undefined
  const state = drift(readings, target)
  const g = geometry(readings, { width: WIDTH, height: HEIGHT, target })

  return (
    <TrackPanel
      area="body"
      title="weight"
      delay={delay}
      aside={
        !history.complete ? (
          /* Said out loud rather than drawn as a line that simply stops: a
             read that hit its row bound is missing its NEWEST readings. */
          <span className="font-mono text-[11px] text-ink-500">
            older weigh-ins not all stored
          </span>
        ) : (
          <TargetPill target={target} />
        )
      }
    >
      {latest === undefined ? (
        <p className="text-[13px] text-ink-500">
          No weight recorded in the last {STRIP_WEEKS} weeks. Press{' '}
          <span className="font-mono text-ink-300">⌘L</span> and type{' '}
          <span className="font-mono text-ink-300">weight 75.4</span>.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span
              key={latest.recordedAt}
              className={`motion-pop text-[44px] leading-none font-light ${
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
              <span className="rounded-full bg-(--area)/12 px-2 py-0.5 font-mono text-[11px] text-(--area)">
                {Math.round(Math.abs(latest.value - target) * 10) / 10} to go
              </span>
            ) : null}
            <span className="font-mono text-[11px] text-ink-600">
              {whenLabel(latest.recordedAt)}
            </span>
          </div>

          {g === null ||
          g.points.length <
            2 /* One dot is not a line, and a graphic whose only content is a
               single point reads as a broken element (the lesson CommitStrip
               records). The number above already says it. */ ? null : (
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

          {g === null || g.points.length < 2 ? (
            <p className="text-[12px] text-ink-600">
              One weigh-in so far — the line starts with the next.{' '}
              <span className="font-mono text-ink-400">⌘L weight 75.4</span>
            </p>
          ) : null}
        </>
      )}
    </TrackPanel>
  )
}

/* The target, set where it is drawn (25 Sep). A body goal in kg is what the
   dashed line reads; goals.setWeightTarget makes or moves it. */
function TargetPill({ target }: { target: number | undefined }) {
  const set = useMutation(api.goals.setWeightTarget)
  const clear = useMutation(api.goals.clearWeightTarget)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const saving = useSave()

  function save() {
    const n = Number(text.replace(',', '.'))
    if (!Number.isFinite(n) || n < 20 || n > 400) {
      setEditing(false)
      return
    }
    void saving.run(() => set({ targetValue: n })).then(() => setEditing(false))
  }

  if (editing) {
    return (
      <span className="motion-arrive flex items-center gap-1.5">
        <input
          autoFocus
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') setEditing(false)
          }}
          placeholder="72"
          aria-label="Target weight in kg"
          className="w-16 rounded-[8px] border border-(--area)/50 bg-sink/20 px-2 py-0.5 font-mono text-[13px] text-foreground outline-none"
        />
        <span className="font-mono text-[11px] text-ink-500">kg</span>
        <button
          type="button"
          onClick={save}
          aria-label="Save target"
          className="motion-press grid size-6 place-items-center rounded-[6px] bg-(--area)/15 text-(--area) ring-1 ring-(--area)/50 ring-inset"
        >
          <SaveGlyph
            status={saving.status}
            onSettled={saving.settle}
            idle={<CornerDownLeft className="size-3" />}
          />
        </button>
      </span>
    )
  }

  if (target === undefined) {
    return (
      <button
        type="button"
        onClick={() => {
          setText('')
          setEditing(true)
        }}
        className="motion-press inline-flex items-center gap-1.5 rounded-full bg-(--area)/12 px-3 py-1 font-mono text-[10.5px] tracking-[0.12em] text-(--area) uppercase ring-1 ring-(--area)/35 transition-colors ring-inset hover:bg-(--area)/20"
      >
        <Target className="size-3" />
        set a target
      </button>
    )
  }

  return (
    <span className="group flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          setText(String(target))
          setEditing(true)
        }}
        className="motion-press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] text-ink-300 ring-1 ring-lift/15 transition-colors hover:text-(--area) hover:ring-(--area)/40"
      >
        <Target className="size-3 text-(--area)" />
        target {target} kg
      </button>
      <button
        type="button"
        aria-label="Clear the weight target"
        onClick={() => void clear({})}
        className="motion-press grid size-6 place-items-center rounded-[6px] text-ink-700 opacity-0 transition-colors group-hover:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-state-danger/15 hover:text-state-danger focus-visible:opacity-100"
      >
        <X className="size-3" />
      </button>
    </span>
  )
}
