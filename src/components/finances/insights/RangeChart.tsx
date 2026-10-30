import { useAction } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { Point } from '@/lib/insightsMarket'
import { clock } from './parts'

/* One ticker's chart over a range the press picks (29 Oct): the strip's
   hover card and a line's NUMBERS. The day against the close before when
   the day's points are given; 1W · 1M · 6M · 1Y fetched on the press and
   kept ten minutes on the page — never stored. Both prices, the high and
   the low beside it, and a link to the ticker on Yahoo Finance. */

const ALL = ['1D', '1W', '1M', '6M', '1Y'] as const
export type Range = (typeof ALL)[number]
/* 1W is the month's closes from seven days back. */
const FETCH = { '1W': '1mo', '1M': '1mo', '6M': '6mo', '1Y': '1y' } as const

const KEEP_MS = 10 * 60_000
const kept = new Map<string, { at: number; points: Array<Point> }>()

export function changeOf(yieldPts: boolean, from: number, to: number) {
  const c = yieldPts ? to - from : (to / from - 1) * 100
  const t = `${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(2)}${yieldPts ? ' PTS' : '%'}`
  return { c, t }
}
const DAY = (t: number) =>
  new Date(t)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    .toUpperCase()

export const yahooUrl = (symbol: string) =>
  `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`

export function RangeChart({
  title,
  symbol,
  fmt,
  yieldPts = false,
  day,
  start,
}: {
  title: string
  symbol: string
  fmt: (v: number) => string
  yieldPts?: boolean
  /** The day's points and the close before; without them no 1D. */
  day?: { points: Array<Point>; base: number }
  start?: Range
}) {
  const fetchChart = useAction(api.insightsBoard.chartOf)
  const ranges = day ? ALL : ALL.filter((r) => r !== '1D')
  const [range, setRange] = useState<Range>(start ?? ranges[0])
  const [pts, setPts] = useState<Array<Point> | null>(
    range === '1D' && day ? day.points : null,
  )
  useEffect(() => {
    if (range === '1D') return setPts(day?.points ?? [])
    const key = `${symbol}|${range}`
    const hit = kept.get(key)
    if (hit && Date.now() - hit.at < KEEP_MS) return setPts(hit.points)
    let live = true
    setPts(null)
    fetchChart({ symbols: [symbol], range: FETCH[range] })
      .then((l) => {
        const all = l[0]?.points ?? []
        const from = Date.now() - 7 * 86_400_000
        const p = range === '1W' ? all.filter((x) => x.t >= from) : all
        kept.set(key, { at: Date.now(), points: p })
        if (live) setPts(p)
      })
      .catch(() => live && setPts([]))
    return () => {
      live = false
    }
  }, [range, symbol, fetchChart, day])
  const base = range === '1D' ? (day?.base ?? null) : (pts?.[0]?.v ?? null)
  const last = pts?.at(-1)
  const vs = pts?.map((p) => p.v) ?? []
  const lo = Math.min(...vs, base ?? Infinity)
  const hi = Math.max(...vs, base ?? -Infinity)
  const W = 300
  const H = 120
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8)
  const ch = base !== null && last ? changeOf(yieldPts, base, last.v) : null
  const tone = ch && ch.c >= 0 ? 'var(--state-good)' : 'var(--state-danger)'
  const xy = (pts ?? [])
    .map((p, i) => `${(i / Math.max(1, (pts?.length ?? 1) - 1)) * W},${y(p.v)}`)
    .join(' ')
  return (
    <div className="idb-chart" data-testid="idb-chart">
      <span className="t">
        <span className="sel">{title}</span>
        <span className="grow" />
        <span className="idb-seg">
          {ranges.map((r) => (
            <button
              key={r}
              type="button"
              data-testid="idb-mk-range"
              aria-pressed={r === range}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </span>
      </span>
      {pts === null ? (
        <span className="ask-shim h-[120px]" />
      ) : pts.length < 2 || !last || base === null || !ch ? (
        <span className="idb-pill ink">❔ NO DATA</span>
      ) : (
        <>
          <span className="big">
            <b>{fmt(last.v)}</b>
            <span className={ch.c >= 0 ? 'up' : 'dn'}>{ch.t}</span>
          </span>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <line x1="0" x2={W} y1={y(base)} y2={y(base)} className="zero" />
            <polygon style={{ fill: tone }} points={`0,${H} ${xy} ${W},${H}`} />
            <polyline style={{ stroke: tone }} points={xy} />
          </svg>
          <span className="rows two">
            <span>
              {range === '1D' ? 'CLOSE BEFORE' : DAY(pts[0].t)}{' '}
              <b>{fmt(base)}</b>
            </span>
            <span>
              {range === '1D' ? `NOW · ${clock(last.t)}` : DAY(last.t)}{' '}
              <b>{fmt(last.v)}</b>
            </span>
            <span>
              HIGH <b>{fmt(Math.max(...vs))}</b>
            </span>
            <span>
              LOW <b>{fmt(Math.min(...vs))}</b>
            </span>
          </span>
        </>
      )}
      <span className="foot">
        <a
          href={yahooUrl(symbol)}
          target="_blank"
          rel="noreferrer"
          data-testid="idb-yahoo"
        >
          YAHOO FINANCE ↗
        </a>
        <span className="grow" />
        <span className="ins-was">NOT SAVED</span>
      </span>
    </div>
  )
}
