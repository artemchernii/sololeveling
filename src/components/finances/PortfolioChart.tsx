import { useMemo, useState } from 'react'

import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { Veiled } from '@/components/finances/Veil'
import { dayEndsBack } from '@/components/finances/WorthChart'
import { useDayStarts } from '@/components/track/useDayStarts'
import { euros } from '@/lib/money'
import { dayReturn, highLow, rangeReturn } from '@/lib/portfolioReturn'
import type { RangeReturn } from '@/lib/portfolioReturn'
import { useWorthHistory } from '@/lib/useWorthHistory'
import { useVeil } from '@/lib/veil'

/* PORTFOLIO's chart (23 Nov, "go" on the mockup
   design/treasury-mockup/portfolio-chart.html; his "we dont have chart of
   total portfolio … day week month year", then "use financial terms").
   The INVESTED line of aggregate.worthHistory — the Overview chart's own
   numbers — and over a range its RETURN, net deposits taken out
   (src/lib/portfolioReturn.ts), both ends always beside it. 1D is two
   numbers: the app stores one close a day, so there is no line in it. */

export const RANGES = [
  { id: '1D', days: 1 },
  { id: '1W', days: 7 },
  { id: '1M', days: 30 },
  { id: '3M', days: 91 },
  { id: '1Y', days: 364 },
] as const
export type RangeId = (typeof RANGES)[number]['id']

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const day = (t: number) => DAY.format(new Date(t)).toUpperCase()

/** 1D 1W 1M 3M 1Y, top right of the panel. A range is pressable while
    the one before it is shorter than the days drawn. */
export function RangePicker({
  range,
  onRange,
  drawn,
}: {
  range: RangeId
  onRange: (r: RangeId) => void
  drawn: number | null
}) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {RANGES.map((r, k) => {
        const off = drawn !== null && k > 1 && RANGES[k - 1].days >= drawn - 1
        return (
          <button
            key={r.id}
            type="button"
            disabled={off}
            aria-pressed={range === r.id}
            onClick={() => onRange(r.id)}
            className={`${range === r.id ? PILL_LOUD : PILL_QUIET} disabled:pointer-events-none disabled:opacity-35`}
          >
            {r.id}
          </button>
        )
      })}
    </span>
  )
}

/** The year of day ends the Overview chart asks for — one subscription. */
export function usePortfolioHistory() {
  const today = useDayStarts(1).at(-1) as number
  const dayEnds = useMemo(() => dayEndsBack(today, 365), [today])
  const history = useWorthHistory(dayEnds)
  const drawn = history
    ? history.invested.filter((v) => v !== null).length
    : null
  return { dayEnds, history, drawn }
}

function Pill({ r }: { r: RangeReturn }) {
  const up = r.change >= 0
  return (
    <span
      className={`motion-arrive inline-flex items-center gap-2 rounded-[8px] px-2.5 py-1 font-mono text-[13px] ${up ? 'bg-state-good/12 text-state-good' : 'bg-state-danger/10 text-state-danger'}`}
    >
      <Veiled>{`${up ? '▲ +' : '▼ −'}${euros(Math.abs(r.change))}`}</Veiled>
      <span>{`${up ? '+' : '−'}${Math.abs(r.pct).toFixed(1)}%`}</span>
    </span>
  )
}

