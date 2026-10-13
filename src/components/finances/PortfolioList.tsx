import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ChevronRight, Sparkles, TriangleAlert } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  PILL_LOUD,
  PILL_QUIET,
  Panel,
  Sparkline,
} from '@/components/finances/bits'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { useDayStarts } from '@/components/track/useDayStarts'
import { codeOf, holdingLine, unitOf } from '@/lib/holdingLine'
import type { Kind } from '@/lib/logo'
import { euros } from '@/lib/money'
import { combine, gainOf, ordered } from '@/lib/owned'
import type { Order, Owned } from '@/lib/owned'
import { soldSums } from '@/lib/sold'

const DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})
const FULL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export type Position = {
  accountId: Id<'accounts'>
  instrumentId: Id<'instruments'>
  symbol: string
  name: string
  type: string
  currency: string
  shares: number
  paid: number | null
  paidUsd: number | null
  status: 'trades' | 'match' | 'screen' | 'gap' | 'over'
  seenAt: number | null
  gap: number
  notSeen: boolean
  price: number | null
  priceAsOf: number | null
  valueEur: number | null
  staked: number
}

/** One account's side of a thing sold out: no shares, `paid` what its
    buys cost. */
export type Sold = Position & { soldFor: number | null; soldAt: number }

type Account = Pick<Doc<'accounts'>, '_id' | 'name' | 'domain'>

const ORDERS: ReadonlyArray<{ by: Order; label: string }> = [
  { by: 'worth', label: 'biggest' },
  { by: 'up', label: 'up most' },
  { by: 'down', label: 'down most' },
]

/* Everything owned, one row a thing (12 Oct, mockup portfolio.html): the
   same company at two brokers is one row with both marks. Euros lead,
   shares sit small underneath (12 Oct: "amount is important"). */
