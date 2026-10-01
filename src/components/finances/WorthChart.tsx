import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  AreaSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts'
import type {
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  Time,
} from 'lightweight-charts'

import { api } from '../../../convex/_generated/api'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { useDayStarts } from '@/components/track/useDayStarts'
import { rangeChange } from '@/lib/cashHistory'
import { euros } from '@/lib/money'
import { useVeil } from '@/lib/veil'

/* The Overview chart (27 Sep, as mocked on :3950 and asked for): his free
   cash, day by day — aggregate.cashHistory, from his readings and rows
   only, in euros at today's rates. A day before anything he told the app is
   not drawn. Investments join the line once a close is stored each night;
   until then this is cash, and it says so. */

const RANGES = [
  { id: '1M', days: 30 },
  { id: '3M', days: 91 },
  { id: '6M', days: 182 },
  { id: '1Y', days: 365 },
] as const

const css = (name: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  return v || fallback
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
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('3M')
  const days = RANGES.find((r) => r.id === range)?.days ?? 91
  /* One subscription for the year; the range only chooses how much of it
     to draw, so switching never reloads. */
  const dayEnds = useMemo(() => dayEndsBack(today, 365), [today])
  const history = useQuery(api.aggregate.cashHistory, { dayEnds })
  const accounts = useQuery(api.accounts.list, {})
  const { shown } = useVeil()
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Area'> | null>(null)
  const markers = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  const points = useMemo(() => {
    if (!history) return []
    const all = dayEnds.map((t, i) => ({ t, v: history.total[i] }))
    return all
      .slice(-days)
      .filter((p): p is { t: number; v: number } => p.v !== null)
      .map((p) => ({ time: iso(p.t), value: p.v }))
  }, [history, dayEnds, days])

  /* An account joining is marked on its day and kept out of the change. */
  const { change, joins } = useMemo(
    () =>
      history
        ? rangeChange(history.total, history.accounts, dayEnds.length - days)
        : { change: null, joins: [] },
    [history, dayEnds, days],
  )

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
          color: 'rgba(181,171,252,0.35)',
          labelBackgroundColor: lav,
        },
        horzLine: {
          color: 'rgba(181,171,252,0.35)',
          labelBackgroundColor: lav,
        },
      },
      handleScroll: false,
      handleScale: false,
      localization: { priceFormatter: (p: number) => euros(Math.round(p)) },
    })
    series.current = c.addSeries(AreaSeries, {
      lineColor: lav,
      lineWidth: 2,
      topColor: 'rgba(181,171,252,0.28)',
      bottomColor: 'rgba(181,171,252,0.02)',
      priceLineVisible: false,
      lastValueVisible: false,
    })
    markers.current = createSeriesMarkers(series.current, [])
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
      series.current = null
      markers.current = null
    }
  }, [])

  useEffect(() => {
    const s = series.current
    if (!s) return
    s.setData(points)
    for (const l of s.priceLines()) s.removePriceLine(l)
    const last = points.at(-1)
    if (last)
      s.createPriceLine({
        price: last.value,
        color: css('--color-lav-400', '#b5abfc'),
        lineStyle: LineStyle.Dotted,
        lineWidth: 1,
        axisLabelVisible: true,
      })
    chart.current?.timeScale().fitContent()
  }, [points])

  /* A dot on the line where an account joined; its name goes under the
     chart, where a label cannot collide with the next or run off the edge. */
  useEffect(() => {
    markers.current?.setMarkers(
      joins.map((j) => ({
        time: iso(dayEnds[j.index]),
        position: 'aboveBar' as const,
        shape: 'circle' as const,
        color: css('--color-ink-400', '#9a9ab0'),
        size: 0.6,
      })),
    )
  }, [joins, dayEnds, points])

  const joined = joins.map((j) => {
    const name = accounts?.find((a) => a._id === j.accountId)?.name
    const d = new Date(dayEnds[j.index])
    return `${name ?? 'an account'} ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  })

  return (
    <section className="glass flex flex-col gap-3 rounded-[22px] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps">free cash, day by day</span>
        {change !== null && points.length > 1 ? (
          <span
            className={`font-mono text-[12px] ${change > 0 ? 'text-state-good' : change < 0 ? 'text-state-danger' : 'text-ink-400'} ${shown ? '' : 'blur-[6px]'}`}
          >
            {change > 0 ? '+' : change < 0 ? '−' : ''}
            {euros(Math.abs(Math.round(change)))} in {range}
          </span>
        ) : null}
        <span className="ml-auto flex gap-1.5">
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
      <div className="relative h-[240px]">
        <div
          ref={box}
          className={`absolute inset-0 transition-[filter] ${shown ? '' : 'blur-[8px]'}`}
        />
        {history !== undefined && points.length < 2 ? (
          <p className="absolute inset-0 grid place-items-center px-6 text-center text-[13px] text-ink-400">
            The line starts with your first statement or balance. Drop an older
            statement to see further back.
          </p>
        ) : null}
      </div>
      {joined.length > 0 ? (
        <span className="flex items-baseline gap-1.5 font-mono text-[11px] text-ink-400">
          <span className="size-1.5 shrink-0 -translate-y-px rounded-full bg-ink-400" />
          joined: {joined.join(' · ')} — their balance that day is not counted
          as a change
        </span>
      ) : null}
      <span className="font-mono text-[10.5px] text-ink-500">
        from your balances and rows · in euros at today’s rates · investments
        join the line once their closes are stored each night
      </span>
    </section>
  )
}
