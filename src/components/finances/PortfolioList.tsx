import { useState } from 'react'
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
import { Trades } from '@/components/finances/PortfolioTrades'
import { Veiled } from '@/components/finances/Veil'
import { useDayStarts } from '@/components/track/useDayStarts'
import { holdingLine, metalOf, unitOf } from '@/lib/holdingLine'
import type { Kind } from '@/lib/logo'
import { euros } from '@/lib/money'
import { combine, gainOf, ordered } from '@/lib/owned'
import type { Order, Owned } from '@/lib/owned'

const DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
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
  holders,
  filter,
  onFilter,
  kind,
}: {
  rows: ReadonlyArray<Position>
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

  return (
    <Panel
      title={`${chosen ? chosen.name : 'everything owned'} · ${shown.length}`}
      aside={
        <div className="flex flex-wrap gap-1.5">
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
    </Panel>
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
  const [open, setOpen] = useState(false)
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ animationDelay: `${delay}ms` }}
        className={`motion-press motion-arrive grid min-h-[62px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] px-2.5 py-2 text-left ring-1 transition-colors ring-inset sm:grid-cols-[38px_minmax(0,1fr)_96px_auto_14px] ${
          open
            ? 'bg-lav-400/8 ring-lav-400/35'
            : 'ring-transparent hover:bg-lav-400/[0.07] hover:ring-lav-400/30'
        }`}
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
            <span>{metalOf(owned.symbol) ?? owned.symbol.split('-')[0]}</span>
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
        <ChevronRight
          className={`hidden size-3.5 text-ink-600 transition-transform sm:block ${open ? 'rotate-90 text-lav-300' : ''}`}
        />
      </button>
      {open
        ? at.map(({ row, account }) => (
            <div key={row.accountId} className="flex flex-col">
              {at.length > 1 ? (
                <span className="mt-1 ml-6 flex items-center gap-1.5 pl-2.5 font-mono text-[10.5px] tracking-[0.12em] text-ink-400 uppercase">
                  <AccountLogo
                    name={account?.name ?? ''}
                    domain={account?.domain}
                    size={14}
                  />
                  {account?.name}
                  <span className="text-ink-200 normal-case">
                    {row.valueEur === null ? null : (
                      <Veiled>{euros(row.valueEur)}</Veiled>
                    )}
                  </span>
                </span>
              ) : null}
              <Trades
                accountId={row.accountId}
                instrumentId={row.instrumentId}
              />
            </div>
          ))
        : null}
    </div>
  )
}