export function PortfolioChart({
  range,
  dayEnds,
  history,
}: {
  range: RangeId
} & ReturnType<typeof usePortfolioHistory>) {
  const days = RANGES.find((r) => r.id === range)?.days ?? 30
  const r = useMemo(
    () =>
      history
        ? days === 1
          ? dayReturn(dayEnds, history.invested, history.deposits)
          : rangeReturn(dayEnds, history.invested, history.deposits, days)
        : null,
    [history, dayEnds, days],
  )
  const [hover, setHover] = useState<number | null>(null)
  /* Hidden amounts blur the line too, as on Overview. */
  const { shown } = useVeil()

  if (history === undefined)
    return (
      <div
        role="status"
        aria-label="Loading"
        className="motion-loading-ground relative h-[220px] overflow-hidden rounded-[12px] bg-gradient-to-t from-lift/[0.06] to-transparent [mask-image:linear-gradient(to_top,black,transparent)]"
      >
        <span className="motion-loading absolute inset-0" />
      </div>
    )
  if (r === null) return null

  const caps = 'font-mono text-[12px] text-ink-400'
  const num = 'font-mono text-[12.5px] text-foreground'
  const head = (
    <div className="flex min-h-[30px] flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className={caps}>{days === 1 ? "DAY'S CHANGE" : 'RETURN'}</span>
      <Pill r={r} key={range} />
      {days === 1 ? null : (
        <>
          <span className={caps}>{day(r.startAt)}</span>
          <span className={num}>
            <Veiled>{euros(r.start)}</Veiled>
          </span>
          <span className="text-ink-500">→</span>
          <span className={caps}>{day(r.endAt)}</span>
          <span className={num}>
            <Veiled>{euros(r.end)}</Veiled>
          </span>
          {r.deposits !== 0 ? (
            <>
              <span className={caps}>· NET DEPOSITS</span>
              <span className={num}>
                <Veiled>{`${r.deposits < 0 ? '−' : ''}${euros(Math.abs(r.deposits))}`}</Veiled>
              </span>
            </>
          ) : null}
        </>
      )}
    </div>
  )

  if (days === 1)
    return (
      <div className="flex flex-col gap-3">
        {head}
        <div className="grid h-[220px] grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <DayBox label={`PREV. CLOSE · ${day(r.startAt)}`} value={r.start} />
          <span className="text-center font-mono text-[18px] text-ink-500">
            →
          </span>
          <DayBox label={`LAST · ${day(r.endAt)}`} value={r.end} />
        </div>
      </div>
    )

  const pts = r.points
  const lo = Math.min(...pts.map((p) => p.value)) * 0.985
  const hi = Math.max(...pts.map((p) => p.value)) * 1.01
  const xp = (i: number) => (i / (pts.length - 1)) * 100
  const yp = (v: number) => 92 - ((v - lo) / (hi - lo || 1)) * 84
  const line = pts
    .map(
      (p, i) => `${i ? 'L' : 'M'}${xp(i).toFixed(2)},${yp(p.value).toFixed(2)}`,
    )
    .join('')
  const area = `${line}L100,100L0,100Z`
  const at = hover === null ? null : pts[hover]
  const ticks = [0, Math.floor((pts.length - 1) / 2), pts.length - 1]
  const anyDeposit = pts.some((p, i) => i > 0 && p.deposit !== 0)
  const hl = highLow(pts)
  const highI = hl ? pts.findIndex((p) => p.at === hl.high.at) : -1
  const lowI = hl ? pts.findIndex((p) => p.at === hl.low.at) : -1

  return (
    <div className="flex flex-col gap-3">
      {head}
      {hl ? (
        <div className="-mt-2 flex min-h-[30px] flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={caps}>HIGH {day(hl.high.at)}</span>
          <span className={num}>
            <Veiled>{euros(hl.high.value)}</Veiled>
          </span>
          <span className={caps}>· LOW {day(hl.low.at)}</span>
          <span className={num}>
            <Veiled>{euros(hl.low.value)}</Veiled>
          </span>
          <span className={caps}>· VS HIGH</span>
          <span
            key={range}
            className={`motion-arrive inline-flex items-center gap-2 rounded-[8px] px-2.5 py-1 font-mono text-[13px] ${hl.vsHigh < 0 ? 'bg-state-danger/10 text-state-danger' : 'bg-state-good/12 text-state-good'}`}
          >
            <Veiled>
              {hl.vsHigh < 0 ? `▼ −${euros(-hl.vsHigh)}` : euros(0)}
            </Veiled>
            <span>{`${hl.pct < 0 ? '−' : ''}${Math.abs(hl.pct).toFixed(1)}%`}</span>
          </span>
        </div>
      ) : null}
      <div
        className={`relative h-[220px] transition-[filter] select-none ${shown ? '' : 'blur-[8px]'}`}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          const f = (e.clientX - box.left) / box.width
          setHover(
            Math.max(
              0,
              Math.min(pts.length - 1, Math.round(f * (pts.length - 1))),
            ),
          )
        }}
        onMouseLeave={() => setHover(null)}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-x-0 top-0 h-[200px] w-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="pf-area" x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0"
                stopColor="var(--color-lav-400)"
                stopOpacity="0.32"
              />
              <stop
                offset="1"
                stopColor="var(--color-lav-400)"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#pf-area)" />
          {/* Arrives on each range. Not a dash draw: with a stretched
              viewBox and a non-scaling stroke the dash broke the line
              into pieces (23 Nov, his "line is a bit weird"). */}
          <g key={range} className="motion-fade">
            <path
              d={line}
              fill="none"
              stroke="var(--color-lav-400)"
              strokeWidth="2.2"
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
            />
          </g>
          {hover !== null ? (
            <line
              x1={xp(hover)}
              x2={xp(hover)}
              y1="4"
              y2="100"
              stroke="var(--color-ink-400)"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {pts.map((p, i) =>
          i > 0 && p.deposit !== 0 ? (
            <span
              key={p.at}
              className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background ring-[2.5px] ring-money-cash"
              style={{ left: `${xp(i)}%`, top: `${yp(p.value) * 2}px` }}
            />
          ) : null,
        )}
        {hl ? (
          <>
            {[
              {
                i: highI,
                v: hl.high.value,
                label: 'HIGH',
                tone: 'text-ink-300',
                up: true,
              },
              {
                i: lowI,
                v: hl.low.value,
                label: 'LOW',
                tone: 'text-ink-300',
                up: false,
              },
            ].map((m) => (
              <span key={m.label}>
                <span
                  className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
                  style={{ left: `${xp(m.i)}%`, top: `${yp(m.v) * 2}px` }}
                />
                <span
                  className={`pointer-events-none absolute -translate-x-1/2 rounded-[5px] bg-background px-1.5 py-px font-mono text-[9.5px] tracking-[0.12em] shadow-[0_2px_8px_-4px_rgba(0,0,0,0.3)] ${m.tone} ${m.up ? '-translate-y-[170%]' : 'translate-y-[70%]'}`}
                  style={{
                    left: `${Math.min(96, Math.max(4, xp(m.i)))}%`,
                    top: `${yp(m.v) * 2}px`,
                  }}
                >
                  {m.label}
                </span>
              </span>
            ))}
          </>
        ) : null}
        {at !== null && hover !== null ? (
          <span
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 rounded-[8px] bg-background px-2 py-1 font-mono text-[11px] whitespace-nowrap shadow-[0_4px_14px_-6px_rgba(0,0,0,0.3)]"
            style={{ left: `${xp(hover)}%` }}
          >
            <span className="text-ink-400">{day(at.at)}</span>{' '}
            <Veiled>{euros(at.value)}</Veiled>
            {hover > 0 && at.deposit !== 0 ? (
              <span className="text-ink-400">
                {` · ${at.deposit > 0 ? 'DEPOSIT' : 'WITHDRAWAL'} `}
                <Veiled>{euros(Math.abs(at.deposit))}</Veiled>
              </span>
            ) : null}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex justify-between font-mono text-[11px] text-ink-500">
          {ticks.map((i) => (
            <span key={i}>{DAY.format(new Date(pts[i].at))}</span>
          ))}
        </div>
      </div>
      {anyDeposit ? (
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.1em] text-ink-400 uppercase">
          <span className="size-2 rounded-full bg-background ring-2 ring-money-cash" />
          deposit
        </span>
      ) : null}
    </div>
  )
}

function DayBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="motion-arrive flex flex-col gap-1.5 rounded-[16px] bg-lift/[0.04] p-4 ring-1 ring-lift/10 ring-inset">
      <span className="label-caps">{label}</span>
      <span className="text-[28px] leading-none font-light text-foreground">
        <Veiled>{euros(value)}</Veiled>
      </span>
    </div>
  )
}
