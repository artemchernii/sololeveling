import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../../convex/_generated/api'
import { SkeletonRows } from '@/components/Skeleton'
import { Veiled } from '@/components/finances/Veil'
import { eur, monthName } from './time'

type Months = FunctionReturnType<typeof api.aggregate.flowMonths>

/* The month in one line (journey step 1): in, out and what is left of
   this month, moves between his accounts never in it, and six months of
   in and out beside it. LEFT is in − out of one month — his yes, 3 Oct
   (PLAN.md §1). Tapping OUT opens every row: MOVEMENTS. */
export function MonthLine({
  months,
  today,
  onRows,
}: {
  months: Months | undefined
  today: number
  onRows: () => void
}) {
  const d = new Date(today)
  const day = d.getDate()
  const len = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  if (months === undefined) {
    return (
      <section className="glass rounded-[22px] p-4 sm:p-5">
        <SkeletonRows rows={2} />
      </section>
    )
  }
  const now = months.at(-1)
  const prev = months.at(-2)
  const six = months.slice(-6)
  const nothing = months.every((m) => m.rows === 0)
  const left = (now?.in ?? 0) - (now?.out ?? 0)
  const prevLeft = (prev?.in ?? 0) - (prev?.out ?? 0)
  const max = Math.max(1, ...six.flatMap((m) => [m.in, m.out]))

  return (
    <section className="glass motion-arrive flex flex-col gap-3 rounded-[22px] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="system-title">
          [ {monthName(today)} · day {day} of {len} ]
        </span>
        <span className="label-caps">
          moves between your accounts not counted
        </span>
      </div>
      {nothing ? (
        <p className="py-6 text-center text-[13.5px] leading-relaxed text-ink-400">
          <span className="block text-[16px] text-foreground">
            Nothing read yet
          </span>
          In, out and what is left appear with the first statement. Drop one
          with + above.
        </p>
      ) : (
        <div className="grid items-end gap-5 md:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-7">
              <Num label="IN" tone="good" value={`+${eur(now?.in ?? 0)}`} />
              <button type="button" onClick={onRows} className="text-left">
                <Num
                  label="OUT"
                  tone="danger"
                  value={`−${eur(now?.out ?? 0)}`}
                  hint="tap: every row"
                />
              </button>
              <Num
                label="LEFT"
                tone={
                  (now?.in ?? 0) === 0 ? 'flat' : left >= 0 ? 'good' : 'danger'
                }
                value={`${left >= 0 ? '+' : '−'}${eur(left)}`}
                hint={(now?.in ?? 0) === 0 ? 'nothing in yet' : 'in − out'}
              />
            </div>
            {prev && prev.rows > 0 ? (
              <p className="text-[13.5px] leading-relaxed text-ink-300">
                {monthName(prev.start)} closed at{' '}
                <Veiled className="text-foreground">
                  +{eur(prev.in)} in, −{eur(prev.out)} out:{' '}
                  {prevLeft >= 0 ? '+' : '−'}
                  {eur(prevLeft)} left.
                </Veiled>
              </p>
            ) : null}
          </div>
          <div>
            <div className="label-caps mb-1.5">in · out · six months</div>
            <svg
              viewBox="0 0 380 120"
              className="h-auto w-full overflow-visible"
              aria-label="Money in and out, six months"
            >
              {six.map((m, i) => {
                const cx = 16 + (i * 348) / 5
                const hi = (m.in / max) * 86
                const ho = (m.out / max) * 86
                const part = i === six.length - 1
                return (
                  <g key={m.start} opacity={part ? 0.5 : 0.85}>
                    <rect
                      x={cx - 19}
                      y={96 - hi}
                      width={18}
                      height={hi}
                      rx={3}
                      className="motion-pop fill-state-good"
                    />
                    <rect
                      x={cx + 1}
                      y={96 - ho}
                      width={18}
                      height={ho}
                      rx={3}
                      className="motion-pop fill-state-danger"
                    />
                    <text
                      x={cx}
                      y={114}
                      textAnchor="middle"
                      className={`font-mono text-[10px] ${part ? 'fill-lav-300' : 'fill-ink-500'}`}
                    >
                      {monthName(m.start)}
                      {part ? ' so far' : ''}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      )}
    </section>
  )
}

function Num({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone: 'good' | 'danger' | 'flat'
  hint?: string
}) {
  const color =
    tone === 'good'
      ? 'text-state-good'
      : tone === 'danger'
        ? 'text-state-danger'
        : 'text-ink-500'
  return (
    <span className="flex flex-col gap-1">
      <span className="font-mono text-[11px] text-ink-500">{label}</span>
      <span
        className={`text-[34px] leading-none font-light tabular-nums ${color}`}
      >
        <Veiled>{value}</Veiled>
      </span>
      {hint ? (
        <span className="font-mono text-[11px] text-ink-500">{hint}</span>
      ) : null}
    </span>
  )
}
