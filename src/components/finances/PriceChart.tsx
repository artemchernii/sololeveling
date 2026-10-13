import { useRef, useState } from 'react'

import { Veiled } from '@/components/finances/Veil'
import { money } from '@/lib/currency'
import { euros } from '@/lib/money'
import { BOX, between, nearest, priceChart } from '@/lib/priceChart'
import type { Mark } from '@/lib/priceChart'

const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const TONE = {
  up: 'var(--state-good)',
  down: 'var(--state-danger)',
  plain: 'var(--color-lav-400)',
}

/* One position's stored closes as a line, its buys and sells on it
   (13 Oct, mockup portfolio.html). Green or red by whether the position
   is up or down since bought; lavender when that is not known.

   It reads under the pointer (13 Oct: "not like you can hover dots or
   drag and see differences"): a day's stored close on the line, a buy or
   a sell on its dot, and — dragged — two days with both prices and the
   difference between them. The line of words above keeps its height. */
export function PriceChart({
  points,
  marks,
  currency,
  tone,
}: {
  points: ReadonlyArray<{ asOf: number; price: number }> | undefined
  marks: ReadonlyArray<Mark>
  currency: string
  tone: keyof typeof TONE
}) {
  const chart = priceChart(
    (points ?? []).map((p) => ({ t: p.asOf, v: p.price })),
    marks,
  )
  const { w, h } = BOX
  if (chart === null) {
    return (
      <div
        style={{ aspectRatio: `${w} / ${h}` }}
        className="grid place-items-center rounded-[14px] bg-lift/[0.025] font-mono text-[11px] text-ink-500"
      >
        {points === undefined ? 'reading…' : 'no prices stored for this period'}
      </div>
    )
  }
  return (
    <Plot
      key={`${chart.from}-${chart.to}-${chart.pts.length}`}
      chart={chart}
      currency={currency}
      colour={TONE[tone]}
    />
  )
}

const price = (v: number, currency: string) =>
  money(Math.round(v * 100) / 100, currency)

