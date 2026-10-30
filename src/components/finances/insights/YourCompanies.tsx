import { useAction } from 'convex/react'
import { Building2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import { Info, clock, dayWord, monthWord } from './parts'
import type { FunctionReturnType } from 'convex/server'
import type { Analysts, Insider, Results } from '@/lib/companies'
import { hasNews, usdShort } from '@/lib/companies'
import type { FundMove } from '@/lib/bigFunds'
import {
  NEWS_MOVE,
  moveOf,
  moveWord,
  quarter,
  sharesShort,
} from '@/lib/bigFunds'
import { TickerLogo } from '@/components/finances/Logo'

/* YOUR COMPANIES (30 Oct, market-story.html): a row per held company with
   results or an insider trade in the window — RESULTS (actual and
   expected, or the next day), ANALYSTS (buy and hold this month, last
   month under it), INSIDERS (the biggest open-market buy or sale), BIG
   FUNDS (the fund of five whose 13F shares moved the most, both quarters'
   counts under it). Every value with its day or quarter; "—" where
   nothing. Fetched on open, never stored. */

type Answer = FunctionReturnType<typeof api.marketSources.companies.companies>
type Funds = FunctionReturnType<typeof api.marketSources.funds.funds>
export type HeldCompany = {
  symbol: string
  name: string
  valueEur: number | null
}
const KEEP_MS = 10 * 60_000
let kept: { at: number; key: string; answer: Answer } | null = null
let keptFunds: { at: number; key: string; answer: Funds } | null = null

const eur = (n: number | null) =>
  n === null ? '' : `€${Math.round(n).toLocaleString('en-US')}`
const eps = (n: number) => `$${n.toFixed(2)}`
const counts = (c: Analysts['now']) =>
  `Buy ${c.buy} · Hold ${c.hold}${c.sell ? ` · Sell ${c.sell}` : ''}`

function ResultsCell({ r }: { r: Results | null }) {
  if (!r) return <Dash />
  if (r.actual === null)
    return (
      <Cell
        k={dayWord(r.day)}
        w={
          r.expected !== null
            ? `next results · ${eps(r.expected)} expected`
            : 'next results'
        }
      />
    )
  const tone =
    r.expected === null
      ? ''
      : r.actual >= r.expected
        ? 'text-state-good'
        : 'text-state-danger'
  return (
    <Cell
      k={`${eps(r.actual)} a share`}
      w={`${r.expected !== null ? `${eps(r.expected)} expected · ` : ''}${dayWord(r.day)}`}
      tone={tone}
    />
  )
}

/** Buy green, hold in ink, sell red: what each count is, not how many. */
function Counts({ c }: { c: Analysts['now'] }) {
  return (
    <span className="k">
      <span className="text-state-good">Buy {c.buy}</span> ·{' '}
      <span>Hold {c.hold}</span>
      {c.sell ? (
        <>
          {' '}
          · <span className="text-state-danger">Sell {c.sell}</span>
        </>
      ) : null}
    </span>
  )
}

function AnalystsCell({ a }: { a: Analysts | null }) {
  if (!a) return <Dash />
  return (
    <div>
      <Counts c={a.now} />
      <span className="w">
        {a.was
          ? `${monthWord(a.was.month)}: ${counts(a.was)}`
          : monthWord(a.now.month)}
      </span>
    </div>
  )
}

function InsiderCell({ i }: { i: Insider | null }) {
  if (!i) return <Dash />
  return (
    <Cell
      k={`${i.side === 'SELL' ? 'Sold' : 'Bought'} ${usdShort(i.usd)}`}
      w={`${i.who} · ${dayWord(i.day)}`}
    />
  )
}

function FundCell({ m }: { m: FundMove | undefined }) {
  if (!m) return <Dash />
  return (
    <Cell
      k={`${m.fund} ${moveWord(m)}`}
      w={`${quarter(m.wasPeriod)} ${sharesShort(m.was)} · ${quarter(m.nowPeriod)} ${sharesShort(m.now)} · 13F`}
    />
  )
}

const Cell = ({ k, w, tone = '' }: { k: string; w: string; tone?: string }) => (
  <div>
    <span className={`k ${tone}`}>{k}</span>
    <span className="w">{w}</span>
  </div>
)
const Dash = () => (
  <div>
    <span className="dash">—</span>
  </div>
)

/** The held companies' answer, asked once per set and kept ten minutes:
    shared by YOUR COMPANIES and THE WEEK's results (30 Oct). */
export function useCompanies(held: Array<HeldCompany> | null) {
  const ask = useAction(api.marketSources.companies.companies)
  const key = held?.map((h) => h.symbol).join(',') ?? ''
  const fresh =
    kept && kept.key === key && Date.now() - kept.at < KEEP_MS
      ? kept.answer
      : null
  const [answer, setAnswer] = useState<Answer | null>(fresh)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (held === null || answer) return
    let live = true
    ask({ held })
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
    /* asked once per set of companies: `key` stands for `held` */
  }, [ask, key])
  return { answer, failed }
}

