import { useMemo, useState } from 'react'

import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { Veiled } from '@/components/finances/Veil'
import { dayEndsBack } from '@/components/finances/WorthChart'
import { useDayStarts } from '@/components/track/useDayStarts'
import { euros } from '@/lib/money'
import {
  dayReturn,
  pl,
  plHighLow,
  valuePeak,
  plPct,
  rangeReturn,
} from '@/lib/portfolioReturn'
import type { PlPoint } from '@/lib/portfolioReturn'
import { useWorthHistory } from '@/lib/useWorthHistory'
import { useVeil } from '@/lib/veil'

/* PORTFOLIO's chart (23 Nov, "go" on the mockup
   design/treasury-mockup/portfolio-chart.html; his "we dont have chart of
   total portfolio … day week month year", then "use financial terms").
   The INVESTED line of aggregate.worthHistory — the Overview chart's own
   numbers — over its COST BASIS (24 Nov, his "vs … total money we dumped
   in the market"), the gap between them the P/L, green or red. RETURN is
   how the P/L moved; MAX PROFIT, MAX LOSS and NOW are the most and least
   the shares were up on cost in the range, and today, the two marked on
   the line (src/lib/portfolioReturn.ts). 1D is two numbers:
   the app stores one close a day, so there is no line in it. */

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

const sign = (n: number) => `${n < 0 ? '−' : '+'}${euros(Math.abs(n))}`
const pctText = (n: number) => `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(1)}%`
const tone = (n: number) => (n < 0 ? 'text-state-danger' : 'text-state-good')

