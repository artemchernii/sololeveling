import { LineSeries, LineStyle } from 'lightweight-charts'
import type {
  IChartApi,
  ISeriesApi,
  PriceFormat,
  UTCTimestamp,
} from 'lightweight-charts'

import { seconds } from '@/lib/priceChart'
import type { Pt } from '@/lib/priceChart'
import type { LineId } from '@/lib/indicators'
import { css } from '@/lib/tokenColour'

/* The lines a position's chart adds (15 Oct, mockup indicators.html),
   drawn by the chart library from what `useChartLines` worked out —
   nothing is computed here. RSI 14 has a pane of its own under the
   price, 0–100, with dotted guides at 30 and 70 in ink. */

type Close = { t: number; v: number }
export type Drawn = {
  avg?: { price: number; from: number }
  sma50?: ReadonlyArray<Close>
  sma200?: ReadonlyArray<Close>
  rsi?: ReadonlyArray<Close>
  yr?: { high: number; low: number; from: number }
}

/** What is drawn, in the order the key names it. */
export const drawnIds = (d: Drawn): Array<LineId> =>
  (['avg', 'sma50', 'sma200', 'rsi', 'yr'] as const).filter(
    (id) => d[id] !== undefined,
  )

/** Each line's colour token, and the library's fallback. */
export const LINE_COLOUR: Record<LineId, [string, string]> = {
  avg: ['--color-lav-400', '#b5abfc'],
  sma50: ['--ind-50', '#7cc4f5'],
  sma200: ['--ind-200', '#f0a3d4'],
  rsi: ['--ind-rsi', '#7fd3d0'],
  yr: ['--color-ink-400', '#8e8ea3'],
}
const colour = (id: LineId, alpha?: number) =>
  css(LINE_COLOUR[id][0], LINE_COLOUR[id][1], alpha)

const time = (t: number) => seconds(t) as UTCTimestamp
const flat = (pts: ReadonlyArray<Pt>, from: number, v: number) =>
  pts.filter((p) => p.t >= from).map((p) => ({ time: time(p.t), value: v }))

const RSI_PANE = 1
const RSI_HEIGHT = 96

type Data = Array<{ time: UTCTimestamp; value: number }>
const ARRIVE_MS = 700

/** Draws the lines; the returned function takes them off again. A line
    in `arrive` (just pressed, mockup verdict.html) draws itself from the
    view's left edge to today; the others are simply there. */
export function drawLines(
  c: IChartApi,
  pts: ReadonlyArray<Pt>,
  d: Drawn,
  format: PriceFormat,
  arrive: ReadonlySet<LineId> = new Set(),
) {
  const made: Array<ISeriesApi<'Line'>> = []
  const frames: Array<number> = []
  const fill = (id: LineId, s: ISeriesApi<'Line'>, data: Data) => {
    const seen = c.timeScale().getVisibleRange()?.from
    if (!arrive.has(id) || typeof seen !== 'number') return s.setData(data)
    const from = seen
    const before = data.filter((p) => p.time < from)
    const view = data.filter((p) => p.time >= from)
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ARRIVE_MS)
      const shown = Math.max(1, Math.round(view.length * (1 - (1 - k) ** 3)))
      s.setData(before.concat(view.slice(0, shown)))
      if (k < 1) frames.push(requestAnimationFrame(step))
    }
    s.setData(before)
    frames.push(requestAnimationFrame(step))
  }
  const add = (
    id: LineId,
    title: string,
    data: Data,
    style: LineStyle = LineStyle.Solid,
  ) => {
    const s = c.addSeries(LineSeries, {
      color: colour(id),
      lineWidth: id === 'yr' ? 1 : 2,
      lineStyle: style,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      title,
      priceFormat: format,
    })
    fill(id, s, data)
    made.push(s)
  }
  if (d.avg)
    add('avg', 'AVG BUY', flat(pts, d.avg.from, d.avg.price), LineStyle.Dashed)
  if (d.sma50)
    add(
      'sma50',
      'SMA 50',
      d.sma50.map((p) => ({ time: time(p.t), value: p.v })),
    )
  if (d.sma200)
    add(
      'sma200',
      'SMA 200',
      d.sma200.map((p) => ({ time: time(p.t), value: p.v })),
    )
  if (d.yr) {
    add('yr', '52W HIGH', flat(pts, d.yr.from, d.yr.high), LineStyle.Dotted)
    add('yr', '52W LOW', flat(pts, d.yr.from, d.yr.low), LineStyle.Dotted)
  }
  if (d.rsi) {
    const s = c.addSeries(
      LineSeries,
      {
        color: colour('rsi'),
        lineWidth: 2,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        priceFormat: {
          type: 'custom',
          minMove: 0.1,
          formatter: (v: number) => v.toFixed(0),
        },
        autoscaleInfoProvider: () => ({
          priceRange: { minValue: 0, maxValue: 100 },
        }),
      },
      RSI_PANE,
    )
    fill(
      'rsi',
      s,
      d.rsi.map((p) => ({ time: time(p.t), value: p.v })),
    )
    s.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } })
    for (const price of [30, 70])
      s.createPriceLine({
        price,
        color: css('--color-ink-500', '#6e6e84', 0.7),
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: '',
      })
    c.panes()[RSI_PANE]?.setHeight(RSI_HEIGHT)
    made.push(s)
  }
  return () => {
    for (const f of frames) cancelAnimationFrame(f)
    for (const s of made) c.removeSeries(s)
    if (c.panes().length > RSI_PANE) c.removePane(RSI_PANE)
  }
}