export function PortfolioList({
  rows,
  sold,
  holders,
  filter,
  onFilter,
  kind,
}: {
  rows: ReadonlyArray<Position>
  sold: ReadonlyArray<Sold>
  holders: ReadonlyArray<Account>
  filter: Id<'accounts'> | 'all'
  onFilter: (next: Id<'accounts'> | 'all') => void
  kind: Kind | 'all'
}) {
  const [order, setOrder] = useState<Order>('worth')
  const shown = ordered(
    combine(rows.filter((r) => filter === 'all' || r.accountId === filter)),
    order,
  ).filter((o) => kind === 'all' || o.kind === kind)
  const chosen = holders.find((a) => a._id === filter)
  /* Sold is folded away until asked for (mockup portfolio.html). */
  const [showSold, setShowSold] = useState(false)
  const gone = combine(
    sold.filter((r) => filter === 'all' || r.accountId === filter),
  )
    .filter((o) => kind === 'all' || o.kind === kind)
    .map((o) => ({ owned: o, sums: soldSums(o.paid, o.at) }))
    .sort((a, b) => b.sums.day - a.sums.day)
  /* Nothing owned here, only sold: the sold rows are the list. */
  const only = shown.length === 0 && gone.length > 0

  return (
    <Panel
      title={
        only
          ? `${chosen ? `${chosen.name} · ` : ''}sold · ${gone.length}`
          : `${chosen ? chosen.name : 'everything owned'} · ${shown.length}`
      }
      aside={
        <div
          className={`flex flex-wrap gap-1.5 ${shown.length > 1 ? '' : 'hidden'}`}
        >
          {ORDERS.map((o) => (
            <button
              key={o.by}
              type="button"
              aria-pressed={order === o.by}
              onClick={() => setOrder(o.by)}
              className={order === o.by ? PILL_LOUD : PILL_QUIET}
            >
              {o.label}
            </button>
          ))}
        </div>
      }
    >
      {holders.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={filter === 'all'}
            onClick={() => onFilter('all')}
            className={filter === 'all' ? PILL_LOUD : PILL_QUIET}
          >
            all accounts
          </button>
          {holders.map((a) => (
            <button
              key={a._id}
              type="button"
              aria-pressed={filter === a._id}
              onClick={() => onFilter(a._id)}
              className={filter === a._id ? PILL_LOUD : PILL_QUIET}
            >
              <AccountLogo name={a.name} domain={a.domain} size={14} />
              {a.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-0.5">
        {shown.map((o, i) => (
          <OwnedRow
            key={o.instrumentId}
            owned={o}
            holders={holders}
            delay={i * 28}
          />
        ))}
      </div>
      {gone.length > 0 ? (
        <>
          {only ? null : (
            <button
              type="button"
              aria-expanded={showSold}
              onClick={() => setShowSold(!showSold)}
              className="label-caps motion-press flex items-center gap-1.5 self-start rounded-[8px] px-2 py-1.5 transition-colors hover:bg-lift/[0.07] hover:text-foreground"
            >
              <ChevronRight
                className={`size-3.5 transition-transform duration-300 ${showSold ? 'rotate-90' : ''}`}
              />
              sold · {gone.length}
            </button>
          )}
          {showSold || only ? (
            <div className="flex flex-col gap-0.5">
              {gone.map(({ owned, sums }, i) => (
                <SoldRow
                  key={owned.instrumentId}
                  owned={owned}
                  sums={sums}
                  delay={i * 28}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </Panel>
  )
}

/* A thing sold out: quieter than what is owned, the same press. */
function SoldRow({
  owned,
  sums,
  delay,
}: {
  owned: Owned<Sold>
  sums: ReturnType<typeof soldSums>
  delay: number
}) {
  return (
    <div data-testid="sold-row" className="flex flex-col">
      <Link
        to="/finances"
        search={{ room: 'portfolio', position: owned.instrumentId }}
        style={{ animationDelay: `${delay}ms` }}
        className="motion-press motion-arrive grid min-h-[62px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] px-2.5 py-2 text-left ring-1 ring-transparent transition-colors ring-inset hover:bg-lav-400/[0.07] hover:ring-lav-400/30 sm:grid-cols-[38px_minmax(0,1fr)_auto_14px]"
      >
        <span className="opacity-60">
          <TickerLogo
            symbol={owned.symbol}
            type={owned.type}
            name={owned.name}
            size={38}
          />
        </span>
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="truncate text-[14.5px] text-ink-300">
            {owned.name}
          </span>
          <span className="truncate font-mono text-[11px] text-ink-500">
            {codeOf(owned)} · all sold {FULL.format(new Date(sums.day))}
          </span>
        </span>
        <span className="flex flex-col items-end gap-[3px] font-mono">
          <span className="text-[13.5px] text-ink-300">
            {sums.got === null ? (
              'sale not in the files yet'
            ) : (
              <>
                sold for <Veiled>{euros(sums.got)}</Veiled>
              </>
            )}
          </span>
          <span className="text-[11px] text-ink-500">
            bought for{' '}
            {sums.bought === null ? '—' : <Veiled>{euros(sums.bought)}</Veiled>}
          </span>
        </span>
        <ChevronRight className="hidden size-3.5 text-ink-600 sm:block" />
      </Link>
    </div>
  )
}

function OwnedRow({
  owned,
  holders,
  delay,
}: {
  owned: Owned<Position>
  holders: ReadonlyArray<Account>
  delay: number
}) {
  const today = useDayStarts(1).at(-1) as number
  const first = owned.at[0]
  const line = useQuery(api.invest.priceLine, {
    instrumentId: first.instrumentId,
    since: today - 90 * 86_400_000,
  })
  const gain = gainOf(owned)
  const up = (gain?.eur ?? 0) >= 0
  const tone = up ? 'text-state-good' : 'text-state-danger'
  const at = owned.at.map((r) => ({
    row: r,
    account: holders.find((a) => a._id === r.accountId),
  }))
  const said = at
    .map(({ row, account }) =>
      holdingLine(row, account?.name ?? '', (t) => DATE.format(new Date(t))),
    )
    .find((s) => s !== null)
  return (
    <div data-testid="owned-row" className="flex flex-col">
      <Link
        to="/finances"
        search={{ room: 'portfolio', position: owned.instrumentId }}
        style={{ animationDelay: `${delay}ms` }}
        className="motion-press motion-arrive grid min-h-[62px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] px-2.5 py-2 text-left ring-1 ring-transparent transition-colors ring-inset hover:bg-lav-400/[0.07] hover:ring-lav-400/30 sm:grid-cols-[38px_minmax(0,1fr)_96px_auto_14px]"
      >
        <TickerLogo
          symbol={owned.symbol}
          type={owned.type}
          name={owned.name}
          size={38}
        />
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="truncate text-[14.5px] text-foreground">
            {owned.name}
          </span>
          <span className="flex items-center gap-1.5 overflow-hidden font-mono text-[11px] whitespace-nowrap text-ink-500">
            <span>{codeOf(owned)}</span>
            <span>·</span>
            {at.map(({ row, account }) => (
              <AccountLogo
                key={row.accountId}
                name={account?.name ?? ''}
                domain={account?.domain}
                size={14}
              />
            ))}
            <span>
              {at.length > 1
                ? `${at.length} accounts`
                : (at[0].account?.name ?? '')}
            </span>
            <span className="truncate">
              ·{' '}
              <Veiled>{`${owned.shares} ${unitOf(first, owned.shares)}`}</Veiled>
            </span>
          </span>
          {owned.stakedEur !== null ? (
            <span className="flex items-center gap-1 font-mono text-[10.5px] text-state-good">
              <Sparkles className="size-3" />
              <Veiled>{euros(owned.stakedEur)}</Veiled> from staking
            </span>
          ) : null}
          {said ? (
            <span
              className={`flex items-start gap-1 text-[11.5px] leading-snug ${said.warn ? 'text-state-warn' : 'text-ink-500'}`}
            >
              {said.warn ? (
                <TriangleAlert className="mt-px size-3 shrink-0" />
              ) : null}
              <span>{said.text}</span>
            </span>
          ) : null}
        </span>
        <Sparkline
          className="hidden h-8 w-24 sm:block"
          points={(line ?? []).map((p) => ({ t: p.asOf, v: p.price }))}
        />
        <span className="flex min-w-24 flex-col items-end gap-[3px] font-mono">
          <span className="text-[14.5px] text-foreground">
            {owned.valueEur === null ? (
              '—'
            ) : (
              <Veiled>{euros(owned.valueEur)}</Veiled>
            )}
          </span>
          {gain === null ? (
            owned.valueEur === null ? (
              <span className="text-[11px] text-state-warn">no price</span>
            ) : null
          ) : (
            <span className={`text-[11.5px] ${tone}`}>
              <Veiled>{`${up ? '+' : '−'}${euros(Math.abs(gain.eur))}`}</Veiled>
              {` · ${up ? '▲' : '▼'} ${Math.abs(gain.pct).toFixed(1)}%`}
            </span>
          )}
        </span>
        <ChevronRight className="hidden size-3.5 text-ink-600 sm:block" />
      </Link>
    </div>
  )
}
