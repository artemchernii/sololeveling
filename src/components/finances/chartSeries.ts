import {
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
} from 'lightweight-charts'
import type {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  SeriesMarker,
  SeriesType,
  Time,
  UTCTimestamp,
  WhitespaceData,
} from 'lightweight-charts'

import { money } from '@/lib/currency'
import { candleRows, seconds } from '@/lib/priceChart'
import type { Mark, Pt } from '@/lib/priceChart'
import { css } from '@/lib/tokenColour'

/* What the position chart draws its stored days as (13 Oct: "candles?
   volume?", mockup chart.html): the line of closes, or a candle a day
   where nearly every day has its open, high and low; and the shares traded
   that day as bars along the bottom, on a scale of their own. Colours
   come from the state tokens through css() — the library cannot parse
   oklch(). */

export type View = 'line' | 'candles'
/** The line or the candles: what the dots, the box and the tools sit on. */
export type Main = ISeriesApi<SeriesType>

/* The line's colour, and what the library draws if the token is gone. */
export const TONE = {
  up: ['--state-good', '#4fd08a'],
  down: ['--state-danger', '#ef6a5a'],
  plain: ['--color-lav-400', '#b5abfc'],
} as const
export type Tone = keyof typeof TONE

const good = (alpha?: number) => css('--state-good', '#4fd08a', alpha)
const bad = (alpha?: number) => css('--state-danger', '#ef6a5a', alpha)
const time = (p: Pt) => seconds(p.t) as UTCTimestamp

export function addMain(c: IChartApi, view: View): Main {
  if (view === 'line')
    return c.addSeries(AreaSeries, { lineWidth: 2, priceLineVisible: false })
  return c.addSeries(CandlestickSeries, {
    upColor: good(),
    downColor: bad(),
    wickUpColor: good(),
    wickDownColor: bad(),
    borderVisible: false,
    priceLineVisible: false,
  })
}

/** The line takes the position's colour; a candle its own day's. */
export function tint(main: Main, view: View, tone: Tone) {
  if (view !== 'line') return
  const [name, fallback] = TONE[tone]
  ;(main as ISeriesApi<'Area'>).applyOptions({
    lineColor: css(name, fallback),
    topColor: css(name, fallback, 0.22),
    bottomColor: css(name, fallback, 0),
  })
}

export function fill(main: Main, view: View, pts: ReadonlyArray<Pt>) {
  if (view === 'line')
    (main as ISeriesApi<'Area'>).setData(
      pts.map((p) => ({ time: time(p), value: p.v })),
    )
  else
    (main as ISeriesApi<'Candlestick'>).setData(
      candleRows(pts) as Array<
        CandlestickData<UTCTimestamp> | WhitespaceData<UTCTimestamp>
      >,
    )
}

/** A dot under the day of a buy, over the day of a sale. */
export function dotsOf(
  pts: ReadonlyArray<Pt>,
  on: ReadonlyMap<number, ReadonlyArray<Mark>>,
): Array<SeriesMarker<Time>> {
  return [...on].flatMap(([i, ms]) =>
    (['buy', 'sell'] as const)
      .filter((side) => ms.some((m) => m.side === side))
      .map((side) => ({
        time: time(pts[i]),
        position:
          side === 'buy' ? ('belowBar' as const) : ('aboveBar' as const),
        shape: 'circle' as const,
        color: side === 'buy' ? good() : bad(),
        size: 1,
      })),
  )
}

/** The height a dot's box is read from: the close on the line; on
    candles the day's low for a buy, its high for a sale. */
export const dotLevels = (
  pts: ReadonlyArray<Pt>,
  on: ReadonlyMap<number, ReadonlyArray<Mark>>,
  view: View,
) =>
  pts.map((p, i) =>
    view === 'line'
      ? p.v
      : ((on.get(i)?.[0].side === 'sell' ? p.h : p.l) ?? p.v),
  )

/* Room under the line for the volume bars, as the mockup has it. */
const WITH_VOLUME = { top: 0.1, bottom: 0.26 }
const ALONE = { top: 0.2, bottom: 0.1 }

/** Shares traded each day, along the bottom; green on a day that closed
    above its open, red below, grey where the open is not stored. */
export function addVolume(c: IChartApi, pts: ReadonlyArray<Pt>) {
  const vol = c.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: '',
    lastValueVisible: false,
    priceLineVisible: false,
  })
  vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
  const plain = css('--color-ink-500', '#6e6e84', 0.35)
  vol.setData(
    pts.flatMap((p) =>
      p.vol === undefined
        ? []
        : [
            {
              time: time(p),
              value: p.vol,
              color:
                p.o === undefined ? plain : p.v >= p.o ? good(0.35) : bad(0.35),
            },
          ],
    ),
  )
  return vol
}

export const makeRoom = (main: Main, volume: boolean) =>
  main.priceScale().applyOptions({ scaleMargins: volume ? WITH_VOLUME : ALONE })

/** A price in the position's currency, to the cent. */
export const price = (v: number, currency: string) =>
  money(Math.round(v * 100) / 100, currency)

/* The price axis in the position's currency, for every line on it. */
export const priceFormat = (currency: string) => ({
  type: 'custom' as const,
  minMove: 0.01,
  formatter: (p: number) => price(p, currency),
})
