import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AreaSeries,
  CrosshairMode,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts'
import type {
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  Logical,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'

import {
  ToolLayer,
  change,
  daysBetween,
} from '@/components/finances/ChartTools'
import type { Measured, Tool } from '@/components/finances/ChartTools'
import { Veiled } from '@/components/finances/Veil'
import { money } from '@/lib/currency'
import { euros } from '@/lib/money'
import { firstSince, nearMark, priceSeries, seconds } from '@/lib/priceChart'
import type { Mark } from '@/lib/priceChart'
import { css, token } from '@/lib/tokenColour'

const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/* The line's colour, and what the library draws if the token is gone. */
const TONE = {
  up: ['--state-good', '#4fd08a'],
  down: ['--state-danger', '#ef6a5a'],
  plain: ['--color-lav-400', '#b5abfc'],
} as const

/* How far across, in pixels, a dot is read from. */
const DOT_REACH = 9
const PLOT = 'h-[300px] rounded-[14px] sm:h-[380px]'

const price = (v: number, currency: string) =>
  money(Math.round(v * 100) / 100, currency)

type Series = NonNullable<ReturnType<typeof priceSeries>>

/* One position's stored closes as a line, its buys and sells on it,
   drawn by TradingView's chart library (13 Oct: "library for sure",
   mockup chart.html). Green or red by whether the position is up or down
   since bought; lavender when that is not known.

   The wheel or two fingers zoom, a drag moves it; a range pill sets what
   is in view, of the year that is loaded. The line of words above reads
   under the pointer — a day's stored close, a buy or a sell on its day,
   or what a lit tool has measured — and keeps its height. */
export function PriceChart({
  points,
  marks,
  currency,
  tone,
  since,
  tool = null,
}: {
  points: ReadonlyArray<{ asOf: number; price: number }> | undefined
  marks: ReadonlyArray<Mark>
  currency: string
  tone: keyof typeof TONE
  /** The first moment of the range in view. */
  since: number
  /** Compare or the ruler, while its button is lit. */
  tool?: Tool | null
}) {
  /* By what they hold, not by the arrays: the page hands new ones on
     every render, and a redraw would undo a zoom. */
  const held = JSON.stringify([points ?? [], marks])
  const series = useMemo(() => {
    const [closes, trades] = JSON.parse(held) as [
      Array<{ asOf: number; price: number }>,
      Array<Mark>,
    ]
    return priceSeries(
      closes.map((p) => ({ t: p.asOf, v: p.price })),
      trades,
    )
  }, [held])
  if (series === null) {
    return (
      <div
        className={`${PLOT} grid place-items-center bg-lift/[0.025] font-mono text-[11px] text-ink-500`}
      >
        {points === undefined ? 'reading…' : 'no prices stored for this period'}
      </div>
    )
  }
  return (
    <Plot
      series={series}
      currency={currency}
      tone={tone}
      since={since}
      tool={tool}
    />
  )
}

function Plot({
  series,
  currency,
  tone,
  since,
  tool,
}: {
  series: Series
  currency: string
  tone: keyof typeof TONE
  since: number
  tool: Tool | null
}) {
  const { pts, on } = series
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const line = useRef<ISeriesApi<'Area'> | null>(null)
  const dots = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  /* The stored close under the pointer; none at rest. */
  const [at, setAt] = useState<number | null>(null)
  const index = useRef(new Map<number, number>())
  /* The stored closes a buy or a sell sits on. */
  const marked = useRef<Array<number>>([])
  /* What a tool measured; kept until the next press or Esc. */
  const [measured, setMeasured] = useState<Measured | null>(null)

  useEffect(() => {
    if (!box.current) return
    const edge = css('--color-lav-400', '#b5abfc', 0.5)
    const label = '#3a3566'
    const c = createChart(box.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: css('--color-ink-500', '#6e6e84'),
        fontFamily: token('--font-mono', 'ui-monospace, monospace'),
        fontSize: 10,
        /* The licence asks for TradingView's link on the page. */
        attributionLogo: true,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      rightPriceScale: { borderVisible: false },
      /* A narrower window keeps the same days in view. */
      timeScale: { borderVisible: false, lockVisibleTimeRangeOnResize: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: edge, labelBackgroundColor: label },
        horzLine: { color: edge, labelBackgroundColor: label },
      },
      /* A finger moving up or down scrolls the page, not the chart. */
      handleScroll: { vertTouchDrag: false },
      localization: {
        timeFormatter: (t: Time) =>
          typeof t === 'number' ? DAY.format(new Date(t * 1000)) : String(t),
      },
    })
    line.current = c.addSeries(AreaSeries, {
      lineWidth: 2,
      priceLineVisible: false,
    })
    dots.current = createSeriesMarkers(line.current, [])
    c.subscribeCrosshairMove((p) => {
      const day =
        typeof p.time === 'number' ? (index.current.get(p.time) ?? null) : null
      /* A dot near the pointer is read before the day beside it. */
      const dot =
        day === null || p.point === undefined
          ? null
          : nearMark(
              marked.current.flatMap((i) => {
                const x = c.timeScale().logicalToCoordinate(i as Logical)
                return x === null ? [] : [{ i, x }]
              }),
              p.point.x,
              DOT_REACH,
            )
      setAt(dot ?? day)
    })
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
      line.current = null
      dots.current = null
    }
  }, [])

  useEffect(() => {
    const [name, fallback] = TONE[tone]
    line.current?.applyOptions({
      lineColor: css(name, fallback),
      topColor: css(name, fallback, 0.22),
      bottomColor: css(name, fallback, 0),
    })
  }, [tone])

  useEffect(() => {
    chart.current?.applyOptions({
      localization: { priceFormatter: (p: number) => price(p, currency) },
    })
  }, [currency])

  useEffect(() => {
    const time = (i: number) => seconds(pts[i].t) as UTCTimestamp
    index.current = new Map(pts.map((_, i) => [time(i), i]))
    marked.current = [...on.keys()]
    line.current?.setData(pts.map((p, i) => ({ time: time(i), value: p.v })))
    const good = css('--state-good', '#4fd08a')
    const bad = css('--state-danger', '#ef6a5a')
    dots.current?.setMarkers(
      [...on].flatMap(([i, ms]) =>
        (['buy', 'sell'] as const)
          .filter((side) => ms.some((m) => m.side === side))
          .map((side) => ({
            time: time(i),
            position:
              side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
            shape: 'circle' as const,
            color: side === 'buy' ? good : bad,
            size: 1,
          })),
      ),
    )
  }, [pts, on])

  /* A range pill sets what is in view; the wheel and a drag go on from
     there. A little air after the latest close, as the mockup has. */
  useEffect(() => {
    const first = firstSince(pts, since)
    const air = pts.length - first > 20 ? 2 : 0
    chart.current?.timeScale().setVisibleLogicalRange({
      from: first - 0.5,
      to: pts.length - 0.5 + air,
    })
  }, [pts, since])

  const seen = pts[at ?? pts.length - 1]
  /* The key names only what is on the chart. */
  const sides = new Set([...on.values()].flat().map((m) => m.side))
  const held = at === null ? undefined : on.get(at)

  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid="price-read"
        className="flex min-h-[42px] flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-[13px] text-foreground tabular-nums sm:min-h-[22px]"
      >
        {measured ? (
          <>
            <span className="text-[10.5px] text-ink-500">
              {measured.kind === 'ruler' ? 'from ' : ''}
              {DAY.format(new Date(measured.from.t))}
            </span>
            <span>{price(measured.from.v, currency)}</span>
            <span className="text-[10.5px] text-ink-500">
              {measured.kind === 'ruler' ? 'to' : '→'}{' '}
              {DAY.format(new Date(measured.to.t))}
            </span>
            <span>{price(measured.to.v, currency)}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11.5px] ${measured.diff >= 0 ? 'bg-state-good/14 text-state-good' : 'bg-state-danger/14 text-state-danger'}`}
            >
              {change(measured, (v) => price(v, currency))}
              {measured.kind === 'ruler'
                ? ` · ${daysBetween(measured.days)}`
                : ''}
            </span>
          </>
        ) : held ? (
          <>
            <span
              className={`rounded-full px-2 py-0.5 text-[11.5px] ${held[0].side === 'buy' ? 'bg-state-good/14 text-state-good' : 'bg-state-danger/14 text-state-danger'}`}
            >
              {held[0].side === 'buy' ? 'bought' : 'sold'}
            </span>
            {held[0].eur === undefined ? null : (
              <span>
                <Veiled>{euros(held[0].eur)}</Veiled>
              </span>
            )}
            <span className="text-[10.5px] text-ink-500">
              {DAY.format(new Date(held[0].t))} · at {price(seen.v, currency)}
              {held.length > 1 ? ` · and ${held.length - 1} more that day` : ''}
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
      {/* Its own layer: the library's canvases carry a z-index of their
          own, and the tools draw above it. */}
      <div
        data-testid="price-plot"
        role="img"
        aria-label="Price over the period, with buys and sells"
        className={`${PLOT} relative z-0 overflow-hidden`}
      >
        <div ref={box} className="absolute inset-0" />
        <ToolLayer
          tool={tool}
          chart={chart}
          line={line}
          pts={pts}
          say={(v) => price(v, currency)}
          onPoint={setAt}
          onRead={setMeasured}
        />
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1 font-mono text-[10.5px] text-ink-500">
        {(['buy', 'sell'] as const)
          .filter((side) => sides.has(side))
          .map((side) => (
            <span key={side} className="flex items-center gap-1.5">
              <i
                className={`size-[9px] rounded-full border-2 ${side === 'buy' ? 'border-state-good' : 'border-state-danger'}`}
              />
              {side === 'buy' ? 'bought' : 'sold'}
            </span>
          ))}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer"
          className="ml-auto hover:text-ink-300"
        >
          TradingView Lightweight Charts™ · © 2025 TradingView, Inc.
        </a>
      </div>
    </div>
  )
}
