import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../../convex/_generated/api'
import { useVeil } from '@/lib/veil'
import { eur, monthName } from './time'

type Ahead = FunctionReturnType<typeof api.aggregate.ahead>

/* Free cash ahead (3 Oct, his call): by default everything is in — bills
   and salary on their days, the rest of his spending as a band from the
   cheapest to the dearest of the last three months. "Only bills and
   salary" draws the step line alone. Every point comes from
   aggregate.ahead; this only draws. */
export function AheadChart({ a, only }: { a: Ahead; only: boolean }) {
  /* Free cash is money he holds: its euros hide with the hero's SHOW. */
  const { shown } = useVeil()
  const money = (v: number) => (shown ? eur(v) : '€ ···')
  const W = 760
  const H = 190
  const L = 4
  const R = 64
  const T = 12
  const B = 22
  const pts = a.series
  if (pts.length < 2) return null
  const band = !only && a.range !== null
  const up = (p: (typeof pts)[number]) => (band ? p.upper : p.bills)
  const lo0 = Math.min(...pts.map((p) => (band ? p.lower : p.bills)))
  const hi0 = Math.max(...pts.map(up))
  const pad = Math.max(1, hi0 - lo0)
  const lo = lo0 - pad * 0.08
  const hi = hi0 + pad * 0.06
  const x = (i: number) => L + (i / (pts.length - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const line = (f: (p: (typeof pts)[number]) => number) =>
    pts.map((p, i) => `${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`)
  const steps = pts
    .map((p, i) =>
      i === 0
        ? `M${x(0)},${y(p.bills)}`
        : `H${x(i).toFixed(1)}V${y(p.bills).toFixed(1)}`,
    )
    .join('')
  const index = new Map(pts.map((p, i) => [p.t, i]))
  const firsts = pts
    .map((p, i) => ({ i, d: new Date(p.t) }))
    .filter(({ i, d }) => i > 0 && d.getDate() === 1)
  const marks = a.events.filter((e) => e.amount >= 100 || e.short)
  const end = pts.at(-1)!
  let lastLabel = -1e9

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full overflow-visible"
      role="img"
      aria-label="Free cash ahead"
    >
      <defs>
        <linearGradient id="ahead-fill" x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0"
            stopColor="var(--color-lav-400)"
            stopOpacity="0.22"
          />
          <stop offset="1" stopColor="var(--color-lav-400)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((k) => {
        const v = lo + ((hi - lo) * k) / 3
        return (
          <g key={k}>
            <line
              x1={L}
              x2={W - R}
              y1={y(v)}
              y2={y(v)}
              className="stroke-lift/5"
            />
            <text
              x={W - R + 8}
              y={y(v) + 4}
              className="fill-ink-500 font-mono text-[10px]"
            >
              {money(Math.round(v / 100) * 100)}
            </text>
          </g>
        )
      })}
      {lo < 0 && hi > 0 ? (
        <g>
          <line
            x1={L}
            x2={W - R}
            y1={y(0)}
            y2={y(0)}
            strokeDasharray="4 4"
            className="stroke-state-danger/60"
          />
          <text
            x={W - R + 8}
            y={y(0) + 4}
            className="fill-state-danger font-mono text-[10px]"
          >
            €0
          </text>
        </g>
      ) : null}
      {firsts.map(({ i, d }) => (
        <g key={i}>
          <line
            x1={x(i)}
            x2={x(i)}
            y1={T}
            y2={H - B}
            strokeDasharray="2 4"
            className="stroke-lift/10"
          />
          <text
            x={x(i) + 4}
            y={H - 6}
            className="fill-ink-500 font-mono text-[10px]"
          >
            {monthName(d.getTime())}
          </text>
        </g>
      ))}
      <text x={L} y={H - 6} className="fill-lav-300 font-mono text-[10px]">
        today
      </text>

      {band ? (
        <g className="motion-fade">
          <polygon
            points={`${line(up).join(' ')} ${line((p) => p.lower)
              .reverse()
              .join(' ')}`}
            className="fill-lav-400/20"
          />
          <polyline
            points={line(up).join(' ')}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            className="stroke-lav-400 drop-shadow-[0_0_6px_var(--system-shine)]"
          />
          <polyline
            points={line((p) => p.lower).join(' ')}
            fill="none"
            strokeWidth={1.4}
            strokeLinejoin="round"
            className="stroke-lav-400/70"
          />
        </g>
      ) : (
        <g className="motion-fade">
          <path
            d={`${steps} V${H - B} H${x(0)} Z`}
            fill="url(#ahead-fill)"
            opacity={0.5}
          />
          <path
            d={steps}
            fill="none"
            strokeWidth={2}
            strokeLinejoin="round"
            className="stroke-lav-400 drop-shadow-[0_0_6px_var(--system-shine)]"
          />
        </g>
      )}

      {marks.map((e) => {
        const i = index.get(e.t)
        if (i === undefined) return null
        const cy = y(up(pts[i]))
        const tone = e.short
          ? 'stroke-state-warn'
          : e.kind === 'income'
            ? 'stroke-state-good'
            : 'stroke-ink-300'
        const fill = e.short
          ? 'fill-state-warn'
          : e.kind === 'income'
            ? 'fill-state-good'
            : 'fill-ink-300'
        let label = null
        if (e.amount >= 300 && x(i) - lastLabel > 70) {
          lastLabel = x(i)
          const near = x(i) > W - R - 90
          label = (
            <text
              x={x(i) + (near ? -6 : 5)}
              y={cy + (e.kind === 'income' ? -7 : 13)}
              textAnchor={near ? 'end' : 'start'}
              className={`font-mono text-[9.5px] ${fill}`}
            >
              {e.name.toLowerCase()} {e.kind === 'income' ? '+' : '−'}
              {eur(e.amount)}
            </text>
          )
        }
        return (
          <g key={`${e.billId}-${e.t}`}>
            <circle
              cx={x(i)}
              cy={cy}
              r={3.2}
              strokeWidth={1.6}
              className={`fill-background ${tone}`}
            >
              <title>
                {new Date(e.t).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                })}{' '}
                · {e.name} {e.kind === 'income' ? '+' : '−'}
                {eur(e.amount, true)}
              </title>
            </circle>
            {label}
          </g>
        )
      })}
      {band ? (
        <text
          x={x(pts.length - 1) - 6}
          y={Math.min(y(end.lower) + 14, H - B - 4)}
          textAnchor="end"
          className="fill-lav-300 font-mono text-[9.5px]"
        >
          {shown ? `${eur(end.lower)}–${eur(end.upper)}` : '€ ···'}
        </text>
      ) : (
        <circle
          cx={x(pts.length - 1)}
          cy={y(end.bills)}
          r={4}
          className="fill-lav-400"
        />
      )}
    </svg>
  )
}
