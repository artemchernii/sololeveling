import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CrosshairMode,
  createChart,
  createSeriesMarkers,
} from 'lightweight-charts'
import type {
  IChartApi,
  ISeriesMarkersPluginApi,
  Logical,
  LogicalRange,
  Time,
} from 'lightweight-charts'

import {
  ToolLayer,
  change,
  daysBetween,
} from '@/components/finances/ChartTools'
import type { Measured, Tool } from '@/components/finances/ChartTools'
import {
  addMain,
  addVolume,
  dotLevels,
  dotsOf,
  fill,
  makeRoom,
  tint,
} from '@/components/finances/chartSeries'
import type { Main, Tone, View } from '@/components/finances/chartSeries'
import { DotBox } from '@/components/finances/DotBox'
import { drawLines, drawnIds } from '@/components/finances/lineSeries'
import type { Drawn } from '@/components/finances/lineSeries'
import { LineKeys, LineReads } from '@/components/finances/LineKeys'
import type { LineId } from '@/lib/indicators'
import { money } from '@/lib/currency'
import { euros } from '@/lib/money'
import {
  firstSince,
  leftStop,
  many,
  nearMark,
  priceSeries,
  seconds,
} from '@/lib/priceChart'
import type { Mark } from '@/lib/priceChart'
import { css, token } from '@/lib/tokenColour'

const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/* The latest price says its time too (13 Oct: "Latest price needs
   time"); a past day is its close. */
const NOW = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/* How far across, in pixels, a dot is read from. */
const DOT_REACH = 9
const PLOT = 'h-[300px] rounded-[14px] sm:h-[380px]'
/* With RSI 14's pane under the price (mockup indicators.html). */
const PLOT_RSI = 'h-[390px] rounded-[14px] sm:h-[480px]'

/* The price axis in the position's currency, for every line on it. */
const priceFormat = (currency: string) => ({
  type: 'custom' as const,
  minMove: 0.01,
  formatter: (p: number) => price(p, currency),
})

const price = (v: number, currency: string) =>
  money(Math.round(v * 100) / 100, currency)

/* A close in euros where the server worked one out, and the day's open,
   high, low and shares traded where it is stored as a bar
   (invest.priceLine). */
export type Close = {
  asOf: number
  price: number
  eur?: number
  open?: number
  high?: number
  low?: number
  volume?: number
}
/** A stored day as the chart's helpers take it. */
export const asPt = (p: Close) => ({
  t: p.asOf,
  v: p.price,
  eur: p.eur,
  o: p.open,
  h: p.high,
  l: p.low,
  vol: p.volume,
})

type Series = NonNullable<ReturnType<typeof priceSeries>>

/* One position's stored closes as a line, its buys and sells on it,
   drawn by TradingView's chart library (13 Oct: "library for sure",
   mockup chart.html). Green or red by whether the position is up or down
   since bought; lavender when that is not known. Or a candle a day, and
   the shares traded that day along the bottom (chartSeries.ts) — the
   page offers those only where they are stored.

   The wheel or two fingers zoom, a drag moves it; a range pill sets what
   is in view, of the year that is loaded. The line of words above reads
   under the pointer — a day's stored close in its currency and in euros,
   or what a lit tool has measured — and keeps its height. A buy or sell
   near the pointer is said in a box at its dot (DotBox). */
