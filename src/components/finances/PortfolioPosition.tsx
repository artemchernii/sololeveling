import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ChevronLeft, Sparkles, TriangleAlert, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import { PriceChart } from '@/components/finances/PriceChart'
import type { Position } from '@/components/finances/PortfolioList'
import { Veiled } from '@/components/finances/Veil'
import { useDayStarts } from '@/components/track/useDayStarts'
import { money } from '@/lib/currency'
import { metalOf, unitOf } from '@/lib/holdingLine'
import { UNPRICED } from '@/lib/market'
import { euros } from '@/lib/money'
import { gainOf } from '@/lib/owned'
import type { Owned } from '@/lib/owned'

type Account = Pick<Doc<'accounts'>, '_id' | 'name' | 'domain'>

const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})
const FULL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const RANGES = [
  { id: '1M', days: 31 },
  { id: '6M', days: 183 },
  { id: '1Y', days: 366 },
] as const
type Range = (typeof RANGES)[number]['id']
/** Rows of bought and sold shown before "all". */
const FIRST = 8

const KIND = { stock: 'share', etf: 'fund', crypto: 'coin', gold: 'gold' }
function BackToList() {
  return (
    <Link
      to="/finances"
      search={{ room: 'portfolio' }}
      className="motion-press inline-flex items-center gap-1.5 rounded-full py-1.5 pr-2.5 pl-1.5 font-mono text-[11px] tracking-[0.14em] text-ink-400 uppercase transition-colors hover:bg-lift/[0.07] hover:text-foreground"
    >
      <ChevronLeft className="size-3.5" />
      Portfolio
    </Link>
  )
}

/* An address for something that is not in the list (sold, or mistyped). */
export function PositionMissing() {
  return (
    <section
      data-testid="position-page"
      className="system-frame motion-arrive relative flex flex-col items-start gap-4 p-5"
    >
      <BackToList />
      <div className="flex w-full flex-col items-center gap-2 py-6 text-center">
        <span className="text-[22px] font-light text-foreground">
          Not owned now
        </span>
        <p className="text-[13.5px] text-ink-400">
          Only what is owned today has a page.
        </p>
      </div>
    </section>
  )
}

/* One position, its own page (13 Oct, mockup portfolio.html): what it is
   worth, what it was bought for, up or down since, the accounts it is in,
   its stored price line with the buys and sells on it, and each of them
   in euros (12 Oct: "amount is important"). */
