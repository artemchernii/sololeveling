import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  Check,
  ChevronLeft,
  Loader2,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { ToolPills, ViewPills } from '@/components/finances/ChartTools'
import type { Tool } from '@/components/finances/ChartTools'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import type { View } from '@/components/finances/chartSeries'
import { PriceChart, asPt } from '@/components/finances/PriceChart'
import type { Position } from '@/components/finances/PortfolioList'
import { PositionTrades } from '@/components/finances/PositionTrades'
import { Veiled } from '@/components/finances/Veil'
import { useOlderYears } from '@/components/finances/useOlderYears'
import { useDayStarts } from '@/components/track/useDayStarts'
import { money } from '@/lib/currency'
import { codeOf, unitOf } from '@/lib/holdingLine'
import { UNPRICED } from '@/lib/market'
import { euros } from '@/lib/money'
import { gainOf } from '@/lib/owned'
import { drawable, withOlder } from '@/lib/priceChart'
import type { Owned } from '@/lib/owned'
import type { soldSums } from '@/lib/sold'

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
type Range = (typeof RANGES)[number]['id'] | 'all'
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
          Only what is owned or was sold has a page.
        </p>
      </div>
    </section>
  )
}

/* One position, its own page (13 Oct, mockup portfolio.html): what it is
   worth, what it was bought for, up or down since, the accounts it is in,
   its stored price line with the buys and sells on it, and each of them
   in euros (12 Oct: "amount is important"). A thing sold out has the
   same page: what it was bought for, what it was sold for, and the
   difference (`sold`). */