export function PriceChart({
  points,
  marks,
  currency,
  tone,
  since,
  tool = null,
  view = 'line',
  volume = false,
  lines = NONE,
  keys = [],
}: {
  points: ReadonlyArray<Close> | undefined
  marks: ReadonlyArray<Mark>
  currency: string
  tone: Tone
  /** The first moment of the range in view. */
  since: number
  /** Compare or the ruler, while its button is lit. */
  tool?: Tool | null
  view?: View
  /** The shares traded each day, drawn and said. */
  volume?: boolean
  /** AVG BUY, the averages, RSI, 52W: what is lit (useChartLines). */
  lines?: Drawn
  keys?: ReadonlyArray<{ id: LineId; text: string }>
}) {
  /* By what they hold, not by the arrays: the page hands new ones on
     every render, and a redraw would undo a zoom. */
  const held = JSON.stringify([points ?? [], marks])
  const series = useMemo(() => {
    const [closes, trades] = JSON.parse(held) as [Array<Close>, Array<Mark>]
    return priceSeries(closes.map(asPt), trades)
  }, [held])
  const lit = JSON.stringify(lines)
  const drawn = useMemo(() => JSON.parse(lit) as Drawn, [lit])
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
      view={view}
      volume={volume}
      lines={drawn}
      keys={keys}
    />
  )
}
const NONE: Drawn = {}

