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
import type { ReactNode } from 'react'

import { ARROW, DAY, WAY_TEXT } from '@/components/finances/ChartLines'
import type { Fundamentals, News } from '@/components/finances/usePositionFeeds'
import type { Tab } from '@/components/finances/PositionSignals'
import type { Call, FundId, LineId, Signal, Way } from '@/lib/indicators'
import { fundWays, toTarget, verdict } from '@/lib/indicators'

/* Above a position's tabs, the call to act (15 Oct, mockup verdict.html;
   16 Oct, fundamentals.html): ADD, HOLD or WAIT by the rule in
   src/lib/indicators.ts, its line, the price against the avg buy, and
   the reasons it read — the three lines and, for a share, the three
   fundamentals — the ones that made the call ringed in its colour.
   The feeds say what fed it, coloured by their ▲ and ▼; NEWS sits
   beside it, not in the rule. RULE opens the rule itself. */

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
const RULE: Array<[Call, string, boolean]> = [
  [
    'add',
    'Above SMA 200, and under SMA 50 or RSI 14 under 45. RSI 14 not above 70.',
    false,
  ],
  [
    'hold',
    'An ADD by the lines, and one of: price at or above the avg target · revenue down on a year before · rating 3.5 or worse.',
    true,
  ],
  [
    'hold',
    'Every other case: above SMA 200 with no dip, or between the two averages.',
    false,
  ],
  ['wait', 'Under SMA 50 and SMA 200, or RSI 14 above 70.', false],
]
const LINES: Array<[LineId, string]> = [
  ['sma200', 'sma 200'],
  ['sma50', 'sma 50'],
  ['rsi', 'rsi 14'],
]
const FUND: Array<FundId> = ['target', 'revenue', 'rating']
const TONE = {
  good: 'var(--state-good)',
  danger: 'var(--state-danger)',
  warn: 'var(--state-warn)',
}
const SHORT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})
const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`
const CHIP =
  'motion-arrive inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] whitespace-nowrap uppercase'

export function PositionVerdict({
  rows,
  avg,
  asOf,
  say,
  fund,
  share,
  updating,
  news,
  onTab,
}: {
  rows: ReadonlyArray<Signal>
  /** The avg buy in the chart's currency; null when not known. */
  avg: number | null
  /** The day of the latest stored close. */
  asOf: number
  say: (v: number) => string
  /** The stored fundamentals; undefined while loading. */
  fund: Fundamentals | undefined
  /** A share has fundamentals; a fund has none. */
  share: boolean
  updating: boolean
  news: News
  onTab: (t: Tab) => void
}) {
  const [rule, setRule] = useState(false)
  const r = share ? (fund?.reading ?? null) : null
  const reading = r && {
    asOf: r.asOf,
    targetMean: r.target?.mean,
    revenueGrowth: r.revenueGrowth,
    ratingMean: r.rating?.mean,
  }
  const v = verdict(rows, { reading, now: Date.now(), say })
  if (v === null) return null
  const look = LOOK[v.call]
  const Icon = look.icon
  const price = rows.at(0)?.price ?? 0
  const ways = reading ? fundWays(reading, price) : {}
  const held = v.call === 'hold' && FUND.includes(v.why[0] as FundId)
  const fundChip = (id: FundId) => {
    if (!r) return null
    if (id === 'target' && r.target) return pct(toTarget(price, r.target.mean))
    if (id === 'revenue' && r.revenueGrowth !== undefined)
      return pct(r.revenueGrowth * 100)
    if (id === 'rating' && r.rating)
      return `${r.rating.key.replace(/_/g, ' ')} ${r.rating.mean.toFixed(1)}`
    return null
  }
  const chips: Array<[LineId | FundId, string, Way, string]> = [
    ...LINES.flatMap(([id, name]) => {
      const s = rows.find((x) => x.id === id)
      return s
        ? [
            [id, name, s.way, id === 'rsi' ? s.pct.toFixed(0) : pct(s.pct)] as [
              LineId,
              string,
              Way,
              string,
            ],
          ]
        : []
    }),
    ...FUND.flatMap((id) => {
      const val = fundChip(id)
      const way = ways[id]
      return val === null || way === undefined
        ? []
        : [[id, id, way, val] as [FundId, string, Way, string]]
    }),
  ]
  const lineWays = LINES.flatMap(
    ([id]) => rows.find((x) => x.id === id)?.way ?? [],
  )
  return (
    <div
      data-testid="verdict"
      data-call={v.call}
      data-feed={v.feed}
      className={`motion-arrive relative overflow-hidden rounded-[16px] p-4 ring-1 ring-inset ${look.panel}`}
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
          {avg !== null && price > 0 ? (
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
        {chips.map(([id, name, way, val], i) => {
          const key = v.why.includes(id)
          return (
            <span
              key={id}
              data-testid="verdict-why"
              data-id={id}
              data-key={key}
              style={{ animationDelay: `${350 + i * 90}ms` }}
              className={`motion-arrive inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] text-ink-200 uppercase ring-inset ${key ? KEY[v.call] : 'bg-lift/5 ring-1 ring-lift/10'}`}
            >
              {name}
              <b
                className={`font-medium tracking-[0.02em] tabular-nums ${WAY_TEXT[way]}`}
              >
                {ARROW[way]} {val}
              </b>
            </span>
          )
        })}
      </div>
      <div className="mt-3.5 flex flex-wrap items-center gap-1.5 border-t border-dashed border-lift/10 pt-3">
        <Feed
          id="technical"
          icon={<ChartLine className="size-3.5" />}
          ways={lineWays}
          i={0}
          onClick={() => onTab('signals')}
        />
        {!share ? (
          <span
            data-testid="feed"
            data-id="fundamentals"
            style={{ animationDelay: '790ms' }}
            className={`${CHIP} bg-[repeating-linear-gradient(135deg,color-mix(in_oklch,var(--color-lift)_4%,transparent)_0_6px,transparent_6px_12px)] text-ink-500 ring-1 ring-lift/12 ring-inset`}
          >
            <BookOpen className="size-3.5" />
            fundamentals <b className="font-normal">· none for a fund</b>
          </span>
        ) : r ? (
          <Feed
            id="fundamentals"
            icon={<BookOpen className="size-3.5" />}
            ways={FUND.flatMap((id) => ways[id] ?? [])}
            held={held}
            old={v.feed === 'old'}
            updating={updating}
            tail={`· yahoo · ${SHORT.format(new Date(r.asOf))}`}
            i={1}
            onClick={() => onTab('fund')}
          />
        ) : (
          <span
            data-testid="feed"
            data-id="fundamentals"
            data-updating={updating}
            style={{ animationDelay: '790ms' }}
            className={`${CHIP} text-ink-500 ring-1 ring-lift/14 ring-inset`}
          >
            <BookOpen className="size-3.5" />
            fundamentals
            {updating || fund === undefined ? (
              <Breath />
            ) : (
              <b className="font-normal">· not loaded</b>
            )}
          </span>
        )}
        <NewsFeed news={news} onClick={() => onTab('news')} />
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
          {RULE.map(([call, words, fx]) => {
            const on = call === v.call && fx === held
            return (
              <div
                key={words}
                data-testid="rule-row"
                data-on={on}
                data-kind={fx ? 'fundamentals' : 'lines'}
                className={`grid grid-cols-[72px_minmax(0,1fr)] gap-2 border-t border-lift/7 px-2 py-1.5 ${on ? 'rounded-[8px] bg-lift/5 text-foreground' : ''}`}
              >
                <span
                  className={`self-start justify-self-start rounded-full px-2 text-[10px] font-medium tracking-[0.12em] uppercase ${LOOK[call].text} ring-0`}
                >
                  {call}
                </span>
                <span>
                  {words}
                  {fx ? (
                    <i className="ml-2 rounded-full bg-lav-400/16 px-1.5 text-[9.5px] tracking-[0.1em] text-lav-300 uppercase not-italic">
                      fundamentals
                    </i>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function Breath() {
  return (
    <i className="inline-block size-[7px] animate-pulse rounded-full bg-lav-400 shadow-[0_0_8px_var(--color-lav-400)]" />
  )
}

/* A feed: its colour from its rows' ▲ and ▼, the counts inside it. A
   group that held an ADD back is never green; an old reading is warn. */
function Feed({
  id,
  icon,
  ways,
  held = false,
  old = false,
  updating = false,
  tail,
  i,
  onClick,
}: {
  id: string
  icon: ReactNode
  ways: ReadonlyArray<Way>
  held?: boolean
  old?: boolean
  updating?: boolean
  tail?: string
  i: number
  onClick: () => void
}) {
  const n = (w: Way) => ways.filter((x) => x === w).length
  const up = n('up')
  const dn = n('down')
  const tone: keyof typeof TONE = old
    ? 'warn'
    : up > dn && !held
      ? 'good'
      : dn > up
        ? 'danger'
        : 'warn'
  return (
    <button
      type="button"
      data-testid="feed"
      data-id={id}
      data-tone={tone}
      data-updating={updating}
      onClick={onClick}
      style={{
        ['--t' as string]: TONE[tone],
        animationDelay: `${700 + i * 90}ms`,
      }}
      className={`${CHIP} bg-[color-mix(in_oklch,var(--t)_13%,transparent)] text-foreground ring-1 ring-[color-mix(in_oklch,var(--t)_50%,transparent)] ring-inset [&>svg]:text-[var(--t)]`}
    >
      {icon}
      {id}
      <span className="inline-flex gap-1.5 font-medium tracking-[0.04em]">
        {(['up', 'down', 'flat'] as const).map((w) => (
          <span
            key={w}
            className={`${WAY_TEXT[w]} ${n(w) ? '' : 'opacity-45'}`}
          >
            {n(w)} {ARROW[w]}
          </span>
        ))}
      </span>
      {tail ? (
        <span
          className={`hidden tracking-[0.08em] sm:inline ${old ? 'text-state-warn' : 'text-ink-500'}`}
        >
          {tail}
        </span>
      ) : null}
      {updating ? <Breath /> : null}
    </button>
  )
}

function NewsFeed({ news, onClick }: { news: News; onClick: () => void }) {
  const base = `${CHIP} ring-1 ring-inset`
  const style = { animationDelay: '880ms' }
  if (news.state === 'failed')
    return (
      <button
        type="button"
        data-testid="feed"
        data-id="news"
        onClick={onClick}
        style={style}
        className={`${base} text-state-warn ring-state-warn/40`}
      >
        <Newspaper className="size-3.5" />
        news <b className="font-normal">· not loaded</b>
      </button>
    )
  return (
    <button
      type="button"
      data-testid="feed"
      data-id="news"
      onClick={onClick}
      style={style}
      className={`${base} text-ink-300 ring-lift/18`}
    >
      <Newspaper className="size-3.5" />
      news
      {news.state === 'loading' ? (
        <Breath />
      ) : (
        <b className="font-normal tracking-[0.08em] text-ink-500">
          · {news.items.length} · not in the rule
        </b>
      )}
    </button>
  )
}
