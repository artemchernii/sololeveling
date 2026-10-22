import { useAction } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { FunctionReturnType } from 'convex/server'
import { MarkLogo, clock } from './parts'
import { useMarket } from './useMarket'
import { TickerLogo } from '@/components/finances/Logo'
import { money } from '@/lib/currency'
import { MARKETS } from '@/lib/insightsMarket'
import { badgeOf, pctWord, plainCompany } from '@/lib/investAlert'
import type { Moment } from '@/lib/investAlert'
import type { Headline } from '@/lib/yahooFundamentals'

/* CLOSE (22 Oct, his "21:30 we get notification with main thing =>
   report of the day: my holdings + major news"; mockup
   design/treasury-mockup/close.html). The day's worth now and at the
   close before, each share's move with its moments as badges, the
   market's day, and headlines the app picks — the three biggest movers
   and any company reporting (CLAUDE.md rule 2). Fetched on open; kept on
   the page ten minutes; nothing stored. */

type Day = FunctionReturnType<typeof api.aggregate.dayClose>
type Row = Day['rows'][number]
type Moments = FunctionReturnType<typeof api.closeReport.badges>

const INDICES = ['sp500', 'ndx', 'stoxx', 'btc'] as const
const KEEP_MS = 10 * 60_000
let kept: { at: number; moments: Moments } | null = null

const midnight = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
const pctOf = (r: Row) =>
  r.was !== null && r.price !== null && r.was > 0
    ? ((r.price - r.was) / r.was) * 100
    : null
const tone = (v: number): 'good' | 'bad' | 'dim' =>
  v < 0 ? 'bad' : v > 0 ? 'good' : 'dim'
const dayOf = (t: number) =>
  new Date(t)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    .toUpperCase()

/** CLOSE's own state: the day (reactive, while the room is shown, for
    the tab's badge), the moments (fetched when the tab opens). */
export function useClose(shown: boolean, on: boolean) {
  const [since] = useState(midnight)
  const day = useQuery(api.aggregate.dayClose, shown ? { since } : 'skip')
  const badges = useAction(api.closeReport.badges)
  const [moments, setMoments] = useState<Moments | null>(() =>
    kept && Date.now() - kept.at < KEEP_MS ? kept.moments : null,
  )
  useEffect(() => {
    if (!on || moments !== null) return
    let live = true
    badges({})
      .then((m) => {
        kept = { at: Date.now(), moments: m }
        if (live) setMoments(m)
      })
      .catch(() => {
        if (live) setMoments([])
      })
    return () => {
      live = false
    }
  }, [on, moments, badges])
  return { day, moments }
}

/** The tab's badge: the day's change in percent. */
export function closeBadge(day: Day | undefined) {
  if (!day || day.wasEur <= 0) return undefined
  const p = ((day.nowEur - day.wasEur) / day.wasEur) * 100
  return {
    text: p === 0 ? '= 0%' : pctWord(p),
    tone: tone(p),
  }
}