function Plot({
  series,
  currency,
  tone,
  since,
  tool,
  view,
  volume,
  lines,
  keys,
}: {
  series: Series
  currency: string
  tone: Tone
  since: number
  tool: Tool | null
  view: View
  volume: boolean
  lines: Drawn
  keys: ReadonlyArray<{ id: LineId; text: string }>
}) {
  const { pts, on } = series
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const line = useRef<Main | null>(null)
  /* What was in view, kept across a change of line to candles. */
  const span = useRef<LogicalRange | null>(null)
  const dots = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  /* The stored close under the pointer; none at rest. */
  const [at, setAt] = useState<number | null>(null)
  const index = useRef(new Map<number, number>())
  /* How many stored closes are drawn, for the stop at the first. */
  const count = useRef(pts.length)
  /* The stored closes a buy or a sell sits on. */
  const marked = useRef<Array<number>>([])
  /* Where each day's dot sits, for the height of its box. */
  const heights = useRef<Array<number>>([])
  /* What a tool measured; kept until the next press or Esc. */
  const [measured, setMeasured] = useState<Measured | null>(null)
  /* The dot near the pointer, where it is in the plot. */
  const [near, setNear] = useState<{
    i: number
    x: number
    y: number
    plot: { w: number; h: number; room: number }
  } | null>(null)

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
      const y =
        dot === null
          ? null
          : line.current?.priceToCoordinate(heights.current[dot])
      setNear(
        dot === null || y === null || y === undefined
          ? null
          : {
              i: dot,
              x: c.timeScale().logicalToCoordinate(dot as Logical) ?? 0,
              y,
              plot: {
                w: c.paneSize().width + c.priceScale('right').width(),
                h: c.paneSize().height,
                room: c.paneSize().width,
              },
            },
      )
    })
    /* Zooming out or dragging stops at the first stored day: no empty
       space before it (13 Oct, "i zoom out and see gaps"). The
       library's own fixLeftEdge also stops a range pill widening the
       view, so the stop is here. */
    c.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      const stop = leftStop(r, count.current)
      if (stop) c.timeScale().setVisibleLogicalRange(stop)
    })
    chart.current = c
    return () => {
      c.remove()
      chart.current = null
    }
  }, [])

  /* The line or the candles: one of them, made again when the pill
     changes, with the same days in view. */
  useEffect(() => {
    const c = chart.current
    if (!c) return
    const main = addMain(c, view)
    line.current = main
    dots.current = createSeriesMarkers(main, [])
    return () => {
      line.current = null
      dots.current = null
      if (chart.current !== c) return
      span.current = c.timeScale().getVisibleLogicalRange()
      c.removeSeries(main)
    }
  }, [view])

  useEffect(() => {
    if (line.current) tint(line.current, view, tone)
  }, [tone, view])

  useEffect(() => {
    line.current?.applyOptions({ priceFormat: priceFormat(currency) })
  }, [currency, view])

  /* The lit lines, drawn again when what is lit, the days or the view
     change (chartLines.ts). */
  useEffect(() => {
    const c = chart.current
    if (!c || !line.current) return
    return drawLines(c, pts, lines, priceFormat(currency))
  }, [lines, pts, view, currency])

  useEffect(() => {
    index.current = new Map(pts.map((p, i) => [seconds(p.t), i]))
    count.current = pts.length
    marked.current = [...on.keys()]
    heights.current = dotLevels(pts, on, view)
    if (line.current) fill(line.current, view, pts)
    dots.current?.setMarkers(dotsOf(pts, on))
    if (span.current)
      chart.current?.timeScale().setVisibleLogicalRange(span.current)
    span.current = null
  }, [pts, on, view])

  /* Volume has a scale of its own at the bottom; the line makes room. */
  useEffect(() => {
    const c = chart.current
    if (!c || !line.current) return
    makeRoom(line.current, volume)
    if (!volume) return
    const vol = addVolume(c, pts)
    return () => {
      if (chart.current === c) c.removeSeries(vol)
    }
  }, [volume, pts, view])

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
  /* The box at a dot: not while a tool holds what it measured. */
  const held = near === null || measured ? undefined : on.get(near.i)
  const dotDay = near === null ? undefined : pts[near.i]

  return (
    <div className="flex flex-col gap-2">
      <div
        data-testid="price-read"
        className="flex min-h-[50px] flex-wrap items-baseline gap-x-2.5 gap-y-0.5 font-mono text-[17px] text-foreground tabular-nums sm:min-h-[26px]"
      >
        {measured ? (
          <>
            <span className="text-[11.5px] text-ink-500">
              {measured.kind === 'ruler' ? 'from ' : ''}
              {DAY.format(new Date(measured.from.t))}
            </span>
            <span>{price(measured.from.v, currency)}</span>
            <span className="text-[11.5px] text-ink-500">
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
        ) : (
          <>
            <span>{price(seen.v, currency)}</span>
            {seen.eur === undefined ? null : (
              <span className="text-ink-300">{euros(seen.eur)}</span>
            )}
            <span className="text-[11.5px] text-ink-500">
              {(at === null ? NOW : DAY).format(new Date(seen.t))}
              {at === null ? ' · latest price' : ''}
              {volume && seen.vol !== undefined
                ? ` · ${many(seen.vol)} shares traded`
                : ''}
            </span>
            <LineReads
              lines={lines}
              t={seen.t}
              say={(v) => price(v, currency)}
            />
          </>
        )}
      </div>
      {/* Its own layer: the library's canvases carry a z-index of their
          own, and the tools draw above it. */}
      <div
        data-testid="price-plot"
        data-view={view}
        data-days={pts.length}
        data-lines={drawnIds(lines).join(' ')}
        role="img"
        aria-label="Price over the period, with buys and sells"
        className={`${lines.rsi ? PLOT_RSI : PLOT} relative z-0 overflow-hidden transition-[height] duration-300`}
      >
        <div ref={box} className="absolute inset-0" />
        {held && near && dotDay ? (
          <DotBox
            marks={held}
            dot={near}
            plot={near.plot}
            day={DAY.format(new Date(held[0].t))}
            price={price(dotDay.v, currency)}
            eur={dotDay.eur === undefined ? null : euros(dotDay.eur)}
          />
        ) : null}
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
      <div
        data-testid="chart-keys"
        className="flex flex-wrap gap-x-3.5 gap-y-1 font-mono text-[10.5px] text-ink-500"
      >
        {(['buy', 'sell'] as const)
          .filter((side) => sides.has(side))
          .map((side) => (
            <span key={side} className="flex items-center gap-1.5">
              <i
                className={`size-[9px] rounded-full border-2 ${side === 'buy' ? 'border-state-good' : 'border-state-danger'}`}
              />
              <span className="tracking-[0.12em] uppercase">{side}</span>
            </span>
          ))}
        {volume ? (
          <span className="flex items-center gap-1.5">
            <i className="size-[9px] rounded-[2px] bg-ink-600" />
            shares traded that day
          </span>
        ) : null}
        <LineKeys keys={keys} />
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
