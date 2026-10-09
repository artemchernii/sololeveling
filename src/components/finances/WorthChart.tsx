import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { AreaSeries, LineStyle, createChart } from 'lightweight-charts'
import { ChartArea, ChartLine } from 'lucide-react'
import type { AutoscaleInfo, IChartApi, ISeriesApi } from 'lightweight-charts'

import { api } from '../../../convex/_generated/api'
import { AccountsChart } from '@/components/finances/AccountsChart'
import type { AccountsMode } from '@/components/finances/AccountsChart'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { useDayStarts } from '@/components/track/useDayStarts'
import { euros } from '@/lib/money'
import { useVeil } from '@/lib/veil'

/* The Overview chart, as on :3950 (Finances B, 1 Oct — "do we have divided
   cash / investments in graph like in 3950?"): TOTAL · FREE CASH ·
   INVESTED on the left, 1M–1Y on the right, opening on TOTAL · 1Y. TOTAL
   is stacked (his pick from three sketches, 1 Oct): a gold cash band under
   a lavender invested band, the top edge the total, from €0 so each band
   reads at its size; the line under it says the day's three numbers.
   aggregate.worthHistory draws it — his readings and rows for cash, his
   trades × stored closes × stored ECB rates for invested. A day before
   anything he told the app is not drawn. */

const SERIES = [
  { id: 'total', label: 'total' },
  { id: 'cash', label: 'free cash' },
  { id: 'invested', label: 'invested' },
  /* One line per account (3 Oct) — AccountsChart. */
  { id: 'accounts', label: 'accounts' },
] as const

const RANGES = [
  { id: '1M', days: 30 },
  { id: '3M', days: 91 },
  { id: '6M', days: 182 },
  { id: '1Y', days: 365 },
] as const

type SeriesId = (typeof SERIES)[number]['id']
type Summed = Exclude<SeriesId, 'accounts'>

/* A token's colour as rgb(): the chart cannot parse oklch() (1 Oct: the
   gold token, `oklch(0.83 0.1 85)`, threw and drew nothing), so the
   browser converts it by painting one pixel. */
const token = (name: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return v || fallback
}