/** BIG FUNDS' answer for the same companies, asked once per set and kept
    ten minutes, apart from Finnhub's so one source down leaves the other. */
export function useFunds(held: Array<HeldCompany> | null) {
  const ask = useAction(api.marketSources.funds.funds)
  const key = held?.map((h) => h.symbol).join(',') ?? ''
  const fresh =
    keptFunds && keptFunds.key === key && Date.now() - keptFunds.at < KEEP_MS
      ? keptFunds.answer
      : null
  const [answer, setAnswer] = useState<Funds | null>(fresh)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (held === null || answer) return
    let live = true
    ask({ held: held.map(({ symbol, name }) => ({ symbol, name })) })
      .then((a) => {
        keptFunds = { at: Date.now(), key, answer: a }
        if (live) setAnswer(a)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
    /* asked once per set of companies: `key` stands for `held` */
  }, [ask, key])
  return { answer, failed }
}

export function YourCompanies({
  c: { answer, failed },
  f,
}: {
  c: ReturnType<typeof useCompanies>
  f: ReturnType<typeof useFunds>
}) {
  const reached = answer?.reached === true && !failed
  const fundsIn = f.answer?.reached === true && !f.failed
  const moves = new Map(
    (fundsIn ? (f.answer?.moves ?? []) : []).map((m) => [m.symbol, m]),
  )
  /* A row: results, an insider trade, or a fund's shares moved 5% or more. */
  const rows =
    answer?.rows.filter((r) => {
      const m = moves.get(r.symbol)
      return hasNews(r) || (m !== undefined && Math.abs(moveOf(m)) >= NEWS_MOVE)
    }) ?? []
  return (
    <section
      data-tile="companies"
      className="ins-tile"
      style={{ '--i': 2, '--a': 'var(--color-lav-400)' } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span className="ins-ico">
          <Building2 size={15} aria-hidden />
        </span>
        <span className="ins-tname">YOUR COMPANIES</span>
        <Info
          info={{
            title: 'YOUR COMPANIES',
            what: 'Companies held that reported results, have results coming in two weeks, had a manager buy or sell shares on the market in the last two weeks, or where one of five big funds (Berkshire, Bridgewater, Norges Bank, Pershing Square, Duquesne) changed its shares by 5% or more in its last quarterly 13F filing.',
            why: 'Results move a price the most. Analysts turning from buy to hold, or a manager selling a lot, is worth a look before adding more. A big fund buying or selling shows what careful money did, three to four months late.',
            now: [
              'FINNHUB · FETCHED ON OPEN · NOT SAVED',
              'SEC EDGAR 13F · FETCHED ON OPEN · NOT SAVED',
            ],
          }}
        />
      </div>
      {!reached ? (
        <span
          className={`ins-badge ${answer || failed ? 'bad' : 'dim ins-reading'}`}
          data-testid="companies-none"
        >
          {answer || failed ? '✕ NOT REACHED' : 'READING'}
        </span>
      ) : rows.length === 0 ? (
        <span className="ins-badge dim" data-testid="companies-quiet">
          NO RESULTS OR INSIDER TRADES · 2 WEEKS
        </span>
      ) : (
        <div className="ins-cg">
          <div className="hd">COMPANY</div>
          <div className="hd">RESULTS</div>
          <div className="hd">ANALYSTS</div>
          <div className="hd">INSIDERS</div>
          <div className="hd">
            BIG FUNDS
            {f.answer || f.failed ? (
              fundsIn ? null : (
                <span className="text-state-danger" data-testid="funds-none">
                  {' '}
                  ✕
                </span>
              )
            ) : null}
          </div>
          {rows.map((r) => (
            <div key={r.symbol} className="contents" data-testid="company-row">
              <div className="co1">
                <TickerLogo symbol={r.symbol} size={24} />
                <span className="min-w-0">
                  <b>{r.name}</b> <span className="e">{eur(r.valueEur)}</span>
                </span>
              </div>
              <ResultsCell r={r.results} />
              <AnalystsCell a={r.analysts} />
              <InsiderCell i={r.insider} />
              <FundCell m={moves.get(r.symbol)} />
            </div>
          ))}
        </div>
      )}
      <div className="ins-foot one">
        <span className="ins-was">
          FINNHUB{answer ? ` · ${clock(answer.fetchedAt)}` : ''} · SEC EDGAR
          {f.answer
            ? fundsIn
              ? ` · ${clock(f.answer.fetchedAt)}`
              : ' · NOT REACHED'
            : f.failed
              ? ' · NOT REACHED'
              : ''}{' '}
          · NOT SAVED
        </span>
      </div>
    </section>
  )
}
