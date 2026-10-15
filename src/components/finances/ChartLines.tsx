import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { LINE_COLOUR } from '@/components/finances/lineSeries'
import type { Drawn } from '@/components/finances/lineSeries'
import { avgBuy, rateOn, rsi, signals, sma, yearRange } from '@/lib/indicators'
import type { LineId, Signal } from '@/lib/indicators'
import type { Pt } from '@/lib/priceChart'

/* The lines a position's chart can add, and the SIGNALS they give (15
   Oct, mockup indicators.html; CLAUDE.md "Reality over gamification").
   Every number comes from the named functions in src/lib/indicators.ts;
   this file only says which are lit. Off on every open of a page. */

export const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

type Trade = Parameters<typeof avgBuy>[0][number]

export function useChartLines({
  pts,
  trades,
  currency,
  instrument,
  older,
}: {
  /** The stored closes as the chart has them, oldest first. */
  pts: ReadonlyArray<Pt>
  trades: ReadonlyArray<Trade>
  currency: string
  instrument: string
  /** SMA 200 reads the older years before it draws (as ALL does). */
  older: { has: boolean; reading: boolean; ask: () => Promise<boolean> }
}) {
  const [on, setOn] = useState<ReadonlySet<LineId>>(new Set())
  useEffect(() => setOn(new Set()), [instrument])
  const avg = useMemo(
    () => avgBuy(trades, currency === 'EUR' ? () => 1 : rateOn(pts)),
    [trades, currency, pts],
  )
  const year = useMemo(() => yearRange(pts), [pts])
  const rows = useMemo(
    () => signals(pts, avg?.price ?? null),
    [pts, avg?.price],
  )
  const can = new Set(rows.map((r) => r.id))
  const reading = on.has('sma200') && older.reading
  const drawn = useMemo((): Drawn => {
    const d: Drawn = {}
    if (on.has('avg') && avg?.price != null)
      d.avg = { price: avg.price, from: avg.from }
    if (on.has('sma50')) d.sma50 = sma(pts, 50)
    if (on.has('sma200') && !reading) d.sma200 = sma(pts, 200)
    if (on.has('rsi')) d.rsi = rsi(pts, 14)
    if (on.has('yr') && year)
      d.yr = { high: year.high.v, low: year.low.v, from: year.from }
    return d
  }, [on, avg, pts, reading, year])
  const toggle = (id: LineId) => {
    if (id === 'sma200' && !on.has(id) && !older.has) void older.ask()
    setOn((o) => {
      const n = new Set(o)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }
  return { on, can, rows, avg, year, drawn, reading, toggle }
}
export type Lines = ReturnType<typeof useChartLines>

const NAME: Record<LineId, string> = {
  avg: 'avg buy',
  sma50: 'sma 50',
  sma200: 'sma 200',
  rsi: 'rsi 14',
  yr: '52w',
}
const STROKE: Partial<Record<LineId, string>> = {
  avg: 'border-dashed',
  yr: 'border-dotted',
}
export const ARROW = { up: '▲', down: '▼', flat: '—' } as const
export const WAY_TEXT = {
  up: 'text-state-good',
  down: 'text-state-danger',
  flat: 'text-ink-400',
} as const

/** A line's mark: a short stroke in its colour. */
export const Stroke = ({ id, lit = true }: { id: LineId; lit?: boolean }) => (
  <i
    aria-hidden
    className={`w-3 border-t-2 transition-opacity ${STROKE[id] ?? ''} ${lit ? '' : 'opacity-45'}`}
    style={{ borderColor: `var(${LINE_COLOUR[id][0]})` }}
  />
)

/* The pills: one a line, its stroke lit when on, and its verdict's
   arrow beside it (15 Oct: "SMA 200 ▼"). SMA 200 spins while the older
   years are read. */
export function LinePills({ lines }: { lines: Lines }) {
  const verdict = new Map<LineId, Signal>(lines.rows.map((r) => [r.id, r]))
  return (
    <div className="flex flex-wrap gap-1.5">
      {(['avg', 'sma50', 'sma200', 'rsi', 'yr'] as const)
        .filter((id) => lines.can.has(id))
        .map((id) => {
          const lit = lines.on.has(id)
          const way = verdict.get(id)?.way
          const busy = id === 'sma200' && lines.reading
          return (
            <button
              key={id}
              type="button"
              aria-pressed={lit}
              onClick={() => lines.toggle(id)}
              className={`${lit ? PILL_LOUD : PILL_QUIET} inline-flex items-center gap-1.5`}
            >
              {busy ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Stroke id={id} lit={lit} />
              )}
              {busy ? 'reading…' : NAME[id]}
              {lit && !busy && way ? (
                <span
                  aria-hidden
                  className={`motion-arrive text-[9px] ${WAY_TEXT[way]}`}
                >
                  {ARROW[way]}
                </span>
              ) : null}
            </button>
          )
        })}
    </div>
  )
}

/** The key of what is drawn, each with its period; AVG BUY with both
    currencies, its buys and the round's first day. */
export function lineKeys(
  lines: Lines,
  say: (v: number) => string,
  euros: (v: number) => string,
): Array<{ id: LineId; text: string }> {
  const { drawn, avg, year } = lines
  const out: Array<{ id: LineId; text: string }> = []
  if (drawn.avg && avg)
    out.push({
      id: 'avg',
      text: `AVG BUY ${say(drawn.avg.price)} · ${euros(avg.eur)} · ${avg.buys} BUY · SINCE ${DAY.format(new Date(avg.from))}`,
    })
  if (drawn.sma50) out.push({ id: 'sma50', text: 'SMA 50 · 50 closes' })
  if (drawn.sma200) out.push({ id: 'sma200', text: 'SMA 200 · 200 closes' })
  if (drawn.rsi) out.push({ id: 'rsi', text: 'RSI 14 · 14 closes · 30 / 70' })
  if (drawn.yr && year)
    out.push({
      id: 'yr',
      text: `52W HIGH ${say(year.high.v)} · ${DAY.format(new Date(year.high.t))} · 52W LOW ${say(year.low.v)} · ${DAY.format(new Date(year.low.t))}`,
    })
  return out
}
