import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { AreaSeries, LineStyle, createChart } from 'lightweight-charts'
import type { IChartApi, ISeriesApi } from 'lightweight-charts'

import { api } from '../../../convex/_generated/api'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { useDayStarts } from '@/components/track/useDayStarts'
import { euros } from '@/lib/money'
import { useVeil } from '@/lib/veil'

/* The Overview chart, as on :3950 (Finances B, 1 Oct — "do we have divided
   cash / investments in graph like in 3950?"): TOTAL · FREE CASH ·
   INVESTED on the left, 1M–1Y on the right, opening on TOTAL · 1Y.
   aggregate.worthHistory draws it — his readings and rows for cash, his
   trades × stored closes × stored ECB rates for invested. A day before
   anything he told the app is not drawn. */

const SERIES = [
  { id: 'total', label: 'total' },
  { id: 'cash', label: 'free cash' },
  { id: 'invested', label: 'invested' },
] as const

const RANGES = [
  { id: '1M', days: 30 },
  { id: '3M', days: 91 },
  { id: '6M', days: 182 },
  { id: '1Y', days: 365 },
] as const

type SeriesId = (typeof SERIES)[number]['id']

const css = (name: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return v || fallback
}

/* The mock's two inks: free cash gold, total and invested lavender. */
const tint = (s: SeriesId) =>
  s === 'cash'
    ? {
        line: css('--color-money-cash', '#e3c77a'),
        top: 'rgba(227,199,122,0.3)',
      }
    : { line: css('--color-lav-400', '#b5abfc'), top: 'rgba(181,171,252,0.35)' }

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
  const days = RANGES.find((r) => r.id === range)?.days ?? 365
  /* One subscription for the year; the switches only choose what of it to
     draw, so pressing them never reloads. */
  const dayEnds = useMemo(() => dayEndsBack(today, 365), [today])
  const history = useQuery(api.aggregate.worthHistory, { dayEnds })
  const { shown } = useVeil()
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Area'> | null>(null)

  const points = useMemo(() => {
    if (!history) return []
    const values = history[which]
    return dayEnds
      .map((t, i) => ({ t, v: values[i] }))
      .slice(-days)
      .filter((p): p is { t: number; v: number } => p.v !== null)
      .map((p) => ({ time: iso(p.t), value: p.v }))
  }, [history, which, dayEnds, days])

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
        fontFamily: css('--font-mono', 'ui-monospace, monospace'),
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
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
      series.current = null
    }
  }, [])

  useEffect(() => {
    const s = series.current
    if (!s) return
    const t = tint(which)
    s.applyOptions({ lineColor: t.line, topColor: t.top })
    s.setData(points)
    for (const l of s.priceLines()) s.removePriceLine(l)
    const last = points.at(-1)
    if (last)
      s.createPriceLine({
        price: last.value,
        color: t.line,
        lineStyle: LineStyle.Dotted,
        lineWidth: 1,
        axisLabelVisible: true,
      })
    chart.current?.timeScale().fitContent()
  }, [points, which])

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
        <span className="flex gap-1.5">
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
      <div className="relative h-[280px]">
        <div
          ref={box}
          className={`absolute inset-0 transition-[filter] ${shown ? '' : 'blur-[8px]'}`}
        />
        {history !== undefined && points.length < 2 ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-ink-400">
            {which === 'invested'
              ? 'The line starts with your first trade or holdings screenshot.'
              : 'The line starts with your first statement or balance. Drop an older statement to see further back.'}
          </p>
        ) : null}
      </div>
      {unpriced > 0 && which !== 'cash' ? (
        <span className="font-mono text-[11px] text-state-warn">
          {unpriced === 1
            ? '1 position has no closing price yet and is not in the line'
            : `${unpriced} positions have no closing price yet and are not in the line`}
        </span>
      ) : null}
    </section>
  )
}
