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
import { codesOf, holdingLine, unitOf } from '@/lib/holdingLine'
import { PartPill, TagChips, partOf } from '@/components/finances/PortfolioMap'
import type { Part, Tags } from '@/components/finances/PortfolioMap'
import { euros } from '@/lib/money'
import { combine, gainOf, matches, ordered } from '@/lib/owned'
import type { Order, Owned } from '@/lib/owned'
import { soldSums } from '@/lib/sold'
import {
  FindField,
  Lit,
  NoneFound,
  keepOrder,
  keptOrder,
} from '@/components/finances/PortfolioFind'

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

/** Sold things shown before "all", newest first. */
const SOLD_FIRST = 10

/** One account's side of a thing sold out: no shares, `paid` what its
    buys cost. */
export type Sold = Position & { soldFor: number | null; soldAt: number }

type Account = Pick<Doc<'accounts'>, '_id' | 'name' | 'domain'>

const ORDERS: ReadonlyArray<{ by: Order; label: string }> = [
  { by: 'worth', label: 'biggest' },
  { by: 'up', label: 'up most' },
  { by: 'down', label: 'down most' },
  { by: 'name', label: 'a–z' },
]

/** The find field shows from this many rows, owned and sold. */
const FIND_FROM = 6

/* Everything owned, one row a thing (12 Oct, mockup portfolio.html): the
   same company at two brokers is one row with both marks. Euros lead,
   shares sit small underneath (12 Oct: "amount is important"). */
export function PortfolioList({
  rows,
  sold,
  holders,
  filter,
  onFilter,
  part,
  onPart,
  tags,
}: {
  rows: ReadonlyArray<Position>
  sold: ReadonlyArray<Sold>
  holders: ReadonlyArray<Account>
  filter: Id<'accounts'> | 'all'
  onFilter: (next: Id<'accounts'> | 'all') => void
  part: Part
  onPart: (next: Part) => void
  tags: Tags
}) {
  /* A pressed part of the bar keeps its rows; sold things are not where
     the money is, so a sector or region keeps none of them. */
  const kept = (o: Owned) =>
    part === null || partOf(part.lens, o.at[0] ?? o, tags) === part.key
  const [order, setOrder] = useState<Order>(keptOrder)
  const [typed, setTyped] = useState('')
  const here = ordered(
    combine(rows.filter((r) => filter === 'all' || r.accountId === filter)),
    order,
  ).filter(kept)
  const shown = here.filter((o) => matches(o, typed))
  const chosen = holders.find((a) => a._id === filter)
  /* Sold is folded away until asked for (mockup portfolio.html). */
  const [showSold, setShowSold] = useState(false)
  /* The newest few first (13 Oct: 151 sold things were one long list);
     the rest behind one press. */
  const [allSold, setAllSold] = useState(false)
  const goneHere = combine(
    sold.filter((r) => filter === 'all' || r.accountId === filter),
  )
    .filter((o) => part === null || (part.lens === 'kind' && kept(o)))
    .map((o) => ({ owned: o, sums: soldSums(o.paid, o.at) }))
    .sort((a, b) => b.sums.day - a.sums.day)
  const gone = goneHere.filter((g) => matches(g.owned, typed))
  /* Nothing owned here, only sold: the sold rows are the list. */
  const only = here.length === 0 && goneHere.length > 0
  const finding = typed.trim() !== ''
  /* Only sold things match: they open by themselves. */
  const soldOpen = showSold || only || (finding && shown.length === 0)
  const count = (n: number, of: number) => (finding ? `${n} of ${of}` : of)

  return (
    <Panel
      title={
        only
          ? `${chosen ? `${chosen.name} · ` : ''}sold · ${count(gone.length, goneHere.length)}`
          : `${chosen ? chosen.name : 'everything owned'} · ${count(shown.length, here.length)}`
      }
      aside={
        <div className="flex flex-wrap gap-1.5">
          <PartPill part={part} onClear={() => onPart(null)} />
          {(here.length > 1 ? ORDERS : []).map((o) => (
            <button
              key={o.by}
              type="button"
              aria-pressed={order === o.by}
              onClick={() => {
                setOrder(o.by)
                keepOrder(o.by)
              }}
              className={order === o.by ? PILL_LOUD : PILL_QUIET}
            >
              {o.label}
            </button>
          ))}
        </div>
      }
    >
      {here.length + goneHere.length >= FIND_FROM ? (
        <FindField value={typed} onChange={setTyped} />
      ) : null}
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
            delay={finding ? 0 : i * 28}
            typed={typed}
            tags={tags}
          />
        ))}
      </div>
      {finding && shown.length === 0 && gone.length === 0 ? (
        <NoneFound typed={typed} onClear={() => setTyped('')} />
      ) : null}
      {gone.length > 0 ? (
        <>
          {only ? null : (
            <button
              type="button"
              aria-expanded={soldOpen}
              onClick={() => setShowSold(!showSold)}
              className="label-caps motion-press flex items-center gap-1.5 self-start rounded-[8px] px-2 py-1.5 transition-colors hover:bg-lift/[0.07] hover:text-foreground"
            >
              <ChevronRight
                className={`size-3.5 transition-transform duration-300 ${soldOpen ? 'rotate-90' : ''}`}
              />
              sold · {gone.length}
            </button>
          )}
          {soldOpen ? (
            <div className="flex flex-col gap-0.5">
              {(allSold ? gone : gone.slice(0, SOLD_FIRST)).map(
                ({ owned, sums }, i) => (
                  <SoldRow
                    key={owned.instrumentId}
                    owned={owned}
                    sums={sums}
                    delay={finding ? 0 : Math.min(i, 12) * 28}
                    typed={typed}
                  />
                ),
              )}
              {!allSold && gone.length > SOLD_FIRST ? (
                <button
                  type="button"
                  onClick={() => setAllSold(true)}
                  className="motion-press mt-1 self-start rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase ring-1 ring-lav-400/40 ring-inset hover:bg-lav-400/10"
                >
                  all {gone.length}
                </button>
              ) : null}
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
  typed,
}: {
  owned: Owned<Sold>
  sums: ReturnType<typeof soldSums>
  delay: number
  typed: string
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
            <Lit text={owned.name} typed={typed} />
          </span>
          <span className="truncate font-mono text-[11px] text-ink-500">
            <Lit text={codesOf(owned)} typed={typed} /> · all sold{' '}
            {FULL.format(new Date(sums.day))}
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
  typed,
  tags,
}: {
  owned: Owned<Position>
  holders: ReadonlyArray<Account>
  delay: number
  typed: string
  tags: Tags
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
            <Lit text={owned.name} typed={typed} />
          </span>
          <span className="flex items-center gap-1.5 overflow-hidden font-mono text-[11px] whitespace-nowrap text-ink-500">
            <span>
              <Lit text={codesOf(owned)} typed={typed} />
            </span>
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
          <TagChips tags={tags.get(first.instrumentId)} />
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
