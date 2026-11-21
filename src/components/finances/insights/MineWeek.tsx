import { useEffect, useMemo, useState } from 'react'
import { useAction } from 'convex/react'
import { Briefcase } from 'lucide-react'

import { Info, changeWord, clock, dayWord } from './parts'
import { YourCompanies } from './YourCompanies'
import type { useCompanies, useFunds } from './YourCompanies'
import { api } from '../../../../convex/_generated/api'
import type { HeldWeekAnswer } from '../../../../convex/marketSources/coming'
import { TickerLogo } from '@/components/finances/Logo'
import { usdShort } from '@/lib/companies'
import { moveWord, quarter } from '@/lib/bigFunds'
import { tickerBase } from '@/lib/market'
import { closeWord } from '@/lib/movers'
import { weekCards } from '@/lib/mineWeek'
import type { Reason, WeekCard, WeekClose } from '@/lib/mineWeek'

/* MINE · THIS WEEK on MARKET (31 Oct, part 5 of market-world.html): a
   card per held company that moved 5% or more this week or had news —
   results, a manager's trade, a big fund. WAS € and NOW € with both
   closes under them. The whole YOUR COMPANIES table behind ALL ▸, shut on
   open. Fetched on open, never stored. */

const KEEP_MS = 10 * 60_000
let kept: { at: number; key: string; answer: HeldWeekAnswer } | null = null

export type HeldEquity = {
  symbol: string
  name: string
  valueEur: number | null
}

function useHeldWeek(symbols: ReadonlyArray<string> | null) {
  const ask = useAction(api.marketSources.coming.heldWeek)
  const key = symbols?.join(',') ?? ''
  const fresh =
    kept && kept.key === key && Date.now() - kept.at < KEEP_MS
      ? kept.answer
      : null
  const [answer, setAnswer] = useState<HeldWeekAnswer | null>(fresh)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (symbols === null || answer) return
    let live = true
    ask({ symbols: [...symbols] })
      .then((a) => {
        kept = { at: Date.now(), key, answer: a }
        if (live) setAnswer(a)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
    /* asked once per set of companies: `key` stands for `symbols` */
  }, [ask, key])
  return { answer, failed }
}

const eur = (n: number | null) =>
  n === null ? '—' : `€${Math.round(n).toLocaleString('en-US')}`

function badgeOf(r: Reason) {
  if (r.kind === 'results') return `EARNINGS ${dayWord(r.day)}`
  if (r.kind === 'insider') return 'INSIDER'
  return 'BIG FUND'
}

function lineOf(r: Reason) {
  if (r.kind === 'results')
    return `$${r.actual.toFixed(2)} a share${r.expected !== null ? ` · $${r.expected.toFixed(2)} expected` : ''}`
  if (r.kind === 'insider')
    return `${r.who} · ${r.side === 'SELL' ? 'sold' : 'bought'} ${usdShort(r.usd)} · ${dayWord(r.day)}`
  return `${r.move.fund} ${moveWord(r.move)} · ${quarter(r.move.nowPeriod)} 13F`
}

function Card({ c }: { c: WeekCard }) {
  const ch = c.close?.change ?? null
  const tone = ch === null || ch === 0 ? '' : ch < 0 ? 'bad' : 'good'
  return (
    <div
      className={`ins-mc ${tone}`}
      data-testid="mine-week-card"
      data-symbol={c.symbol}
    >
      <div className="h">
        <TickerLogo symbol={c.symbol} name={c.name} size={28} />
        <b>{c.name}</b>
        {c.reasons.length ? (
          c.reasons.map((r) => (
            <span
              key={r.kind}
              className={`ins-badge ${tone || 'lav'}`}
              data-testid="mine-week-reason"
            >
              {badgeOf(r)}
            </span>
          ))
        ) : (
          <span
            className={`ins-badge ${tone || 'dim'}`}
            data-testid="mine-week-reason"
          >
            5% OR MORE
          </span>
        )}
        {ch !== null ? (
          <span
            className="pc"
            style={{
              color:
                ch > 0
                  ? 'var(--state-good)'
                  : ch < 0
                    ? 'var(--state-danger)'
                    : undefined,
            }}
          >
            {changeWord(ch)}
          </span>
        ) : null}
      </div>
      {c.reasons.map((r) => (
        <div key={r.kind} className="l">
          {lineOf(r)}
        </div>
      ))}
      <div className="n2">
        <span>
          WAS <b>{eur(c.wasEur)}</b>
        </span>
        <span>
          NOW <b>{eur(c.nowEur)}</b>
        </span>
        {c.close ? (
          <span>
            CLOSE {dayWord(c.close.baseAt)}{' '}
            <b>
              {closeWord(c.close.base, c.close.currency)} →{' '}
              {closeWord(c.close.price, c.close.currency)}
            </b>
          </span>
        ) : null}
      </div>
    </div>
  )
}

