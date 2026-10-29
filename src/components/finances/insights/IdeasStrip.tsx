import { useAction } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { BoardAnswer } from '../../../../convex/insightsBoard'
import { STRIP } from '@/lib/ideasBoard'
import type { Point } from '@/lib/insightsMarket'
import { Spark } from './IdeasLine'
import { clock } from './parts'
import { usePop } from './usePop'

/* The market strip (29 Oct): eight markets, the day's change and line.
   His word on the first build: "in hover show tooltip with better chart
   … now its more like decoration". Hovered, focused or tapped, a cell
   opens a card with a real chart — the day against yesterday's close, or
   1M · 6M · 1Y fetched on the press — with both prices, the high and low
   and the first and last day beside it. Fetched, never stored. */

type Cell = NonNullable<BoardAnswer['strip'][number]['cell']>
type Def = (typeof STRIP)[number]
const RANGES = ['1D', '1W', '1M', '6M', '1Y'] as const
type Range = (typeof RANGES)[number]
/* 1W is the month's closes from seven days back. */
const FETCH = { '1W': '1mo', '1M': '1mo', '6M': '6mo', '1Y': '1y' } as const

const KEEP_MS = 10 * 60_000
const kept = new Map<string, { at: number; points: Array<Point> }>()

export function price(d: Def, v: number) {
  return d.unit === 'yield'
    ? `${v.toFixed(2)}%`
    : `${d.unit === 'USD' ? '$' : ''}${v.toLocaleString('en-GB', { maximumFractionDigits: v >= 1000 ? 0 : 2 })}`
}
function change(d: Def, from: number, to: number) {
  const c = d.unit === 'yield' ? to - from : (to / from - 1) * 100
  const t = `${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(2)}${d.unit === 'yield' ? ' PTS' : '%'}`
  return { c, t }
}
const DAY = (t: number) =>
  new Date(t)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    .toUpperCase()

export function IdeasStrip({
  board,
  failed,
}: {
  board: BoardAnswer | null
  failed: boolean
}) {
  const pop = usePop<string>()
  return (
    <div className="idb-strip" data-testid="idb-strip" ref={pop.box}>
      {STRIP.map((s, i) => {
        const c = board?.strip.find((x) => x.id === s.id)?.cell
        if (!c)
          return (
            <div key={s.id} className="mk">
              <span className="n">{s.name}</span>
              <span className="v dim">{board || failed ? '❔' : '…'}</span>
            </div>
          )
        const d = change(s, c.base, c.price)
        return (
          <div
            key={s.id}
            className={`mkw ${pop.on === s.id ? 'on' : ''} ${i >= 4 ? 'end' : ''}`}
            onMouseEnter={() => pop.enter(s.id)}
            onMouseLeave={pop.leave}
          >
            <button
              type="button"
              data-testid="idb-mk"
              data-id={s.id}
              aria-expanded={pop.on === s.id}
              className="mk"
              onFocus={() => pop.enter(s.id)}
              onClick={() => pop.press(s.id)}
            >
              <span className="n">{s.name}</span>
              <span className="v">{price(s, c.price)}</span>
              <span className={d.c >= 0 ? 'd up' : 'd dn'}>{d.t}</span>
              <Spark points={c.points} w={100} h={14} />
            </button>
            {pop.on === s.id ? (
              <Card d={s} cell={c} pinned={pop.pinned} />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function Card({ d, cell, pinned }: { d: Def; cell: Cell; pinned: boolean }) {
  const fetchChart = useAction(api.insightsBoard.chartOf)
  const [range, setRange] = useState<Range>('1D')
  const [pts, setPts] = useState<Array<Point> | null>(cell.points)
  useEffect(() => {
    if (range === '1D') return setPts(cell.points)
    const key = `${d.symbol}|${range}`
    const hit = kept.get(key)
    if (hit && Date.now() - hit.at < KEEP_MS) return setPts(hit.points)
    let live = true
    setPts(null)
    fetchChart({ symbols: [d.symbol], range: FETCH[range] })
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
  }, [range, d.symbol, fetchChart, cell.points])
  /* The day is measured from yesterday's close; a period from its first close. */
  const base = range === '1D' ? cell.base : (pts?.[0]?.v ?? null)
  const last = pts?.at(-1)
  const vs = pts?.map((p) => p.v) ?? []
  const lo = Math.min(...vs, base ?? Infinity)
  const hi = Math.max(...vs, base ?? -Infinity)
  const W = 300
  const H = 120
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8)
  const ch = base !== null && last ? change(d, base, last.v) : null
  return (
    <div
      className={`idb-tip wide ${pinned ? 'pinned' : ''}`}
      data-testid="idb-mk-card"
    >
      <span className="t">
        <span className="sel">
          {d.name} · {d.symbol}
        </span>
        <span className="grow" />
        <span className="idb-seg">
          {RANGES.map((r) => (
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
            <b>{price(d, last.v)}</b>
            <span className={ch.c >= 0 ? 'up' : 'dn'}>{ch.t}</span>
          </span>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <line x1="0" x2={W} y1={y(base)} y2={y(base)} className="zero" />
            <polygon
              style={{
                fill: ch.c >= 0 ? 'var(--state-good)' : 'var(--state-danger)',
              }}
              points={`0,${H} ${pts.map((p, i) => `${(i / (pts.length - 1)) * W},${y(p.v)}`).join(' ')} ${W},${H}`}
            />
            <polyline
              style={{
                stroke: ch.c >= 0 ? 'var(--state-good)' : 'var(--state-danger)',
              }}
              points={pts
                .map((p, i) => `${(i / (pts.length - 1)) * W},${y(p.v)}`)
                .join(' ')}
            />
          </svg>
          <span className="rows two">
            <span>
              {range === '1D' ? 'CLOSE BEFORE' : `${DAY(pts[0].t)}`}{' '}
              <b>{price(d, base)}</b>
            </span>
            <span>
              {range === '1D' ? `NOW · ${clock(last.t)}` : `${DAY(last.t)}`}{' '}
              <b>{price(d, last.v)}</b>
            </span>
            <span>
              HIGH <b>{price(d, Math.max(...vs))}</b>
            </span>
            <span>
              LOW <b>{price(d, Math.min(...vs))}</b>
            </span>
          </span>
          <span className="ins-was">YAHOO · NOT SAVED</span>
        </>
      )}
    </div>
  )
}
