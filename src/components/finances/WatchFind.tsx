import { useEffect, useState } from 'react'
import { useAction } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { OppRow } from '../../../convex/marketSources/opportunities'
import { TickerLogo } from '@/components/finances/Logo'
import { WatchStar } from '@/components/finances/WatchStar'
import { BADGE } from '@/components/finances/WatchRow'
import { useOpportunities } from '@/components/finances/insights/useOpportunities'
import { useStar } from '@/components/finances/useWatch'
import { money } from '@/lib/currency'
import { kindOf } from '@/lib/logo'
import { tickerBase } from '@/lib/market'
import { closeWord } from '@/lib/movers'

/* FIND on the watchlist (1 Nov, "go" on the mockup watch-find.html; his
   "how to find tickers worth to track"): three ready lists under the
   ticker field — IN YOUR ETFS (the biggest companies inside the funds
   he holds), DOWN FROM HIGH and CHEAP · TARGET ABOVE (OPPORTUNITIES'
   rules). What he holds is left out. Fetched on open, never stored. */

type Tab = 'etfs' | 'down' | 'cheap'
type Held = { symbol: string; type: string; name: string }
type Etfs = FunctionReturnType<typeof api.watchFind.etfs>

const KEEP_MS = 10 * 60_000
let kept: { key: string; at: number; answer: Etfs } | null = null
const ROWS = 12

const GRID =
  "grid grid-cols-[30px_minmax(0,1fr)_auto_30px] [grid-template-areas:'l_w_p_s'_'y_y_y_y'] gap-x-2.5 gap-y-1.5 sm:grid-cols-[30px_minmax(0,1fr)_200px_150px_84px_30px] sm:[grid-template-areas:none]"
const AREA = (a: string) => `[grid-area:${a}] sm:[grid-area:auto]`
const clock = (t: number) =>
  new Date(t).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

function useEtfs(funds: ReadonlyArray<string>, held: ReadonlyArray<string>) {
  const ask = useAction(api.watchFind.etfs)
  const key = funds.join(',')
  const fresh = kept && kept.key === key && Date.now() - kept.at < KEEP_MS
  const [answer, setAnswer] = useState<Etfs | 'failed' | null>(
    fresh && kept ? kept.answer : null,
  )
  useEffect(() => {
    if (answer !== null || funds.length === 0) return
    let live = true
    ask({ funds: [...funds], held: [...held] })
      .then((a) => {
        kept = { key, at: Date.now(), answer: a }
        if (live) setAnswer(a)
      })
      .catch(() => {
        if (live) setAnswer('failed')
      })
    return () => {
      live = false
    }
  }, [key, ask])
  return answer
}