export function MineWeek({
  held,
  c,
  f,
}: {
  held: ReadonlyArray<HeldEquity> | null
  c: ReturnType<typeof useCompanies>
  f: ReturnType<typeof useFunds>
}) {
  const [all, setAll] = useState(false)
  const symbols = useMemo(() => held?.map((h) => h.symbol) ?? null, [held])
  const week = useHeldWeek(symbols)
  if (held === null || held.length === 0) return null
  const closes = new Map<string, WeekClose>(
    (week.answer?.closes ?? []).map((x) => [tickerBase(x.symbol), x]),
  )
  const ready = (week.answer || week.failed) && (c.answer || c.failed)
  const cards = ready
    ? weekCards(
        held.map((h) => ({ ...h, symbol: tickerBase(h.symbol) })),
        closes,
        c.answer?.reached ? c.answer.rows : [],
        f.answer?.reached ? f.answer.moves : [],
        Date.now(),
      )
    : []
  return (
    <>
      <section
        data-tile="mine-week"
        className="ins-tile"
        style={
          { '--i': 4, '--a': 'var(--color-lav-400)' } as React.CSSProperties
        }
      >
        <div className="ins-thead">
          <span className="ins-ico">
            <Briefcase size={15} aria-hidden />
          </span>
          <span className="ins-tname">MINE · THIS WEEK</span>
          <span className="ins-was">5% OR MORE · OR NEWS</span>
          <Info
            info={{
              title: 'MINE · THIS WEEK',
              what: 'The companies held whose price moved 5% or more since the close a week ago, or that reported results, had a manager buy or sell shares in the last seven days, or where a big fund changed its shares by 5% or more in its last 13F. WAS is the same shares at the close a week ago, NOW their value today.',
              why: 'These are the moves that changed what the portfolio is worth this week, each with the reason the news gives for it.',
              now: [
                'YAHOO FINANCE CLOSES · FETCHED ON OPEN · NOT SAVED',
                'FINNHUB · SEC EDGAR 13F · FETCHED ON OPEN · NOT SAVED',
              ],
            }}
          />
        </div>
        {!ready ? (
          <span
            className="ins-badge dim ins-reading"
            data-testid="mine-week-none"
          >
            READING
          </span>
        ) : week.failed || week.answer?.reached === false ? (
          <span className="ins-badge bad" data-testid="mine-week-none">
            ✕ NOT REACHED
          </span>
        ) : cards.length === 0 ? (
          <span className="ins-badge dim" data-testid="mine-week-quiet">
            NONE · 5% OR MORE · 7 DAYS
          </span>
        ) : (
          <div className="ins-mw" data-testid="mine-week">
            {cards.map((x) => (
              <Card key={x.symbol} c={x} />
            ))}
          </div>
        )}
        <button
          type="button"
          className="ins-more"
          data-testid="all-companies"
          aria-expanded={all}
          onClick={() => setAll((a) => !a)}
        >
          ALL {held.length} COMPANIES · RESULTS · ANALYSTS · INSIDERS · BIG
          FUNDS {all ? '▾' : '▸'}
        </button>
        <div className="ins-foot">
          <span className="ins-was" data-testid="mine-week-foot">
            YAHOO FINANCE
            {week.answer?.reached
              ? ` · FETCHED ${clock(week.answer.fetchedAt)}`
              : ''}{' '}
            · FINNHUB · SEC EDGAR · NOT SAVED
          </span>
        </div>
      </section>
      {all ? <YourCompanies c={c} f={f} /> : null}
    </>
  )
}
