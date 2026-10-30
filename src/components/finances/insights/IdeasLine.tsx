import { useState } from 'react'

import { TickerLogo } from '@/components/finances/Logo'
import { chipsOf } from '@/lib/ideasBoard'
import type { TickerFacts } from '@/lib/ideasBoard'
import type { BoardLine } from '@/lib/ideasRead'
import type { Fact } from '@/lib/marketRead'
import { siteWord } from '@/lib/askCopy'
import type { Point } from '@/lib/insightsMarket'
import { Star } from './AskBlocks'
import { RangeChart } from './RangeChart'
import { money, tickerRows } from '@/lib/ideasNumbers'
import type { NumRow } from '@/lib/ideasNumbers'

/* One line of the IDEAS board (mockup ideas-board.html): logo and name,
   what MINE holds of it, three months' line, today and two signal chips
   (the app's, from fetched closes), the model's call and €, ✦; under it
   WHY and the € reason in the model's words, and ▸ NUMBERS — facts the
   app prints, or a claim with its page. */

export const eurWord = (n: number) =>
  `€${Math.round(n).toLocaleString('en-GB')}`

export function Spark({
  points,
  w = 60,
  h = 22,
}: {
  points: Array<Point>
  w?: number
  h?: number
}) {
  if (points.length < 2) return <svg className="idb-spark" aria-hidden />
  const vs = points.map((p) => p.v)
  const lo = Math.min(...vs)
  const hi = Math.max(...vs)
  const up = vs[vs.length - 1] >= vs[0]
  return (
    <svg
      className="idb-spark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        className="draw"
        style={{ stroke: up ? 'var(--state-good)' : 'var(--state-danger)' }}
        vectorEffect="non-scaling-stroke"
        points={points
          .map(
            (p, i) =>
              `${((i / (points.length - 1)) * w).toFixed(1)},${(h - 1 - ((p.v - lo) / (hi - lo || 1)) * (h - 2)).toFixed(1)}`,
          )
          .join(' ')}
      />
    </svg>
  )
}

export function IdeasLine({
  line,
  facts,
  held,
  readFacts,
  lit,
  onAsk,
  i,
}: {
  line: BoardLine
  /** Undefined while the board is fetched. */
  facts: TickerFacts | undefined
  /** What MINE holds of it, or the allocation line a NEW one fills. */
  held: { big: string; small: string; pct?: number }
  readFacts: Array<Fact>
  lit: boolean
  onAsk: () => void
  i: number
}) {
  const [open, setOpen] = useState(false)
  const day = facts?.day
  const chips = facts ? chipsOf(facts) : []
  const rows = line.numbers.flatMap((n): Array<NumRow> => {
    if (n.key === '')
      return [{ k: siteWord(new URL(n.url).hostname), v: n.text, url: n.url }]
    const f = readFacts.find((x) => x.key === n.key)
    if (!f) return []
    if (f.key.startsWith('tk-'))
      return facts
        ? tickerRows(facts)
        : f.value.split(' · ').map((v) => ({ k: '', v }))
    if (f.key.startsWith('pos-'))
      return [
        {
          k: 'MINE',
          v: f.value.split(' · ')[0],
          n: f.value.split(' · ')[1]?.toUpperCase(),
        },
      ]
    return [{ k: f.label, v: f.value }]
  })
  return (
    <div
      data-testid="idb-line"
      data-ticker={line.ticker}
      data-call={line.call}
      className={`idb-ln ${lit ? 'on' : ''}`}
      style={{ '--i': i } as React.CSSProperties}
    >
      <TickerLogo symbol={line.ticker} name={line.name} size={28} />
      <span className="min-w-0">
        <span className="nm">{line.name}</span>
        <span className="tk">{line.ticker}</span>
      </span>
      <span className="idb-facts">
        <span className="idb-held">
          <b>{held.big}</b>
          <span className="sm">
            {held.pct !== undefined ? (
              <i
                className="meter"
                style={
                  {
                    '--w': `${Math.min(100, held.pct)}%`,
                  } as React.CSSProperties
                }
              />
            ) : null}
            {held.small}
          </span>
        </span>
        {facts ? (
          <Spark points={facts.points} />
        ) : (
          <span className="ask-shim h-[22px]" />
        )}
        <span className="idb-chips">
          {day ? (
            <span className={`idb-pill ${day.change >= 0 ? 'good' : 'bad'}`}>
              {day.change >= 0 ? '▲' : '▼'} {Math.abs(day.change).toFixed(1)}%
            </span>
          ) : null}
          {chips.map((c) => (
            <span key={c.text} className={`idb-pill ${c.tone}`}>
              {c.text}
            </span>
          ))}
        </span>
      </span>
      <span data-testid="idb-call" className={`idb-call ${line.call}`}>
        {line.call.toUpperCase()}
      </span>
      <span
        data-testid="idb-eur"
        className={`idb-eur ${line.eur === 0 ? 'zero' : ''}`}
      >
        {line.eur === 0 ? '€0' : `+${eurWord(line.eur)}`}
      </span>
      <button
        type="button"
        data-testid="idb-ask"
        aria-pressed={lit}
        aria-label={`Ask about ${line.ticker}`}
        className="idb-star"
        onClick={onAsk}
      >
        <Star />
      </button>
      <div className="idb-why">
        <span className="k">WHY</span>
        <span>{line.why}</span>
        <span className="k">{line.eur === 0 ? '€0' : eurWord(line.eur)}</span>
        <span>{line.eurWhy}</span>
      </div>
      {rows.length > 0 ? (
        <details
          data-testid="idb-numbers"
          className="idb-more"
          onToggle={(e) => setOpen(e.currentTarget.open)}
        >
          <summary>NUMBERS · {rows.length}</summary>
          <div className="idb-nums">
            <div className="idb-numtab" data-testid="idb-numtab">
              {rows.map((r, j) => (
                <div key={j} className="r">
                  <span className="k">{r.k}</span>
                  <span className={`v ${r.tone ?? ''}`}>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.v} ↗
                      </a>
                    ) : (
                      r.v
                    )}
                  </span>
                  <span className="n">{r.n ?? ''}</span>
                </div>
              ))}
            </div>
            {/* His 29 Oct "next to the numbers I would add chart and link
              to yahoo finance": fetched when NUMBERS opens. */}
            {open ? (
              <RangeChart
                title={`${line.name} · ${line.ticker}`}
                symbol={line.ticker}
                start="1M"
                fmt={(v) => money(facts?.currency ?? 'USD', v)}
              />
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  )
}