export function WatchFind({ held }: { held: ReadonlyArray<Held> }) {
  const [tab, setTab] = useState<Tab>('etfs')
  const star = useStar()
  const mine = new Set(held.map((h) => tickerBase(h.symbol)))
  /* One fund held on two listings is one fund. */
  const funds = [
    ...new Map(
      held
        .filter((h) => kindOf(h) === 'etf')
        .map((h) => [tickerBase(h.symbol), h.symbol] as const),
    ).values(),
  ]
  const etfs = useEtfs(funds, [...mine])
  const { stocks } = useOpportunities()

  /* IN YOUR ETFS: one row a company, each fund it is in beside it. */
  const inFunds = new Map<
    string,
    { symbol: string; name: string; at: Array<{ fund: string; pct: number }> }
  >()
  if (etfs !== null && etfs !== 'failed')
    for (const f of etfs.funds)
      for (const t of f.top) {
        if (mine.has(tickerBase(t.symbol))) continue
        const row = inFunds.get(t.symbol) ?? {
          symbol: t.symbol,
          name: t.name,
          at: [],
        }
        if (row.at.some((a) => a.fund === tickerBase(f.symbol))) continue
        row.at.push({ fund: tickerBase(f.symbol), pct: t.pct * 100 })
        inFunds.set(t.symbol, row)
      }
  const etfRows = [...inFunds.values()]
    .sort(
      (a, b) =>
        Math.max(...b.at.map((x) => x.pct)) -
        Math.max(...a.at.map((x) => x.pct)),
    )
    .slice(0, ROWS)
  const quoteOf = (s: string) =>
    etfs !== null && etfs !== 'failed'
      ? etfs.quotes.find((q) => q.symbol === s)
      : undefined

  /* The two OPPORTUNITIES lists, every region, held left out. */
  const answers = [...stocks.values()].flatMap((a) =>
    a !== 'failed' && a.reached ? [a] : [],
  )
  const opps = (pick: (a: (typeof answers)[number]) => Array<OppRow>) => {
    const seen = new Set<string>()
    return answers.flatMap(pick).filter((o) => {
      const k = tickerBase(o.symbol)
      if (mine.has(k) || seen.has(k)) return false
      seen.add(k)
      return true
    })
  }
  const down = opps((a) => a.down)
    .sort((a, b) => a.fromHigh - b.fromHigh)
    .slice(0, ROWS)
  const cheap = opps((a) => a.cheap)
    .sort((a, b) => (b.toTarget ?? 0) - (a.toTarget ?? 0))
    .slice(0, ROWS)
  const oppsReading = stocks.size === 0
  const oppsAt = Math.max(0, ...answers.map((a) => a.fetchedAt))

  const tabs: Array<[Tab, string, number | null]> = [
    [
      'etfs',
      'in your etfs',
      funds.length === 0 ? 0 : etfs === null ? null : etfRows.length,
    ],
    ['down', 'down from high', oppsReading ? null : down.length],
    ['cheap', 'cheap · target above', oppsReading ? null : cheap.length],
  ]

  const row = (
    key: string,
    thing: { symbol: string; name: string; domain?: string },
    why: React.ReactNode,
    why2: React.ReactNode,
    last: React.ReactNode,
    i: number,
  ) => (
    <div
      key={key}
      data-testid="find-row"
      data-symbol={thing.symbol}
      style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
      className={`motion-arrive items-center border-b border-lift/[0.06] px-1 py-2.5 last:border-b-0 ${GRID}`}
    >
      <span className={AREA('l')}>
        <TickerLogo
          symbol={thing.symbol}
          type="EQUITY"
          name={thing.name}
          domain={thing.domain}
          size={30}
        />
      </span>
      <span className={`flex min-w-0 flex-col ${AREA('w')}`}>
        <span className="font-mono text-[12px] font-bold text-foreground">
          {thing.symbol}
        </span>
        <span className="truncate text-[11.5px] text-ink-400">
          {thing.name}
        </span>
      </span>
      <span
        className={`flex min-w-0 flex-col gap-0.5 font-mono max-sm:flex-row max-sm:flex-wrap max-sm:gap-x-3 ${AREA('y')}`}
      >
        {why}
      </span>
      <span className="hidden min-w-0 flex-col gap-0.5 font-mono sm:flex">
        {why2}
      </span>
      <span
        className={`text-right font-mono text-[12.5px] font-semibold tabular-nums ${AREA('p')}`}
      >
        {last}
      </span>
      <span className={`justify-self-end ${AREA('s')}`}>
        <WatchStar thing={thing} star={star} />
      </span>
    </div>
  )
  const k = (s: React.ReactNode, tone = 'text-foreground') => (
    <span className={`text-[11.5px] font-bold tabular-nums ${tone}`}>{s}</span>
  )
  const sm = (s: React.ReactNode) => (
    <span className="truncate text-[9.5px] tracking-[0.03em] text-ink-400 uppercase">
      {s}
    </span>
  )

  const body = () => {
    if (tab === 'etfs') {
      if (funds.length === 0)
        return (
          <span className={`${BADGE} self-center text-ink-400 ring-lift/20`}>
            0 etfs held
          </span>
        )
      if (etfs === null) return <Reading />
      if (etfs === 'failed')
        return (
          <span
            className={`${BADGE} self-center text-state-danger ring-state-danger/35`}
          >
            ✕ not reached
          </span>
        )
      if (etfRows.length === 0)
        return (
          <span className={`${BADGE} self-center text-ink-400 ring-lift/20`}>
            none
          </span>
        )
      return etfRows.map((r, i) => {
        const q = quoteOf(r.symbol)
        const move =
          q && q.before ? ((q.price - q.before) / q.before) * 100 : null
        return row(
          r.symbol,
          r,
          r.at.map((a) => (
            <span key={a.fund}>
              {k(`${a.pct.toFixed(1)}%`)} {sm(`of ${a.fund}`)}
            </span>
          )),
          <>
            <span>
              {k(r.at.length)} {sm(`of ${funds.length} funds`)}
            </span>
            <span className="relative h-1 overflow-hidden rounded-full bg-lift/[0.08]">
              <i
                className="absolute inset-y-0 left-0 rounded-full bg-lav-400"
                style={{ width: `${(r.at.length / funds.length) * 100}%` }}
              />
            </span>
          </>,
          q ? (
            <>
              {money(q.price, q.currency)}
              {move === null ? null : (
                <span
                  className={`block text-[10px] font-normal ${move < 0 ? 'text-state-danger' : 'text-state-good'}`}
                >
                  {move < 0 ? '▼' : '▲'} {Math.abs(move).toFixed(1)}%
                </span>
              )}
            </>
          ) : (
            '—'
          ),
          i,
        )
      })
    }
    if (oppsReading) return <Reading />
    const list = tab === 'down' ? down : cheap
    if (list.length === 0)
      return (
        <span className={`${BADGE} self-center text-ink-400 ring-lift/20`}>
          none
        </span>
      )
    return list.map((o, i) =>
      tab === 'down'
        ? row(
            o.symbol,
            o,
            <>
              {k(`${o.fromHigh.toFixed(0)}%`, 'text-state-danger')}
              {sm(
                `high ${closeWord(o.high, o.currency)} → ${closeWord(o.price, o.currency)}`,
              )}
            </>,
            <>
              {o.rating
                ? k(
                    `buy · ${o.rating.mean.toFixed(1)} · ${o.target?.count ?? 0}`,
                    'text-state-good',
                  )
                : k('—')}
              {sm(
                o.target
                  ? `target ${closeWord(o.target.mean, o.currency)} · ${o.toTarget !== null ? `+${o.toTarget.toFixed(0)}%` : ''}`
                  : '',
              )}
            </>,
            closeWord(o.price, o.currency),
            i,
          )
        : row(
            o.symbol,
            o,
            <>
              {k(`p/e ${o.pe?.toFixed(1) ?? '—'}`, 'text-state-good')}
              {sm(`sector ${o.sector?.pe.toFixed(1) ?? '—'} · damodaran`)}
            </>,
            <>
              {k(
                o.target
                  ? `${closeWord(o.target.mean, o.currency)} · +${(o.toTarget ?? 0).toFixed(0)}%`
                  : '—',
                'text-state-good',
              )}
              {sm(`${o.target?.count ?? 0} analysts`)}
            </>,
            closeWord(o.price, o.currency),
            i,
          ),
    )
  }

  const at =
    tab === 'etfs'
      ? etfs !== null && etfs !== 'failed'
        ? etfs.fetchedAt
        : 0
      : oppsAt
  return (
    <div data-testid="watch-find" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-0.5 self-start rounded-full p-[3px] ring-1 ring-lift/12 ring-inset">
        {tabs.map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`motion-press rounded-full px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${
              tab === id
                ? 'bg-lift/10 text-foreground'
                : 'text-ink-300 hover:text-foreground'
            }`}
          >
            {label} <i className="text-ink-500 not-italic">{n ?? '…'}</i>
          </button>
        ))}
      </div>
      <div className="flex flex-col">
        <div
          className={`hidden border-b border-lift/10 px-1 pb-2 font-mono text-[9px] tracking-[0.14em] text-ink-500 uppercase sm:grid ${GRID}`}
        >
          <span />
          <span>ticker</span>
          <span>
            {tab === 'etfs'
              ? 'weight'
              : tab === 'down'
                ? 'from 52w high'
                : 'p/e · sector'}
          </span>
          <span>
            {tab === 'etfs'
              ? 'in your funds'
              : tab === 'down'
                ? 'analysts · target'
                : 'target · analysts'}
          </span>
          <span className="text-right">last</span>
          <span />
        </div>
        {body()}
      </div>
      <span className="font-mono text-[9.5px] tracking-[0.1em] text-ink-400 uppercase">
        {tab === 'etfs'
          ? 'yahoo finance · top holdings'
          : tab === 'cheap'
            ? 'yahoo finance · damodaran'
            : 'yahoo finance'}
        {at > 0 ? ` · ${clock(at)}` : ''} · not saved · held left out
      </span>
    </div>
  )
}

function Reading() {
  return (
    <div className="flex flex-col gap-2 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-10 animate-pulse rounded-[10px] bg-lift/[0.06]"
        />
      ))}
    </div>
  )
}
