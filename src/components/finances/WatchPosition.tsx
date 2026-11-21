import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ChevronLeft, Star } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { ToolPills, ViewPills } from '@/components/finances/ChartTools'
import type { Tool } from '@/components/finances/ChartTools'
import {
  LinePills,
  lineKeys,
  useChartLines,
} from '@/components/finances/ChartLines'
import { PositionHelper } from '@/components/finances/PositionHelper'
import { RANGES, RangePills } from '@/components/finances/RangePills'
import type { Range } from '@/components/finances/RangePills'
import { TickerLogo } from '@/components/finances/Logo'
import type { View } from '@/components/finances/chartSeries'
import { PriceChart, asPt } from '@/components/finances/PriceChart'
import { useOlderYears } from '@/components/finances/useOlderYears'
import { BADGE } from '@/components/finances/WatchRow'
import type { Watched } from '@/components/finances/useWatch'
import { useDayStarts } from '@/components/track/useDayStarts'
import { money } from '@/lib/currency'
import { euros } from '@/lib/money'
import { dayChange, drawable, priceSeries, withOlder } from '@/lib/priceChart'

/* A watched name's page (1 Nov, spec docs/specs/2026-11-01-watchlist.md):
   what a held one's page shows of the market — the price with its day,
   the chart with its lines, the verdict, fundamentals and news — and
   nothing of his, since none is owned. */

const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})
const TIME = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})
const NONE: ReadonlyArray<never> = []

export function WatchPosition({ w }: { w: Watched }) {
  const [range, setRange] = useState<Range>('1Y')
  const [tool, setTool] = useState<Tool | null>(null)
  const [view, setView] = useState<View>('line')
  const [volume, setVolume] = useState(false)
  const today = useDayStarts(1).at(-1) as number
  const days = RANGES.find((r) => r.id === range)?.days ?? Infinity
  const year = useQuery(api.invest.priceLine, {
    instrumentId: w.instrumentId,
    since: today - 366 * 86_400_000,
  })
  const years = useOlderYears(w.instrumentId)
  const line = useMemo(
    () => (year && years.older ? withOlder(year, years.older) : year),
    [year, years.older],
  )
  const can = useMemo(() => drawable((line ?? []).map(asPt)), [line])
  const pts = useMemo(
    () => priceSeries((line ?? []).map(asPt))?.pts ?? [],
    [line],
  )
  const lines = useChartLines({
    pts,
    trades: NONE,
    currency: w.currency,
    instrument: w.instrumentId,
    older: { has: years.older !== undefined, ...years },
  })
  const say = (v: number) => money(Math.round(v * 100) / 100, w.currency)
  const last = w.closes.at(0)
  const change =
    last === undefined || year === undefined ? null : dayChange(year, last)
  const tail = year?.at(-1)
  const latestEur =
    tail !== undefined && last !== undefined && tail.asOf === last.asOf
      ? tail.eur
      : undefined

  return (
    <section
      data-testid="watch-page"
      className="system-frame motion-arrive relative flex flex-col gap-[18px] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/finances"
          search={{ room: 'portfolio' }}
          className="motion-press inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-1.5 font-mono text-[11px] tracking-[0.14em] text-ink-400 uppercase transition-colors hover:bg-lift/[0.07] hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
          Portfolio
        </Link>
        <span
          className={`${BADGE} bg-state-warn/12 text-state-warn ring-state-warn/45`}
        >
          <Star className="size-3" fill="currentColor" /> watchlist · 0 held
        </span>
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <TickerLogo symbol={w.symbol} type={w.type} name={w.name} size={56} />
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight text-foreground">
            {w.name}
          </h1>
          <span className="font-mono text-[11px] text-ink-400">{w.symbol}</span>
        </div>
        <div
          data-testid="position-price"
          className="col-span-2 flex flex-col gap-0.5 sm:col-span-1 sm:text-right"
        >
          {last === undefined ? (
            <span className="text-[26px] font-light text-ink-500">—</span>
          ) : (
            <>
              <span className="flex items-baseline gap-2 sm:justify-end">
                <span className="text-[36px] leading-none font-medium tracking-[-0.02em] text-foreground tabular-nums">
                  {money(last.price, w.currency)}
                </span>
                {latestEur === undefined ? null : (
                  <span className="text-[18px] text-ink-300 tabular-nums">
                    {euros(latestEur)}
                  </span>
                )}
              </span>
              {change === null ? null : (
                <span className="flex flex-wrap items-baseline gap-x-2 sm:justify-end">
                  <span
                    className={`text-[15px] font-medium tabular-nums ${change.diff < 0 ? 'text-state-danger' : 'text-state-good'}`}
                  >
                    {change.diff < 0 ? '−' : '+'}
                    {Math.abs(change.diff).toFixed(2)} (
                    {change.diff < 0 ? '−' : '+'}
                    {Math.abs(change.pct).toFixed(2)}%)
                  </span>
                  <span className="font-mono text-[10.5px] text-ink-400">
                    from {money(change.from.v, w.currency)} ·{' '}
                    {DAY.format(new Date(change.from.t))} close
                  </span>
                </span>
              )}
              <span className="font-mono text-[10.5px] text-ink-400">
                {TIME.format(new Date(last.asOf))} · Yahoo Finance
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
          <span className="label-caps">price</span>
          <ToolPills tool={tool} onTool={setTool} />
          <div className="ml-auto flex flex-wrap justify-end gap-x-3.5 gap-y-2">
            <ViewPills
              can={can}
              view={can.candles ? view : 'line'}
              onView={setView}
              volume={can.volume && volume}
              onVolume={setVolume}
            />
            <RangePills range={range} onRange={setRange} years={years} />
          </div>
        </div>
        <LinePills lines={lines} />
        <PriceChart
          points={line}
          marks={[]}
          currency={w.currency}
          tone="plain"
          since={today - days * 86_400_000}
          tool={tool}
          view={can.candles ? view : 'line'}
          volume={can.volume && volume}
          lines={lines.drawn}
          keys={lineKeys(lines, say, euros)}
        />
      </div>

      <PositionHelper
        instrumentId={w.instrumentId}
        name={w.name}
        share={w.type === 'EQUITY'}
        held={pts.length > 0}
        lines={lines}
        say={say}
        trades={
          <span className={`${BADGE} text-ink-400 ring-lift/20`}>0 trades</span>
        }
        count={0}
        asOf={pts.at(-1)?.t ?? null}
      />
    </section>
  )
}