/** ▲/▼ € and %, green or red: RETURN, DAY'S CHANGE, NOW. */
function Pill({ amount, pct, k }: { amount: number; pct: number; k: string }) {
  const up = amount >= 0
  return (
    <span
      key={k}
      className={`motion-arrive inline-flex items-center gap-2 rounded-[8px] px-2.5 py-1 font-mono text-[13px] ${up ? 'bg-state-good/12 text-state-good' : 'bg-state-danger/10 text-state-danger'}`}
    >
      <Veiled>{`${up ? '▲' : '▼'} ${sign(amount)}`}</Veiled>
      <span>{pctText(pct)}</span>
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
          ? dayReturn(dayEnds, history.invested, history.cost, history.deposits)
          : rangeReturn(
              dayEnds,
              history.invested,
              history.cost,
              history.deposits,
              days,
            )
        : null,
    [history, dayEnds, days],
  )
  const [hover, setHover] = useState<number | null>(null)
  /* Hidden amounts blur the lines too, as on Overview. */
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
  const num = 'font-mono text-[12.5px]'

  if (days === 1)
    return (
      <div className="flex flex-col gap-3">
        <div className="flex min-h-[30px] flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={caps}>DAY&apos;S CHANGE</span>
          <Pill amount={r.change} pct={r.pct} k={range} />
        </div>
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
  const hl = plHighLow(pts)
  const top = valuePeak(pts)
  const all = pts.flatMap((p) => [p.value, p.cost])
  const lo = Math.min(...all) * 0.985
  const hi = Math.max(...all) * 1.01
  const xp = (i: number) => (i / (pts.length - 1)) * 100
  const yp = (v: number) => 92 - ((v - lo) / (hi - lo || 1)) * 84
  const valueLine = pts
    .map(
      (p, i) => `${i ? 'L' : 'M'}${xp(i).toFixed(2)},${yp(p.value).toFixed(2)}`,
    )
    .join('')
  /* Cost steps: flat until a trade, then straight up or down. */
  const costLine = pts
    .map((p, i) =>
      i === 0
        ? `M0,${yp(p.cost).toFixed(2)}`
        : `L${xp(i).toFixed(2)},${yp(pts[i - 1].cost).toFixed(2)}L${xp(i).toFixed(2)},${yp(p.cost).toFixed(2)}`,
    )
    .join('')
  const at = hover === null ? null : pts[hover]
  const ticks = [0, Math.floor((pts.length - 1) / 2), pts.length - 1]
  const mark = (p: PlPoint, label: string, up: boolean) => {
    const i = pts.indexOf(p)
    return (
      <span key={label}>
        <span
          className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: `${xp(i)}%`, top: `${yp(p.value) * 2}px` }}
        />
        <span
          className={`pointer-events-none absolute -translate-x-1/2 rounded-[5px] bg-background px-1.5 py-px font-mono text-[9.5px] tracking-[0.12em] whitespace-nowrap text-ink-300 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.3)] ${up ? '-translate-y-[170%]' : 'translate-y-[70%]'}`}
          style={{
            left: `${Math.min(95, Math.max(5, xp(i)))}%`,
            top: `${yp(p.value) * 2}px`,
          }}
        >
          {label}
        </span>
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-[30px] flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className={caps}>RETURN</span>
        <Pill amount={r.change} pct={r.pct} k={range} />
        <span className={caps}>
          {day(r.startAt)} → {day(r.endAt)}
        </span>
      </div>
      {hl ? (
        <div className="-mt-2 flex min-h-[30px] flex-wrap items-center gap-x-2.5 gap-y-1">
          {pl(hl.high) > 0 ? (
            <>
              <span className={caps}>MAX PROFIT</span>
              <span className={`${num} ${tone(pl(hl.high))}`}>
                <Veiled>{sign(pl(hl.high))}</Veiled> {pctText(plPct(hl.high))}
              </span>
            </>
          ) : null}
          {pl(hl.low) < 0 ? (
            <>
              <span className={caps}>· MAX LOSS</span>
              <span className={`${num} ${tone(pl(hl.low))}`}>
                <Veiled>{sign(pl(hl.low))}</Veiled> {pctText(plPct(hl.low))}
              </span>
            </>
          ) : null}
          <span className={caps}>· NOW</span>
          <Pill amount={pl(hl.now)} pct={plPct(hl.now)} k={`now${range}`} />
        </div>
      ) : null}
      {top ? (
        <div className="-mt-2 flex min-h-[30px] flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={caps}>PEAK</span>
          <span className={num}>
            <Veiled>{euros(top.peak.value)}</Veiled>
          </span>
          <span className={caps}>· FROM PEAK</span>
          {top.change === 0 ? (
            <span className="motion-arrive inline-flex items-center rounded-[8px] bg-state-good/12 px-2.5 py-1 font-mono text-[13px] text-state-good">
              AT PEAK
            </span>
          ) : (
            <Pill amount={top.change} pct={top.pct} k={`peak${range}`} />
          )}
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
          {/* The gap, day by day: green where value is over cost, red
              under — a state, never a grade. */}
          {pts.slice(1).map((p, k) => {
            const a = pts[k]
            const i = k + 1
            const up = pl(a) + pl(p) >= 0
            return (
              <path
                key={p.at}
                d={`M${xp(i - 1)},${yp(a.value)}L${xp(i)},${yp(p.value)}L${xp(i)},${yp(p.cost)}L${xp(i - 1)},${yp(a.cost)}Z`}
                fill={
                  up ? 'var(--color-state-good)' : 'var(--color-state-danger)'
                }
                fillOpacity="0.16"
              />
            )
          })}
          <path
            d={costLine}
            fill="none"
            stroke="var(--color-ink-300)"
            strokeWidth="1.6"
            strokeDasharray="5 4"
            vectorEffect="non-scaling-stroke"
          />
          {/* Arrives on each range. Not a dash draw: with a stretched
              viewBox and a non-scaling stroke the dash broke the line
              into pieces (23 Nov, his "line is a bit weird"). */}
          <g key={range} className="motion-fade">
            <path
              d={valueLine}
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
        {hl ? (
          <>
            {pl(hl.high) > 0 ? mark(hl.high, 'MAX PROFIT', true) : null}
            {pl(hl.low) < 0 ? mark(hl.low, 'MAX LOSS', false) : null}
            {top && top.peak !== hl.high ? mark(top.peak, 'PEAK', true) : null}
          </>
        ) : null}
        {at !== null && hover !== null ? (
          <span
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 rounded-[8px] bg-background px-2 py-1 font-mono text-[11px] whitespace-nowrap shadow-[0_4px_14px_-6px_rgba(0,0,0,0.3)]"
            style={{ left: `${Math.min(80, Math.max(20, xp(hover)))}%` }}
          >
            <span className="text-ink-400">{day(at.at)}</span>{' '}
            <Veiled>{euros(at.value)}</Veiled>
            <span className="text-ink-400"> · COST </span>
            <Veiled>{euros(at.cost)}</Veiled>
            <span className="text-ink-400"> · P/L </span>
            <span className={tone(pl(at))}>
              <Veiled>{sign(pl(at))}</Veiled>
            </span>
            {hover > 0 && at.deposit !== 0 ? (
              <span className="text-ink-400">
                {` · ${at.deposit > 0 ? 'BUY' : 'SELL'} `}
                <Veiled>{euros(Math.abs(at.deposit))}</Veiled>
              </span>
            ) : null}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 flex justify-between font-mono text-[11px] whitespace-nowrap text-ink-500">
          {ticks.map((i) => (
            <span key={i}>{DAY.format(new Date(pts[i].at))}</span>
          ))}
        </div>
      </div>
      <span className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10.5px] tracking-[0.1em] text-ink-400 uppercase">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded-full bg-lav-400" />
          market value
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t-2 border-dashed border-ink-300" />
          cost basis
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-[2px] bg-state-good/25" />
          profit
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-3.5 rounded-[2px] bg-state-danger/25" />
          loss
        </span>
      </span>
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
