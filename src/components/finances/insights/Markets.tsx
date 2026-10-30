import { TrendingUp } from 'lucide-react'

import {
  Info,
  Line,
  MarkLogo,
  PeriodSwitch,
  changeWord,
  clock,
  dayWord,
} from './parts'
import type { Answer } from './useMarket'
import { MARKETS } from '@/lib/insightsMarket'
import type { Period } from '@/lib/insightsMarket'

/* THE TREND (30 Oct, design/treasury-mockup/market-story.html): the eight
   markets as rows over 1D · 1W · 1M · 3M · 1Y, 3M first — the longer view his "not
   like today only but in general" asked for. Each row: the mark, the name,
   the close the period starts from and the price now (two fetched
   prices), the line, the change. A yield moves in points and in ink: a
   rate, not a gain. HELD on a market he holds through a fund. */

type Unit = (typeof MARKETS)[number]['unit']

export function priceWord(n: number, unit: Unit) {
  const whole = (x: number) =>
    x.toLocaleString('en-US', { maximumFractionDigits: 0 })
  const two = (x: number) =>
    x.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  switch (unit) {
    case 'points':
      return whole(n)
    case 'EUR':
      return `€${n >= 10_000 ? whole(n) : two(n)}`
    case 'USD':
      return `$${whole(n)}`
    case 'rate':
      return n.toFixed(3)
    case 'yield':
      return `${n.toFixed(2)}%`
  }
}

/** The foot's base: the S&P 500's base close, or the previous close on 1D. */
export function sinceWord(answer: Answer | null) {
  if (!answer) return ''
  if (answer.period === '1D') return 'VS PREVIOUS CLOSE'
  const at = answer.markets.find((m) => m.id === 'sp500')?.move?.baseAt
  return at ? `VS ${dayWord(at, answer.fetchedAt)} CLOSE` : ''
}

export const MARKETS_INFO = {
  title: 'THE TREND',
  what: 'Each card is a basket or a price: the S&P 500 is the 500 biggest US companies, MSCI World about 1,400 companies in rich countries, STOXX 600 the 600 biggest in Europe.',
  why: 'VUAA follows the S&P 500 and IWDA follows MSCI World. Gold and bitcoin are prices; EUR / USD is how many dollars a euro buys; US 10Y is what the US government pays to borrow for ten years.',
  now: ['FETCHED ON OPEN · NEVER SAVED'],
}

/** The markets a held fund follows (VUAA the S&P 500, the Nasdaq fund, gold). */
const HELD_BY: Partial<Record<(typeof MARKETS)[number]['id'], RegExp>> = {
  sp500: /^(VUAA|CSPX|VUSA|SXR8|SPY|VOO)$/,
  ndx: /^(EQQQ|CNDX|QQQ|SXRV)$/,
  world: /^(IWDA|SWDA|VWCE|VWRL)$/,
  gold: /^(IGLN|SGLN|PHAU|4GLD|GLD)$/,
}

export function Markets({
  period,
  onPeriod,
  shown,
  reading,
  failed,
  held,
}: {
  period: Period
  onPeriod: (p: Period) => void
  shown: Answer | null
  reading: boolean
  failed: boolean
  held: ReadonlySet<string>
}) {
  const mine = (id: (typeof MARKETS)[number]['id']) => {
    const re = HELD_BY[id]
    return re ? [...held].some((t) => re.test(t)) : false
  }
  return (
    <section
      data-tile="markets"
      className="ins-tile ins-trend"
      style={{ '--i': 1, '--a': 'var(--color-lav-400)' } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span className="ins-ico">
          <TrendingUp size={15} aria-hidden />
        </span>
        <span className="ins-tname">THE TREND</span>
        <Info info={MARKETS_INFO} />
        <span className="flex-1" />
        <PeriodSwitch period={period} onPeriod={onPeriod} />
      </div>
      <span className="ins-was" data-testid="markets-since">
        {reading ? `READING ${period}…` : sinceWord(shown)}
      </span>
      <div className={`ins-tr-list ${reading && shown ? 'ins-reading' : ''}`}>
        {MARKETS.map((m) => {
          const move = shown?.markets.find((x) => x.id === m.id)?.move ?? null
          const yieldPts = m.unit === 'yield'
          const tone =
            move === null || yieldPts
              ? 'var(--color-ink-400)'
              : move.change >= 0
                ? 'var(--state-good)'
                : 'var(--state-danger)'
          return (
            <div
              key={m.id}
              data-testid="market-card"
              data-id={m.id}
              className="ins-tr"
              style={{ '--c': tone } as React.CSSProperties}
            >
              <MarkLogo mark={m.mark} size={28} />
              <span className="min-w-0">
                <span className="nm">
                  {m.name}
                  {mine(m.id) ? <i className="held">HELD</i> : null}
                </span>
                <span className="ins-was block">
                  {move !== null
                    ? `${priceWord(move.base, m.unit)} → ${priceWord(move.price, m.unit)}`
                    : reading && !shown
                      ? 'READING'
                      : 'NOT REACHED'}
                </span>
              </span>
              <Line
                key={`${m.id}-${shown?.period}`}
                points={move?.points ?? []}
                h={24}
              />
              <span className="ch" style={{ color: tone }}>
                {move !== null ? changeWord(move.change, yieldPts) : '—'}
              </span>
            </div>
          )
        })}
      </div>
      <div className="ins-foot" data-testid="markets-foot">
        <span className="ins-was">
          {failed
            ? 'YAHOO FINANCE · NOT REACHED'
            : shown
              ? `${shown.priceSource.toUpperCase()} · FETCHED ${clock(shown.fetchedAt)} · NOT SAVED`
              : 'YAHOO FINANCE · NOT SAVED'}
        </span>
      </div>
    </section>
  )
}
