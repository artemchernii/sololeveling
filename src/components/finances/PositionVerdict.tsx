import { useState } from 'react'
import {
  BookOpen,
  ChartLine,
  ChevronDown,
  CirclePause,
  CirclePlus,
  Hourglass,
  Newspaper,
} from 'lucide-react'

import { ARROW, DAY, WAY_TEXT } from '@/components/finances/ChartLines'
import type { Call, LineId, Signal } from '@/lib/indicators'
import { verdict } from '@/lib/indicators'

/* On top of SIGNALS, the call to act (15 Oct, mockup verdict.html; his
   "go verdict … tell me overall idea what is the best to do"): ADD,
   HOLD or WAIT by the rule in src/lib/indicators.ts, its line, the
   price against the avg buy, and the three rows it read — the ones that
   made the call ringed in its colour. FUNDAMENTALS and NEWS are marked
   next, where they will feed the rule. RULE opens the rule itself. */

const LOOK: Record<
  Call,
  { icon: typeof CirclePlus; area: string; text: string; panel: string }
> = {
  add: {
    icon: CirclePlus,
    area: 'var(--state-good)',
    text: 'text-state-good bg-state-good/16 ring-state-good/60',
    panel: 'bg-state-good/[0.07] ring-state-good/35',
  },
  hold: {
    icon: CirclePause,
    area: 'var(--color-lav-400)',
    text: 'text-lav-300 bg-lav-400/16 ring-lav-400/60',
    panel: 'bg-lav-400/[0.07] ring-lav-400/35',
  },
  wait: {
    icon: Hourglass,
    area: 'var(--state-warn)',
    text: 'text-state-warn bg-state-warn/16 ring-state-warn/60',
    panel: 'bg-state-warn/[0.07] ring-state-warn/35',
  },
}
const KEY: Record<Call, string> = {
  add: 'ring-[1.5px] ring-state-good/70 bg-state-good/10',
  hold: 'ring-[1.5px] ring-lav-400/70 bg-lav-400/10',
  wait: 'ring-[1.5px] ring-state-warn/70 bg-state-warn/10',
}
const RULE: Array<[Call, string]> = [
  [
    'add',
    'Above SMA 200, and under SMA 50 or RSI 14 under 45. RSI 14 not above 70.',
  ],
  [
    'hold',
    'Every other case: above SMA 200 with no dip, or between the two averages.',
  ],
  ['wait', 'Under SMA 50 and SMA 200, or RSI 14 above 70.'],
]
const REASONS: Array<[LineId, string]> = [
  ['sma200', 'sma 200'],
  ['sma50', 'sma 50'],
  ['rsi', 'rsi 14'],
]
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`

export function PositionVerdict({
  rows,
  avg,
  asOf,
  say,
}: {
  rows: ReadonlyArray<Signal>
  /** The avg buy in the chart's currency; null when not known. */
  avg: number | null
  /** The day of the latest stored close. */
  asOf: number
  say: (v: number) => string
}) {
  const [rule, setRule] = useState(false)
  const v = verdict(rows)
  if (v === null) return null
  const look = LOOK[v.call]
  const Icon = look.icon
  const price = rows.at(0)?.price
  return (
    <div
      data-testid="verdict"
      data-call={v.call}
      className={`motion-arrive relative mt-3 overflow-hidden rounded-[16px] p-4 ring-1 ring-inset ${look.panel}`}
    >
      <span className="label-caps text-ink-400">
        verdict · {DAY.format(new Date(asOf))}
      </span>
      <div className="mt-3 grid items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-4">
        <span className="motion-pop justify-self-start">
          <span
            data-testid="verdict-badge"
            style={{ ['--area' as string]: look.area }}
            className={`motion-pulse inline-flex items-center gap-2.5 rounded-[14px] px-4 py-2.5 font-mono text-[19px] font-medium tracking-[0.14em] uppercase ring-[1.5px] ring-inset sm:text-[22px] ${look.text}`}
          >
            <Icon className="size-6" />
            {v.call}
          </span>
        </span>
        <div
          className="motion-arrive text-[15px] leading-normal text-foreground"
          style={{ animationDelay: '200ms' }}
        >
          {v.line}
          {avg !== null && price !== undefined ? (
            <span className="mt-1.5 flex items-center gap-1.5 font-mono text-[11.5px] leading-snug text-ink-300">
              <i className="w-3.5 shrink-0 border-t-2 border-dashed border-lav-400" />
              price {say(price)} · avg buy {say(avg)} ·{' '}
              {price < avg
                ? 'a buy now lowers the avg buy'
                : 'a buy now raises the avg buy'}
            </span>
          ) : null}
        </div>
      </div>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        {REASONS.map(([id, name], i) => {
          const r = rows.find((x) => x.id === id)
          if (!r) return null
          const key = v.why.includes(id)
          return (
            <span
              key={id}
              data-testid="verdict-why"
              data-key={key}
              style={{ animationDelay: `${350 + i * 90}ms` }}
              className={`motion-arrive inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] text-ink-200 uppercase ring-inset ${key ? KEY[v.call] : 'bg-lift/5 ring-1 ring-lift/10'}`}
            >
              {name}
              <b
                className={`font-medium tracking-[0.02em] tabular-nums ${WAY_TEXT[r.way]}`}
              >
                {ARROW[r.way]} {id === 'rsi' ? r.pct.toFixed(0) : pct(r.pct)}
              </b>
            </span>
          )
        })}
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-lift/10 pt-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-lift/7 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-foreground uppercase">
          <ChartLine className="size-3.5" />
          technical · 3 lines
        </span>
        {(
          [
            [BookOpen, 'fundamentals'],
            [Newspaper, 'news'],
          ] as const
        ).map(([I, name]) => (
          <span
            key={name}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-ink-500 uppercase ring-1 ring-lift/14 ring-inset"
          >
            <I className="size-3.5" />
            {name}
            <i className="rounded-full bg-lav-400/18 px-1.5 text-lav-300 not-italic">
              next
            </i>
          </span>
        ))}
        <button
          type="button"
          aria-expanded={rule}
          onClick={() => setRule(!rule)}
          className="inline-flex items-center gap-1 px-1.5 py-1 font-mono text-[10px] tracking-[0.14em] text-ink-400 uppercase hover:text-foreground sm:ml-auto"
        >
          rule
          <ChevronDown
            className={`size-3.5 transition-transform ${rule ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {rule ? (
        <div className="motion-arrive mt-2.5 flex flex-col font-mono text-[11px] text-ink-300">
          {RULE.map(([call, words]) => (
            <div
              key={call}
              data-testid="rule-row"
              data-on={call === v.call}
              className={`grid grid-cols-[72px_minmax(0,1fr)] gap-2 border-t border-lift/7 px-2 py-1.5 ${call === v.call ? 'rounded-[8px] bg-lift/5 text-foreground' : ''}`}
            >
              <span
                className={`self-start justify-self-start rounded-full px-2 text-[10px] font-medium tracking-[0.12em] uppercase ${LOOK[call].text} ring-0`}
              >
                {call}
              </span>
              {words}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