export function PortfolioPosition({
  owned,
  holders,
}: {
  owned: Owned<Position>
  holders: ReadonlyArray<Account>
}) {
  const top = useRef<HTMLElement>(null)
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [owned.instrumentId])

  /* An account's trades are read one account at a time (invest.trades);
     a position is in a few accounts at most, so four fixed readings. */
  const [range, setRange] = useState<Range>('1Y')
  /* A long history shows its newest rows; the rest is one press away. */
  const [whole, setWhole] = useState(false)
  const today = useDayStarts(1).at(-1) as number
  const first = owned.at[0]
  const days = RANGES.find((r) => r.id === range)?.days ?? 366
  const line = useQuery(api.invest.priceLine, {
    instrumentId: first.instrumentId,
    since: today - days * 86_400_000,
  })
  const slot = (i: number) =>
    i < owned.at.length
      ? { accountId: owned.at[i].accountId, instrumentId: first.instrumentId }
      : 'skip'
  const trades = [
    useQuery(api.invest.trades, slot(0)),
    useQuery(api.invest.trades, slot(1)),
    useQuery(api.invest.trades, slot(2)),
    useQuery(api.invest.trades, slot(3)),
  ]
  const loaded = trades.slice(0, owned.at.length).every((t) => t !== undefined)
  const all = trades
    .flatMap((t) => t ?? [])
    .sort((a, b) => b.occurredAt - a.occurredAt)
  const remove = useMutation(api.invest.removeTrade)

  const gain = gainOf(owned)
  const up = (gain?.eur ?? 0) >= 0
  const tone = up ? 'text-state-good' : 'text-state-danger'
  const unpriced = first.type === UNPRICED
  const accountOf = (id: Id<'accounts'>) => holders.find((a) => a._id === id)
  const code = metalOf(owned.symbol) ?? owned.symbol.split(/[-.]/)[0]
  const unit = (n: number) => unitOf(first, n)
  const bought = all.filter(
    (t) => t.side === 'buy' && !t.reward && !t.split,
  ).length

  return (
    <section
      ref={top}
      data-testid="position-page"
      className="system-frame motion-arrive relative flex scroll-mt-4 flex-col gap-[18px] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackToList />
        {unpriced ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-state-warn/14 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-state-warn uppercase">
            <TriangleAlert className="motion-pulse size-3" />
            no price
          </span>
        ) : owned.stakedEur !== null ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-state-good/13 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-state-good uppercase">
            <Sparkles className="size-3" />
            staking on
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <TickerLogo
          symbol={owned.symbol}
          type={owned.type}
          name={owned.name}
          size={56}
        />
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight text-foreground">
            {owned.name}
          </h1>
          <p className="mt-1 font-mono text-[11px] text-ink-500">
            {code} · {KIND[owned.kind]} · {first.currency}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1 sm:text-right">
          {first.price === null || unpriced ? (
            <>
              <span className="block text-[26px] font-light text-ink-500">
                —
              </span>
              <span className="font-mono text-[10.5px] text-ink-500">
                no market price
              </span>
            </>
          ) : (
            <>
              <span className="block text-[26px] font-light text-foreground tabular-nums">
                {money(first.price, first.currency)}
              </span>
              <span className="font-mono text-[10.5px] text-ink-500">
                {first.priceAsOf === null
                  ? 'Yahoo Finance'
                  : `price on ${DAY.format(new Date(first.priceAsOf))} · Yahoo Finance`}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Tile label="worth now" delay={0}>
          <span className="text-[22px] leading-tight font-light text-foreground tabular-nums">
            {owned.valueEur === null ? (
              '—'
            ) : (
              <Veiled>{euros(owned.valueEur)}</Veiled>
            )}
          </span>
          <span className="font-mono text-[10.5px] text-ink-500">
            <Veiled>{`${owned.shares} ${unit(owned.shares)}`}</Veiled>
          </span>
        </Tile>
        <Tile label="bought for" delay={40}>
          <span className="text-[22px] leading-tight font-light text-foreground tabular-nums">
            {owned.paid === null ? '—' : <Veiled>{euros(owned.paid)}</Veiled>}
          </span>
          <span className="font-mono text-[10.5px] text-ink-500">
            {owned.paid === null
              ? 'not in the files yet'
              : bought > 0
                ? `${bought} ${bought === 1 ? 'buy' : 'buys'}`
                : ''}
          </span>
        </Tile>
        <Tile
          label={
            gain === null
              ? 'since bought'
              : `${up ? 'up' : 'down'} since bought`
          }
          delay={80}
        >
          {gain === null ? (
            <span className="text-[22px] leading-tight font-light text-ink-500">
              —
            </span>
          ) : (
            <>
              <span
                className={`text-[22px] leading-tight font-light tabular-nums ${tone}`}
              >
                <Veiled>{`${up ? '+' : '−'}${euros(Math.abs(gain.eur))}`}</Veiled>
              </span>
              <span className={`font-mono text-[10.5px] ${tone}`}>
                {up ? '▲' : '▼'} {Math.abs(gain.pct).toFixed(1)}%
              </span>
            </>
          )}
        </Tile>
        {owned.stakedEur !== null && owned.at.length === 1 ? (
          <Tile label="from staking" delay={120}>
            <span className="text-[22px] leading-tight font-light text-state-good tabular-nums">
              <Veiled>{euros(owned.stakedEur)}</Veiled>
            </span>
            <span className="font-mono text-[10.5px] text-ink-500">
              <Veiled>{`${Number(owned.staked.toFixed(4))} ${unit(owned.staked)}`}</Veiled>{' '}
              · not counted as income
            </span>
          </Tile>
        ) : (
          <Tile
            label={owned.at.length > 1 ? 'accounts' : 'account'}
            delay={120}
          >
            {owned.at.map((r) => {
              const a = accountOf(r.accountId)
              return (
                <span
                  key={r.accountId}
                  className="flex min-h-5 items-center justify-between gap-2 font-mono text-[12px]"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-ink-300">
                    <AccountLogo
                      name={a?.name ?? ''}
                      domain={a?.domain}
                      size={14}
                    />
                    <span className="truncate">{a?.name}</span>
                  </span>
                  <span className="text-foreground">
                    {r.valueEur === null ? (
                      '—'
                    ) : (
                      <Veiled>{euros(r.valueEur)}</Veiled>
                    )}
                  </span>
                </span>
              )
            })}
          </Tile>
        )}
      </div>

      {unpriced ? (
        <div className="flex items-start gap-3 rounded-[16px] bg-state-warn/9 p-4 text-state-warn ring-1 ring-state-warn/30 ring-inset">
          <TriangleAlert className="mt-0.5 size-[18px] shrink-0" />
          <p className="text-[13.5px] leading-relaxed text-ink-200">
            No market price, so no chart.
            {owned.valueEur !== null && first.seenAt !== null
              ? ` ${euros(owned.valueEur)} is the worth ${accountOf(first.accountId)?.name ?? 'the account'} showed on ${DAY.format(new Date(first.seenAt))}.`
              : ''}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="label-caps">price</span>
            <div className="flex gap-1.5">
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={range === r.id}
                  onClick={() => setRange(r.id)}
                  className={range === r.id ? PILL_LOUD : PILL_QUIET}
                >
                  {r.id}
                </button>
              ))}
            </div>
          </div>
          <PriceChart
            points={line}
            marks={all
              .filter((t) => !t.reward && !t.split)
              .map((t) => ({ t: t.occurredAt, side: t.side }))}
            currency={first.currency}
            tone={gain === null ? 'plain' : up ? 'up' : 'down'}
          />
        </div>
      )}

      <div className="flex flex-col rounded-[16px] bg-lift/[0.025] p-3.5 ring-1 ring-lift/8 ring-inset">
        <span className="label-caps mb-1">
          bought and sold{loaded && all.length > 0 ? ` · ${all.length}` : ''}
        </span>
        {!loaded ? (
          <span className="py-3 font-mono text-[11px] text-ink-500">
            reading…
          </span>
        ) : all.length === 0 ? (
          <span className="py-3 text-[13px] text-ink-400">
            No buys or sells in the files yet.
          </span>
        ) : (
          (whole ? all : all.slice(0, FIRST)).map((t, i) => {
            const a = accountOf(t.accountId)
            const free = t.reward || t.split
            return (
              <div
                key={t._id}
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                className="group motion-arrive grid grid-cols-[62px_minmax(0,1fr)_auto_16px_20px] items-center gap-2.5 border-t border-lift/6 py-2.5 first:border-t-0"
              >
                <span
                  className={`font-mono text-[10.5px] tracking-[0.12em] uppercase ${
                    t.side === 'sell' ? 'text-state-danger' : 'text-state-good'
                  }`}
                >
                  {t.reward
                    ? 'staking'
                    : t.split
                      ? 'split'
                      : t.side === 'buy'
                        ? 'bought'
                        : 'sold'}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5 font-mono">
                  <span className="text-[13.5px] text-foreground">
                    <Veiled>
                      {free
                        ? `${t.shares} ${unit(t.shares)}`
                        : euros(Math.round(t.shares * t.priceEur * 100) / 100)}
                    </Veiled>
                  </span>
                  <span className="truncate text-[10.5px] text-ink-500">
                    {t.reward ? (
                      'not counted as income'
                    ) : t.split ? (
                      'added by a split'
                    ) : (
                      <>
                        <Veiled>{`${t.shares} ${unit(t.shares)}`}</Veiled>
                        {` at ${euros(t.priceEur)}`}
                        {t.opening ? ' · in the account when first read' : ''}
                      </>
                    )}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-ink-500">
                  {FULL.format(new Date(t.occurredAt))}
                </span>
                <AccountLogo
                  name={a?.name ?? ''}
                  domain={a?.domain}
                  size={16}
                />
                <button
                  type="button"
                  aria-label="Remove this trade"
                  onClick={() => void remove({ tradeId: t._id })}
                  className="grid size-5 place-items-center rounded-[6px] text-ink-600 opacity-0 group-hover:opacity-100 hover:text-state-danger [@media(hover:none)]:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            )
          })
        )}
        {loaded && !whole && all.length > FIRST ? (
          <button
            type="button"
            onClick={() => setWhole(true)}
            className="motion-press mt-1 self-start rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase ring-1 ring-lav-400/40 ring-inset hover:bg-lav-400/10"
          >
            all {all.length}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function Tile({
  label,
  delay,
  children,
}: {
  label: string
  delay: number
  children: React.ReactNode
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="motion-arrive flex flex-col gap-1 rounded-[14px] bg-lift/[0.035] p-3 ring-1 ring-lift/7 ring-inset"
    >
      <span className="label-caps">{label}</span>
      {children}
    </div>
  )
}