export function PortfolioPosition({
  owned,
  holders,
  sold,
}: {
  owned: Owned<Position>
  holders: ReadonlyArray<Account>
  sold?: ReturnType<typeof soldSums>
}) {
  const top = useRef<HTMLElement>(null)
  useEffect(() => {
    top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [owned.instrumentId])

  /* An account's trades are read one account at a time (invest.trades);
     a position is in a few accounts at most, so four fixed readings. */
  const [range, setRange] = useState<Range>('1Y')
  const [tool, setTool] = useState<Tool | null>(null)
  const today = useDayStarts(1).at(-1) as number
  const first = owned.at[0]
  /* The whole year is read once; a range sets what of it is in view,
     and the chart can be moved back from there (mockup chart.html). */
  const days = RANGES.find((r) => r.id === range)?.days ?? Infinity
  const year = useQuery(api.invest.priceLine, {
    instrumentId: first.instrumentId,
    since: today - 366 * 86_400_000,
  })
  /* The years before it, once "all" is pressed — for this share alone
     (priceYears.ts). They stay for the other ranges: zooming out goes
     on into them. */
  const years = useOlderYears(first.instrumentId)
  const line = useMemo(
    () => (year && years.older ? withOlder(year, years.older) : year),
    [year, years.older],
  )
  /* Candles and volume only where the loaded year is stored that way
     (13 Oct). A share whose days were stored before has its year read
     again — once, this share alone, when its page is opened (bars.ts). */
  const [view, setView] = useState<View>('line')
  const [volume, setVolume] = useState(false)
  const can = useMemo(() => drawable((line ?? []).map(asPt)), [line])
  const askBars = useMutation(api.bars.ask)
  const asked = useRef<Id<'instruments'> | null>(null)
  const lacks = line !== undefined && line.length > 0 && !can.whole
  useEffect(() => {
    if (!lacks || first.type === UNPRICED) return
    if (asked.current === first.instrumentId) return
    asked.current = first.instrumentId
    void askBars({ instrumentId: first.instrumentId }).catch(() => undefined)
  }, [lacks, first.instrumentId, first.type, askBars])
  /* The header's price in euros (13 Oct, chart.html): the server's
     euros for that same stored close, none when it has no rate. */
  const last = year?.at(-1)
  const latestEur =
    last !== undefined && last.asOf === first.priceAsOf ? last.eur : undefined
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

  const gain = sold ? sold.gain : gainOf(owned)
  const up = (gain?.eur ?? 0) >= 0
  const tone = up ? 'text-state-good' : 'text-state-danger'
  const unpriced = first.type === UNPRICED
  const accountOf = (id: Id<'accounts'>) => holders.find((a) => a._id === id)
  const code = codeOf(owned)
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
        {sold ? (
          <span className="motion-arrive inline-flex items-center gap-1.5 rounded-full bg-state-good/13 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-state-good uppercase">
            <Check className="size-3" />
            all sold {FULL.format(new Date(sold.day))}
          </span>
        ) : unpriced ? (
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
            <div data-testid="position-price">
              <span className="block text-[26px] font-light text-foreground tabular-nums">
                {money(first.price, first.currency)}
              </span>
              <span className="font-mono text-[10.5px] text-ink-500">
                {latestEur === undefined ? null : (
                  <span className="text-ink-300">
                    {euros(latestEur)}
                    {' · '}
                  </span>
                )}
                {first.priceAsOf === null
                  ? 'Yahoo Finance'
                  : `price on ${DAY.format(new Date(first.priceAsOf))} · Yahoo Finance`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Tile label="worth now" delay={0}>
          <span
            className={`text-[22px] leading-tight font-light tabular-nums ${sold ? 'text-ink-500' : 'text-foreground'}`}
          >
            {owned.valueEur === null ? (
              '—'
            ) : (
              <Veiled>{euros(owned.valueEur)}</Veiled>
            )}
          </span>
          <span className="font-mono text-[10.5px] text-ink-500">
            {sold ? (
              'all sold'
            ) : (
              <Veiled>{`${owned.shares} ${unit(owned.shares)}`}</Veiled>
            )}
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
        {sold ? (
          <Tile label="sold for" delay={80}>
            <span className="text-[22px] leading-tight font-light text-foreground tabular-nums">
              {sold.got === null ? '—' : <Veiled>{euros(sold.got)}</Veiled>}
            </span>
            <span className="font-mono text-[10.5px] text-ink-500">
              {sold.got === null
                ? 'not in the files yet'
                : FULL.format(new Date(sold.day))}
            </span>
          </Tile>
        ) : null}
        <Tile
          label={
            sold
              ? gain === null
                ? 'when sold'
                : `${up ? 'up' : 'down'} when sold`
              : gain === null
                ? 'since bought'
                : `${up ? 'up' : 'down'} since bought`
          }
          delay={sold ? 120 : 80}
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
        {sold ? null : owned.stakedEur !== null && owned.at.length === 1 ? (
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
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
            <span className="label-caps">price</span>
            <ToolPills tool={tool} onTool={setTool} />
            <div className="ml-auto flex flex-wrap justify-end gap-x-3.5 gap-y-2">
              <ViewPills
                can={can}
                view={can.candles ? view : 'line'}
                onView={setView}
                volume={can.volume && volume}
                onVolume={setVolume}
              />
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
                <button
                  type="button"
                  aria-pressed={range === 'all'}
                  disabled={years.reading}
                  title={
                    years.failed
                      ? 'Yahoo Finance did not answer. Press to read again.'
                      : 'Five years'
                  }
                  onClick={() =>
                    void years.ask().then((ok) => ok && setRange('all'))
                  }
                  className={`${range === 'all' ? PILL_LOUD : PILL_QUIET} inline-flex items-center gap-1.5 ${years.failed ? 'text-state-warn ring-state-warn/40' : ''}`}
                >
                  {years.reading ? (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      reading…
                    </>
                  ) : years.failed ? (
                    <>
                      <TriangleAlert className="motion-pulse size-3" />
                      all · not read
                    </>
                  ) : (
                    'all'
                  )}
                </button>
              </div>
            </div>
          </div>
          <PriceChart
            points={line}
            marks={all
              .filter((t) => !t.reward && !t.split)
              .map((t) => ({
                t: t.occurredAt,
                side: t.side,
                eur: Math.round(t.shares * t.priceEur * 100) / 100,
              }))}
            currency={first.currency}
            tone={gain === null ? 'plain' : up ? 'up' : 'down'}
            since={today - days * 86_400_000}
            tool={tool}
            view={can.candles ? view : 'line'}
            volume={can.volume && volume}
          />
        </div>
      )}

      <PositionTrades
        loaded={loaded}
        all={all}
        unit={unit}
        accountOf={accountOf}
      />
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