export function Close({ close }: { close: ReturnType<typeof useClose> }) {
  const { day, moments } = close
  if (day === undefined)
    return <section className="ins-tile ins-empty" aria-busy="true" />
  if (day.rows.length === 0)
    return (
      <section data-testid="close-empty" className="ins-tile ins-empty">
        <span className="ins-emo">📊</span>
        <span className="ins-badge dim">NO SHARES HELD</span>
      </section>
    )
  const momentsOf = (id: Id<'instruments'>): ReadonlyArray<Moment> =>
    moments?.find((m) => m.instrumentId === id)?.moments ?? []
  const rows = [...day.rows].sort(
    (a, b) => Math.abs(pctOf(b) ?? 0) - Math.abs(pctOf(a) ?? 0),
  )
  const max = Math.max(1, ...rows.map((r) => Math.abs(pctOf(r) ?? 0)))
  const diff = Math.round((day.nowEur - day.wasEur) * 100) / 100
  const pct = day.wasEur > 0 ? (diff / day.wasEur) * 100 : 0
  const latest = Math.max(...rows.map((r) => r.priceAsOf ?? 0))
  const wasAt = Math.max(...rows.map((r) => r.wasAsOf ?? 0))
  const ups = rows.filter((r) => (pctOf(r) ?? 0) > 0).length
  const downs = rows.filter((r) => (pctOf(r) ?? 0) < 0).length
  /* Rule 2: the three biggest movers and any company reporting. */
  const reporting = rows.filter((r) =>
    momentsOf(r.instrumentId).some(
      (m) => m.kind === 'soon' || m.kind === 'reported',
    ),
  )
  const newsOf = [
    ...new Set([...rows.slice(0, 3), ...reporting].map((r) => r.instrumentId)),
  ]

  return (
    <div className="ins-grid" data-testid="close">
      <section
        className="ins-tile c12 system-frame close-hero"
        style={{ '--i': 0 } as React.CSSProperties}
      >
        <div className="ins-thead">
          <span className="system-title">
            [ CLOSE · {latest ? dayOf(latest) : '—'} ]
          </span>
          <span className="grow" />
          <span className="ins-badge dim">
            {day.traded
              ? `PRICES ${clock(latest)}`
              : `MARKET CLOSED · ${dayOf(latest)} CLOSE`}{' '}
            · YAHOO FINANCE
          </span>
        </div>
        <div className="close-pair">
          <div className="close-side">
            <span className="ins-was">
              NOW · {rows.length} {rows.length === 1 ? 'SHARE' : 'SHARES'}
            </span>
            <span data-testid="close-now" className="close-big">
              {money(day.nowEur)}
            </span>
          </div>
          <div className="close-side">
            <span className="ins-was">
              WAS · {wasAt ? dayOf(wasAt) : '—'} CLOSE
            </span>
            <span data-testid="close-was" className="close-was">
              {money(day.wasEur)}
            </span>
          </div>
          <span
            data-testid="close-diff"
            className={`close-delta ${tone(diff)}`}
          >
            {diff === 0
              ? '= €0'
              : `${diff < 0 ? '▼' : '▲'} ${money(Math.abs(diff))} · ${Math.abs(Math.round(pct * 10) / 10)}%`}
          </span>
          <span className="grow" />
          <span className="ins-badge good">{ups} ▲</span>
          <span className="ins-badge bad">{downs} ▼</span>
        </div>
      </section>

      <section
        className="ins-tile c7 close-moves"
        style={{ '--i': 1 } as React.CSSProperties}
      >
        <div className="ins-thead">
          <span className="ins-ico">📊</span>
          <span className="ins-tname">MOVES · TODAY</span>
          <span className="grow" />
          <span className="ins-was">BIGGEST FIRST</span>
        </div>
        <div className="close-list" data-testid="close-list">
          {rows.map((r, k) => {
            const p = pctOf(r)
            const ms = momentsOf(r.instrumentId)
            const big = ms.some((m) => m.kind === 'big')
            const hot = big ? ((p ?? 0) < 0 ? 'hot' : 'hot up') : ''
            const eur =
              r.nowEur !== null && r.wasEur !== null
                ? r.nowEur - r.wasEur
                : null
            return (
              <div
                key={r.instrumentId}
                data-testid="close-row"
                className={`close-mv ${hot}`}
                style={{ '--i': k } as React.CSSProperties}
              >
                <TickerLogo
                  symbol={r.symbol}
                  type={r.type}
                  name={r.name}
                  size={30}
                />
                <div className="grow">
                  <div className="nm">
                    {plainCompany(r.name)}{' '}
                    <span className="ins-was">{r.symbol.split('.')[0]}</span>
                  </div>
                  <div className="sub">
                    {r.was !== null && r.price !== null
                      ? `WAS ${money(r.was, r.currency)} · NOW ${money(r.price, r.currency)}`
                      : 'NO CLOSE BEFORE'}
                  </div>
                </div>
                <div className="close-badges">
                  {ms.map((m, i) => {
                    const b = badgeOf(m)
                    return (
                      <span
                        key={i}
                        data-testid="close-badge"
                        className={`ins-badge ${b.tone}`}
                      >
                        {b.text}
                      </span>
                    )
                  })}
                </div>
                {p !== null ? (
                  <span className="close-bar">
                    <i
                      className={p < 0 ? 'bad' : 'good'}
                      style={{
                        [p < 0 ? 'right' : 'left']: '50%',
                        width: `${(Math.abs(p) / max) * 50}%`,
                      }}
                    />
                  </span>
                ) : null}
                <span className={`close-eur ${tone(eur ?? 0)}`}>
                  {eur === null
                    ? '—'
                    : `${eur < 0 ? '−' : '+'}${money(Math.abs(eur))}`}
                </span>
                <span className={`ins-badge ${tone(p ?? 0)} close-pct`}>
                  {p === null ? '—' : p === 0 ? '= 0%' : pctWord(p)}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <div className="c5 close-col">
        <MarketToday />
        <section
          className="ins-tile"
          style={{ '--i': 3 } as React.CSSProperties}
        >
          <div className="ins-thead">
            <span className="ins-ico">📰</span>
            <span className="ins-tname">NEWS · TOP MOVERS</span>
          </div>
          {newsOf.map((id, k) => {
            const r = rows.find((x) => x.instrumentId === id)
            return r ? <ShareNews key={id} row={r} i={k} /> : null
          })}
        </section>
      </div>
    </div>
  )
}

function MarketToday() {
  const market = useMarket('1D')
  const read = useAction(api.closeReport.marketNews)
  const [news, setNews] = useState<
    { at: number; items: Array<Headline> } | null | false
  >(null)
  useEffect(() => {
    let live = true
    read({})
      .then((n) => live && setNews(n))
      .catch(() => live && setNews(false))
    return () => {
      live = false
    }
  }, [read])
  const a = market.answer
  return (
    <section
      data-testid="close-market"
      className="ins-tile"
      style={{ '--i': 2 } as React.CSSProperties}
    >
      <div className="ins-thead">
        <span className="ins-ico">🌐</span>
        <span className="ins-tname">MARKET · TODAY</span>
        <span className="grow" />
        {a ? (
          <span className="ins-was">FETCHED {clock(a.fetchedAt)}</span>
        ) : null}
      </div>
      <div className="close-idx">
        {INDICES.map((id) => {
          const m = MARKETS.find((x) => x.id === id)
          const move = a?.markets.find((x) => x.id === id)?.move ?? null
          return m ? (
            <div key={id} className="close-ix">
              <span className="ins-was">
                <MarkLogo mark={m.mark} size={16} /> {m.name}
              </span>
              <span className="ins-num">
                {move
                  ? move.price.toLocaleString('en', {
                      maximumFractionDigits: 0,
                    })
                  : '—'}
              </span>
              {move ? (
                <span className="ins-was">
                  WAS{' '}
                  {move.base.toLocaleString('en', { maximumFractionDigits: 0 })}
                </span>
              ) : null}
              {move ? (
                <span className={`ins-badge ${tone(move.change)}`}>
                  {pctWord(move.change)}
                </span>
              ) : (
                <span className="ins-badge dim">{a ? 'NO DATA' : '…'}</span>
              )}
            </div>
          ) : null
        })}
      </div>
      {news === false ? (
        <span className="ins-badge dim">NO HEADLINES</span>
      ) : (
        (news?.items ?? []).map((h, k) => <NewsRow key={k} h={h} emo="🏦" />)
      )}
    </section>
  )
}

function ShareNews({ row, i }: { row: Row; i: number }) {
  const read = useAction(api.news.of)
  const [items, setItems] = useState<Array<Headline> | null>(null)
  useEffect(() => {
    let live = true
    read({ instrumentId: row.instrumentId })
      .then((n) => live && setItems(n.items.slice(0, 2)))
      .catch(() => live && setItems([]))
    return () => {
      live = false
    }
  }, [read, row.instrumentId])
  return (
    <>
      {(items ?? []).map((h, k) => (
        <NewsRow
          key={`${i}-${k}`}
          h={h}
          logo={
            <TickerLogo
              symbol={row.symbol}
              type={row.type}
              name={row.name}
              size={28}
            />
          }
          tag={row.symbol.split('.')[0]}
        />
      ))}
    </>
  )
}

function NewsRow({
  h,
  logo,
  emo,
  tag,
}: {
  h: Headline
  logo?: React.ReactNode
  emo?: string
  tag?: string
}) {
  return (
    <a
      data-testid="close-news"
      className="close-news"
      href={h.link}
      target="_blank"
      rel="noreferrer"
    >
      {logo ?? <span className="ins-emo close-emo">{emo}</span>}
      <span className="grow">
        <span className="h">{h.title}</span>
        <span className="m">
          {tag ? `${tag} · ` : ''}
          {h.publisher.toUpperCase()} · {clock(h.at)} ↗
        </span>
      </span>
    </a>
  )
}
