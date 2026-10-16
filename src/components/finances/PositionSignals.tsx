import { useEffect, useState } from 'react'
import { ChevronDown, MoveRight, TrendingDown, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'

import { ARROW, DAY, Stroke, WAY_TEXT } from '@/components/finances/ChartLines'
import type { Lines } from '@/components/finances/ChartLines'
import type { LineId, Signal, Way } from '@/lib/indicators'

/* Under a position's chart, two tabs (15 Oct: "hide it in tab, we have
   list of buys/sells, and we can have list of signals"; mockup
   indicators.html): SIGNALS first, BUYS AND SELLS beside it, the last
   one chosen kept on this device. A signal is one row — its line's mark
   (which puts the line on the chart), its textbook verdict in colour,
   the number, a gauge — and opens on a tap to one plain sentence and
   both numbers. */

type Tab = 'signals' | 'trades'
const KEPT = 'position-tab'
const kept = (): Tab => {
  try {
    return localStorage.getItem(KEPT) === 'trades' ? 'trades' : 'signals'
  } catch {
    return 'signals'
  }
}

const TONE: Record<Way, string> = {
  up: 'text-state-good bg-state-good/14 ring-state-good/45',
  down: 'text-state-danger bg-state-danger/14 ring-state-danger/45',
  flat: 'text-ink-300 bg-lift/[0.06] ring-lift/20',
}
const OPEN: Record<Way, string> = {
  up: 'bg-state-good/[0.07]',
  down: 'bg-state-danger/[0.07]',
  flat: 'bg-lift/[0.04]',
}
const DOT: Record<Way, string> = {
  up: 'bg-state-good shadow-[0_0_12px_var(--state-good)]',
  down: 'bg-state-danger shadow-[0_0_12px_var(--state-danger)]',
  flat: 'bg-ink-400',
}
const ICON = { up: TrendingUp, down: TrendingDown, flat: MoveRight }
const NAME: Record<LineId, [string, string]> = {
  avg: ['avg buy', ''],
  sma50: ['sma 50', '50 days'],
  sma200: ['sma 200', '200 days'],
  rsi: ['rsi 14', 'momentum'],
  yr: ['52 weeks', 'from high'],
}
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`

export function PositionTabs({
  lines,
  say,
  trades,
  count,
  top,
}: {
  lines: Lines
  say: (v: number) => string
  /** Above the signal rows: the verdict, while something is held. */
  top?: ReactNode
  /** The BUYS AND SELLS list, as built. */
  trades: ReactNode
  count: number
}) {
  const [tab, setTab] = useState<Tab>(kept)
  const [opened, setOpened] = useState<LineId | null>(null)
  const pick = (t: Tab) => {
    setTab(t)
    try {
      localStorage.setItem(KEPT, t)
    } catch {
      /* Kept for this visit only. */
    }
  }
  const n = (w: Way) => lines.rows.filter((r) => r.way === w).length
  const tabClass = (on: boolean) =>
    `relative inline-flex items-center gap-2 px-2 pt-2.5 pb-3 font-mono text-[10.5px] tracking-[0.1em] whitespace-nowrap uppercase transition-colors sm:px-3 sm:text-[11px] sm:tracking-[0.14em] ${on ? 'text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-lav-400 after:shadow-[0_0_10px_var(--color-lav-400)]' : 'text-ink-500 hover:text-ink-200'}`
  return (
    <div className="flex flex-col">
      <div
        role="tablist"
        data-testid="position-tabs"
        className="flex gap-1 border-b border-lift/8"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'signals'}
          onClick={() => pick('signals')}
          className={tabClass(tab === 'signals')}
        >
          signals
          <span className="flex gap-1.5 tracking-[0.06em]">
            {(['up', 'down', 'flat'] as const).map((w) => (
              <span key={w} className={WAY_TEXT[w]}>
                {n(w)} {ARROW[w]}
              </span>
            ))}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'trades'}
          onClick={() => pick('trades')}
          className={tabClass(tab === 'trades')}
        >
          {`buys and sells · ${count}`}
        </button>
      </div>
      {tab === 'trades' ? (
        <div className="pt-2">{trades}</div>
      ) : (
        <div className="flex flex-col pt-1.5">
          {top}
          {lines.rows.map((r, i) => (
            <Row
              key={r.id}
              row={r}
              i={i}
              lines={lines}
              say={say}
              open={opened === r.id}
              onOpen={() => setOpened(opened === r.id ? null : r.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Row({
  row,
  i,
  lines,
  say,
  open,
  onOpen,
}: {
  row: Signal
  i: number
  lines: Lines
  say: (v: number) => string
  open: boolean
  onOpen: () => void
}) {
  const Icon = ICON[row.way]
  const [name, sub] = NAME[row.id]
  const { avg, year } = lines
  const lit = lines.on.has(row.id)
  const words = sentence(row)
  return (
    <div
      data-testid="signal"
      data-id={row.id}
      style={{ animationDelay: `${i * 50}ms` }}
      className={`motion-arrive rounded-[12px] transition-colors ${open ? OPEN[row.way] : ''} border-t border-lift/6 first:border-t-0`}
    >
      <div className="grid grid-cols-[30px_minmax(0,1fr)_auto_18px] items-center gap-x-3 gap-y-2 px-2 py-2.5 sm:grid-cols-[30px_150px_132px_72px_minmax(80px,1fr)_18px]">
        <button
          type="button"
          aria-label={`${name.toUpperCase()} on the chart`}
          aria-pressed={lit}
          onClick={() => lines.toggle(row.id)}
          className={`col-start-1 row-start-1 grid h-[22px] w-7 place-items-center rounded-[7px] ring-1 transition-colors ring-inset ${lit ? 'bg-lav-400/15 ring-lav-400/55' : 'ring-lift/12 hover:ring-lift/30'}`}
        >
          <Stroke id={row.id} lit={lit} />
        </button>
        <button
          type="button"
          aria-expanded={open}
          onClick={onOpen}
          className="col-start-2 row-start-1 min-w-0 text-left font-mono text-[11.5px] tracking-[0.12em] text-foreground uppercase sm:whitespace-nowrap"
        >
          {name}
          <small className="mt-0.5 block text-[10px] tracking-[0.08em] text-ink-500">
            {row.id === 'avg' && avg
              ? `since ${DAY.format(new Date(avg.from))}`
              : sub}
          </small>
        </button>
        <span
          className={`col-start-3 row-start-1 inline-flex items-center gap-1.5 justify-self-start rounded-full px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.12em] whitespace-nowrap uppercase ring-1 ring-inset ${TONE[row.way]}`}
        >
          <Icon className="size-3.5" />
          {row.verdict}
        </span>
        <button
          type="button"
          aria-label={open ? 'Close' : 'Open'}
          onClick={onOpen}
          className="col-start-4 row-start-1 sm:col-start-6"
        >
          <ChevronDown
            className={`size-4 text-ink-500 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        <span
          className={`col-start-2 row-start-2 text-[16px] tabular-nums sm:col-start-4 sm:row-start-1 sm:text-[19px] ${WAY_TEXT[row.way]}`}
        >
          {row.id === 'rsi' ? row.pct.toFixed(0) : pct(row.pct)}
        </span>
        <Gauge row={row} />
      </div>
      {open ? (
        <div className="motion-arrive px-2 pb-3.5 sm:pl-[50px]">
          <p className="text-[13.5px] leading-relaxed text-ink-200">{words}</p>
          <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 font-mono text-[12px] text-foreground tabular-nums">
            {numbers(row, say, avg, year).map(([k, v]) => (
              <span key={k}>
                <small className="mr-1.5 text-[10px] tracking-[0.12em] text-ink-500 uppercase">
                  {k}
                </small>
                {v}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* A gauge: price against a line runs from −15% to +15%, red to green;
   RSI 0–100 with its 30 and 70 zones; 52W from the low to the high. */
function Gauge({ row }: { row: Signal }) {
  /* The dot slides in from the middle to today's place (15 Oct, mockup
     verdict.html). */
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const f = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(f)
  }, [])
  const zones =
    row.id === 'rsi'
      ? 'bg-[linear-gradient(90deg,color-mix(in_oklch,var(--state-good)_26%,transparent)_30%,transparent_30%_70%,color-mix(in_oklch,var(--state-danger)_26%,transparent)_70%)]'
      : 'bg-[linear-gradient(90deg,color-mix(in_oklch,var(--state-danger)_24%,transparent),color-mix(in_oklch,var(--state-good)_24%,transparent))]'
  return (
    <div
      className={`relative col-span-2 col-start-3 row-start-2 h-[7px] rounded-full bg-lift/8 sm:col-span-1 sm:col-start-5 sm:row-start-1 ${zones}`}
    >
      {row.id === 'rsi' || row.id === 'yr' ? null : (
        <i className="absolute -inset-y-[3px] left-1/2 w-[1.5px] bg-ink-500" />
      )}
      <i
        className={`absolute top-1/2 -mt-[6.5px] -ml-[6.5px] size-[13px] rounded-full transition-[left] duration-700 ${DOT[row.way]}`}
        style={{ left: `${shown ? row.at : 50}%` }}
      />
    </div>
  )
}

function sentence(r: Signal) {
  const up = r.way === 'up'
  switch (r.id) {
    case 'avg':
      return up
        ? 'Each share of this round is worth more than its average cost.'
        : 'Each share of this round is worth less than its average cost.'
    case 'sma50':
      return up
        ? 'Price above its 50-day average: the trend of recent months is up.'
        : 'Price below its 50-day average: the trend of recent months is down.'
    case 'sma200':
      return up
        ? 'Price above its 200-day average: the long trend is up.'
        : 'Price below its 200-day average: the long trend is down.'
    case 'rsi':
      return r.verdict === 'overbought'
        ? 'Rose fast in 14 days. Often pauses or drops next.'
        : r.verdict === 'oversold'
          ? 'Fell fast in 14 days. Often bounces next.'
          : 'Normal speed: neither rising nor falling too fast.'
    case 'yr':
      return r.verdict === 'near high'
        ? 'Close to the top of its year: strong, but not cheap.'
        : r.verdict === 'near low'
          ? 'Close to the bottom of its year: weak, but cheaper than most of the year.'
          : 'In the middle of its year: neither at the top nor at the bottom.'
  }
}

function numbers(
  r: Signal,
  say: (v: number) => string,
  avg: Lines['avg'],
  year: Lines['year'],
): Array<[string, string]> {
  const price: [string, string] = ['price', say(r.price)]
  switch (r.id) {
    case 'avg':
      return [
        price,
        ['avg buy', say(r.level)],
        ['buys', `${avg?.buys ?? 0} BUY`],
      ]
    case 'sma50':
      return [price, ['sma 50', say(r.level)]]
    case 'sma200':
      return [price, ['sma 200', say(r.level)]]
    case 'rsi':
      return [
        ['rsi 14', `${r.pct.toFixed(1)} of 100`],
        ['overbought', 'over 70'],
        ['oversold', 'under 30'],
      ]
    case 'yr':
      return year
        ? [
            price,
            [
              '52w high',
              `${say(year.high.v)} · ${DAY.format(new Date(year.high.t))}`,
            ],
            [
              '52w low',
              `${say(year.low.v)} · ${DAY.format(new Date(year.low.t))}`,
            ],
          ]
        : [price]
  }
}