const css = (name: string, fallback: string) => {
  const v = token(name, '')
  if (!v) return fallback
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return fallback
  ctx.fillStyle = v
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r}, ${g}, ${b})`
}

/* The mock's two inks: free cash gold, total and invested lavender. */
const tint = (s: Summed) =>
  s === 'cash'
    ? {
        line: css('--color-money-cash', '#e3c77a'),
        top: 'rgba(227,199,122,0.3)',
      }
    : { line: css('--color-lav-400', '#b5abfc'), top: 'rgba(181,171,252,0.35)' }

/* A stacked chart's bands only read true from €0. */
const fromZero = (original: () => AutoscaleInfo | null) => {
  const r = original()
  if (r?.priceRange) r.priceRange.minValue = 0
  return r
}

const iso = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The end of each of the last `days` days, today included — a fixed
    list per day, so a row added this afternoon is inside today's end. */
export function dayEndsBack(today: number, days: number): Array<number> {
  const t = new Date(today)
  const out: Array<number> = []
  for (let i = days - 1; i >= 0; i--)
    out.push(
      new Date(
        t.getFullYear(),
        t.getMonth(),
        t.getDate() - i,
        23,
        59,
        59,
        999,
      ).getTime(),
    )
  return out
}

export function WorthChart() {
  const today = useDayStarts(1).at(-1) as number
  const [which, setWhich] = useState<SeriesId>('total')
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('1Y')
  const [mode, setMode] = useState<AccountsMode>('bands')
  const days = RANGES.find((r) => r.id === range)?.days ?? 365
  /* One subscription for the year; the switches only choose what of it to
     draw, so pressing them never reloads. */
  const dayEnds = useMemo(() => dayEndsBack(today, 365), [today])
  const history = useQuery(api.aggregate.worthHistory, { dayEnds })
  const { shown } = useVeil()
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Area'> | null>(null)
  /* TOTAL only: the cash band drawn over the total's area, so what is left
     showing of the lavender is invested. */
  const band = useRef<ISeriesApi<'Area'> | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  const line = (values: ReadonlyArray<number | null>) =>
    dayEnds
      .map((t, i) => ({ t, v: values[i] }))
      .slice(-days)
      .filter((p): p is { t: number; v: number } => p.v !== null)
      .map((p) => ({ time: iso(p.t), value: p.v }))
  const summed: Summed = which === 'accounts' ? 'total' : which
  const points = useMemo(
    () => (history ? line(history[summed]) : []),
    [history, summed, dayEnds, days],
  )
  const cashBand = useMemo(
    () => (history && which === 'total' ? line(history.cash) : []),
    [history, which, dayEnds, days],
  )

  /* The day under the cursor, or the last one: its date and numbers. */
  const day = useMemo(() => {
    if (!history) return null
    let i = hover === null ? -1 : dayEnds.findIndex((t) => iso(t) === hover)
    if (i < 0)
      for (let k = history.total.length - 1; k >= 0 && i < 0; k--)
        if (history.total[k] !== null) i = k
    if (i < 0) return null
    return {
      at: dayEnds[i],
      total: history.total[i],
      cash: history.cash[i],
      invested: history.invested[i],
    }
  }, [history, hover, dayEnds])

  /* Held but not valued on the last day: said, never guessed. */
  const unpriced = history?.unpriced.at(-1) ?? 0

  useEffect(() => {
    if (!box.current) return
    const ink = css('--color-ink-500', '#6e6e84')
    const lav = css('--color-lav-400', '#b5abfc')
    const c = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: ink,
        fontFamily: token('--font-mono', 'ui-monospace, monospace'),
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: {
          color: 'rgba(181,171,252,0.5)',
          labelBackgroundColor: lav,
        },
        horzLine: {
          color: 'rgba(181,171,252,0.3)',
          labelBackgroundColor: lav,
        },
      },
      handleScroll: false,
      handleScale: false,
      localization: { priceFormatter: (p: number) => euros(Math.round(p)) },
    })
    series.current = c.addSeries(AreaSeries, {
      lineWidth: 2,
      bottomColor: 'rgba(181,171,252,0)',
      priceLineVisible: false,
      lastValueVisible: false,
    })
    band.current = c.addSeries(AreaSeries, {
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      autoscaleInfoProvider: fromZero,
    })
    c.subscribeCrosshairMove((p) =>
      setHover(typeof p.time === 'string' ? p.time : null),
    )
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
      series.current = null
      band.current = null
    }
  }, [])

  useEffect(() => {
    const s = series.current
    const b = band.current
    if (!s || !b) return
    const stacked = summed === 'total'
    const t = tint(summed)
    const gold = tint('cash')
    s.applyOptions({
      lineColor: t.line,
      topColor: stacked ? 'rgba(181,171,252,0.4)' : t.top,
      bottomColor: stacked ? 'rgba(181,171,252,0.3)' : 'rgba(181,171,252,0)',
      autoscaleInfoProvider: stacked ? fromZero : undefined,
    })
    s.setData(points)
    b.applyOptions({
      lineColor: gold.line,
      topColor: 'rgba(227,199,122,0.62)',
      bottomColor: 'rgba(227,199,122,0.5)',
    })
    b.setData(cashBand)
    for (const x of [s, b]) for (const l of x.priceLines()) x.removePriceLine(l)
    const mark = (x: ISeriesApi<'Area'>, value: number, color: string) =>
      x.createPriceLine({
        price: value,
        color,
        lineStyle: LineStyle.Dotted,
        lineWidth: 1,
        axisLabelVisible: true,
      })
    const last = points.at(-1)
    if (last) mark(s, last.value, t.line)
    const lastCash = cashBand.at(-1)
    if (lastCash) mark(b, lastCash.value, gold.line)
    chart.current?.timeScale().fitContent()
  }, [points, cashBand, summed])

  return (
    <section className="glass flex flex-col gap-3 rounded-[22px] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex gap-1.5">
          {SERIES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setWhich(s.id)}
              className={which === s.id ? PILL_LOUD : PILL_QUIET}
            >
              {s.label}
            </button>
          ))}
        </span>
        <span className="flex items-center gap-1.5">
          {which === 'accounts' ? (
            /* Bands or lines (3 Oct, his "keep what we have + A, and a
               toggle"): one switch, beside the ranges. */
            <span className="mr-1.5 flex rounded-full p-0.5 ring-1 ring-lift/14 ring-inset">
              {(
                [
                  ['bands', ChartArea, 'Stacked bands'],
                  ['lines', ChartLine, 'Lines'],
                ] as const
              ).map(([m, Icon, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-label={label}
                  aria-pressed={mode === m}
                  title={label}
                  className={`motion-press grid size-7 place-items-center rounded-full transition-colors ${mode === m ? 'bg-lav-400/18 text-foreground' : 'text-ink-400 hover:text-foreground'}`}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </span>
          ) : null}
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={range === r.id ? PILL_LOUD : PILL_QUIET}
            >
              {r.id}
            </button>
          ))}
        </span>
      </div>
      {which === 'accounts' && history ? (
        <AccountsChart
          history={history}
          dayEnds={dayEnds}
          days={days}
          rangeLabel={range}
          mode={mode}
        />
      ) : null}
      {/* Kept mounted under ACCOUNTS: the chart is made once. */}
      <div
        className={`relative h-[280px] ${which === 'accounts' ? 'hidden' : ''}`}
      >
        <div
          ref={box}
          className={`absolute inset-0 transition-[filter] ${shown ? '' : 'blur-[8px]'}`}
        />
        {/* Where the line will be (9 Oct): the shared light over a soft
            ground, not an empty panel. */}
        {history === undefined ? (
          <div
            role="status"
            aria-label="Loading"
            className="absolute inset-x-0 bottom-0 h-3/5 overflow-hidden rounded-[12px] bg-gradient-to-t from-lift/[0.06] to-transparent"
          >
            <span className="motion-loading absolute inset-0" />
          </div>
        ) : null}
        {history !== undefined && points.length < 2 ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-ink-400">
            {which === 'invested'
              ? 'The line starts with your first trade or holdings screenshot.'
              : 'The line starts with your first statement or balance. Drop an older statement to see further back.'}
          </p>
        ) : null}
      </div>
      {day && which !== 'accounts' ? (
        <span
          className={`flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-ink-300 ${shown ? '' : 'blur-[6px]'}`}
        >
          <span>
            {new Date(day.at).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
          {which === 'total' && day.total !== null ? (
            <span className="text-foreground">total {euros(day.total)}</span>
          ) : null}
          {which !== 'invested' && day.cash !== null ? (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-money-cash" />
              cash {euros(day.cash)}
            </span>
          ) : null}
          {which !== 'cash' && day.invested !== null ? (
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-lav-400" />
              invested {euros(day.invested)}
            </span>
          ) : null}
        </span>
      ) : null}
      {unpriced > 0 && which !== 'cash' && which !== 'accounts' ? (
        <span className="font-mono text-[11px] text-state-warn">
          {unpriced === 1
            ? '1 position has no closing price yet and is not in the line'
            : `${unpriced} positions have no closing price yet and are not in the line`}
        </span>
      ) : null}
    </section>
  )
}