function Plot({
  chart,
  currency,
  colour,
}: {
  chart: NonNullable<ReturnType<typeof priceChart>>
  currency: string
  colour: string
}) {
  const { w, h, left, right, top, bottom } = BOX
  const { pts, dots } = chart
  /* The close under the pointer, the dot under it, and a dragged pair —
     which stays after the pointer lets go, until the next press. */
  const [at, setAt] = useState<number | null>(null)
  const [dot, setDot] = useState<number | null>(null)
  const [pair, setPair] = useState<[number, number] | null>(null)
  const from = useRef<number | null>(null)

  const place = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * w,
      y: ((e.clientY - r.top) / r.height) * h,
    }
  }
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    const i = nearest(pts, place(e).x)
    from.current = i
    e.currentTarget.setPointerCapture(e.pointerId)
    setPair(null)
    setDot(null)
    setAt(i)
  }
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = place(e)
    const i = nearest(pts, p.x)
    if (from.current !== null) {
      setPair(i === from.current ? null : [from.current, i])
      setAt(i)
    } else if (pair === null) {
      const d = dots.findIndex((m) => Math.hypot(m.x - p.x, m.y - p.y) < 10)
      setDot(d < 0 ? null : d)
      setAt(i)
    }
  }
  const leave = () => {
    if (from.current !== null || pair !== null) return
    setAt(null)
    setDot(null)
  }

  const span = pair ? between(pts[pair[0]], pts[pair[1]]) : null
  const spanUp = (span?.diff ?? 0) >= 0
  const spanTone = spanUp ? 'var(--state-good)' : 'var(--state-danger)'
  const held = dot === null ? null : dots[dot]
  const seen = pts[at ?? pts.length - 1]
  const guide = (p: { x: number; y: number }, stroke: string) => (
    <g key={p.x}>
      <line
        x1={p.x}
        x2={p.x}
        y1={top}
        y2={h - bottom}
        stroke={stroke}
        strokeDasharray="2 3"
      />
      <circle
        cx={p.x}
        cy={p.y}
        r={4.5}
        strokeWidth={2}
        stroke={stroke}
        className="fill-ground"
      />
    </g>
  )

  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid="price-read"
        className="flex min-h-[42px] flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[13px] text-foreground tabular-nums sm:min-h-[22px]"
      >
        {span ? (
          <>
            <span className="text-[10.5px] text-ink-500">
              {DAY.format(new Date(span.from.t))}
            </span>
            <span>{price(span.from.v, currency)}</span>
            <span className="text-[10.5px] text-ink-500">
              → {DAY.format(new Date(span.to.t))}
            </span>
            <span>{price(span.to.v, currency)}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11.5px] ${spanUp ? 'bg-state-good/14 text-state-good' : 'bg-state-danger/14 text-state-danger'}`}
            >
              {spanUp ? '+' : '−'}
              {price(Math.abs(span.diff), currency)} · {spanUp ? '▲' : '▼'}{' '}
              {Math.abs(span.pct).toFixed(1)}%
            </span>
          </>
        ) : held ? (
          <>
            <span
              className={`rounded-full px-2 py-0.5 text-[11.5px] ${held.side === 'buy' ? 'bg-state-good/14 text-state-good' : 'bg-state-danger/14 text-state-danger'}`}
            >
              {held.side === 'buy' ? 'bought' : 'sold'}
            </span>
            {held.eur === undefined ? null : (
              <span>
                <Veiled>{euros(held.eur)}</Veiled>
              </span>
            )}
            <span className="text-[10.5px] text-ink-500">
              {DAY.format(new Date(held.t))} · at {price(held.v, currency)}
            </span>
          </>
        ) : (
          <>
            <span>{price(seen.v, currency)}</span>
            <span className="text-[10.5px] text-ink-500">
              {DAY.format(new Date(seen.t))}
              {at === null ? ' · latest price' : ''}
            </span>
          </>
        )}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Price over the period, with buys and sells"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={() => (from.current = null)}
        onPointerCancel={() => (from.current = null)}
        onPointerLeave={leave}
        className="block h-auto w-full cursor-crosshair touch-pan-y overflow-visible select-none"
      >
        <defs>
          <linearGradient id="price-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={colour} stopOpacity=".22" />
            <stop offset="1" stopColor={colour} stopOpacity="0" />
          </linearGradient>
        </defs>
        {chart.ticks.map((t) => (
          <g key={t.y}>
            <line
              x1={left}
              x2={w - right}
              y1={t.y}
              y2={t.y}
              className="stroke-lift/6"
            />
            <text
              x={w - right + 8}
              y={t.y + 4}
              className="fill-ink-500 font-mono text-[8.5px]"
            >
              {money(Math.round(t.v * 100) / 100, currency)}
            </text>
          </g>
        ))}
        <text
          x={left}
          y={h - 3}
          className="fill-ink-500 font-mono text-[8.5px]"
        >
          {DAY.format(new Date(chart.from))}
        </text>
        <text
          x={w - right}
          y={h - 3}
          textAnchor="end"
          className="fill-ink-500 font-mono text-[8.5px]"
        >
          {DAY.format(new Date(chart.to))}
        </text>
        <path d={chart.area} fill="url(#price-fill)" />
        <path
          key={chart.line}
          d={chart.line}
          pathLength={24}
          fill="none"
          stroke={colour}
          strokeWidth={2}
          strokeLinejoin="round"
          className="motion-draw"
        />
        {chart.dots.map((d) => (
          <circle
            key={`${d.t}-${d.side}-${d.eur ?? ''}`}
            cx={d.x}
            cy={d.y}
            r={5}
            strokeWidth={2}
            className={`fill-ground ${d.side === 'buy' ? 'stroke-state-good' : 'stroke-state-danger'}`}
          />
        ))}
        <circle cx={chart.last.x} cy={chart.last.y} r={4} fill={colour} />
        <g className="pointer-events-none">
          {span && pair ? (
            <>
              <rect
                x={Math.min(pts[pair[0]].x, pts[pair[1]].x)}
                y={top}
                width={Math.abs(pts[pair[1]].x - pts[pair[0]].x)}
                height={h - top - bottom}
                fill={spanTone}
                opacity={0.1}
              />
              {guide(pts[pair[0]], spanTone)}
              {guide(pts[pair[1]], spanTone)}
            </>
          ) : held ? (
            <circle
              cx={held.x}
              cy={held.y}
              r={9}
              opacity={0.25}
              fill={
                held.side === 'buy'
                  ? 'var(--state-good)'
                  : 'var(--state-danger)'
              }
            />
          ) : at !== null ? (
            guide(pts[at], 'var(--color-ink-300)')
          ) : null}
        </g>
      </svg>
      {chart.dots.length > 0 ? (
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 font-mono text-[10.5px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <i className="size-[9px] rounded-full border-2 border-state-good" />
            bought
          </span>
          <span className="flex items-center gap-1.5">
            <i className="size-[9px] rounded-full border-2 border-state-danger" />
            sold
          </span>
        </div>
      ) : null}
    </div>
  )
}
