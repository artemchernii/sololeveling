import { useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Panel } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { euros } from '@/lib/money'
import { money } from '@/lib/currency'
import { EurUsd } from '@/components/finances/EurUsd'
import { PortfolioList } from '@/components/finances/PortfolioList'
import {
  PortfolioPosition,
  PositionMissing,
} from '@/components/finances/PortfolioPosition'
import { combine } from '@/lib/owned'
import { soldSums } from '@/lib/sold'
import type { Position } from '@/components/finances/PortfolioList'
import { ProfitPill, paidSums } from '@/components/finances/PortfolioParts'
import { kindOf } from '@/lib/logo'
import type { Kind } from '@/lib/logo'
import { SkeletonRows } from '@/components/Skeleton'

const DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

/* The Portfolio room (Treasury, 27 Sep). A card per account that holds
   shares — its logo, what it holds in all, the shares at the last stored
   close with their profit in green or red, what he paid for them, and its
   free cash — then every position with its line. Positions are worked out
   from every file dropped on the account (R6c): statements are the
   trades, screenshots what was seen; each row says whether they agree.
   Profit is value against what he paid (pick D, 26 Sep) — only where
   paid is known, never against zero. */
export function Portfolio({ position }: { position?: string }) {
  const data = useQuery(api.aggregate.positions, {})
  const worth = useQuery(api.aggregate.worth, {})
  const accounts = useQuery(api.accounts.list, {})
  const [filter, setFilter] = useState<Id<'accounts'> | 'all'>('all')
  const [kind, setKind] = useState<Kind | 'all'>('all')

  if (data === undefined || accounts === undefined || worth === undefined) {
    return (
      <Panel title="portfolio">
        <SkeletonRows rows={4} twoLine rowClassName="py-3" />
      </Panel>
    )
  }
  const holders = accounts.filter((a) =>
    data.rows.some((r) => r.accountId === a._id),
  )
  const sums = paidSums(data.rows, data.usdRate)

  /* One position has the room to itself (13 Oct): its own address — and
     so has a thing sold out, read with the accounts it was in. */
  if (position !== undefined) {
    /* Any of its listings is its address. */
    const has = (o: { at: ReadonlyArray<{ instrumentId: string }> }) =>
      o.at.some((r) => r.instrumentId === position)
    const owned = combine(data.rows).find(has)
    if (owned) return <PortfolioPosition owned={owned} holders={holders} />
    const gone = combine(data.sold).find(has)
    return gone ? (
      <PortfolioPosition
        owned={gone}
        holders={accounts}
        sold={soldSums(gone.paid, gone.at)}
      />
    ) : (
      <PositionMissing />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel title="portfolio · all accounts">
        {data.rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="text-[22px] font-light text-foreground">
              Nothing owned yet
            </span>
            <p className="max-w-[420px] text-[13.5px] leading-normal text-ink-400">
              Shares, funds, coins and gold show here, from a broker screenshot,
              a statement, or Trading 212 itself.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="flex flex-col gap-1">
              <span className="label-caps">worth now</span>
              <span className="text-[38px] leading-none font-light text-foreground">
                <EurUsd eur={data.totalEur} usdRate={data.usdRate} />
              </span>
            </div>
            {sums.known > 0 ? (
              <ProfitPill
                profit={sums.value - sums.paid}
                base={sums.paid}
                label={
                  sums.known === data.rows.length ? 'since bought' : undefined
                }
              />
            ) : null}
            {sums.knownUsd > 0 ? (
              <ProfitPill
                profit={sums.valueUsd - sums.paidUsd}
                base={sums.paidUsd}
                usd
              />
            ) : null}
            <span className="font-mono text-[11px] text-ink-500">
              {data.oldestPriceAsOf !== null
                ? `prices from ${DATE.format(new Date(data.oldestPriceAsOf))} · Yahoo Finance`
                : ''}
              {data.unvalued > 0
                ? ` · ${data.unvalued} without a price yet`
                : ''}
            </span>
          </div>
        )}
        {data.rows.length > 0 ? (
          <KindSplit rows={data.rows} kind={kind} onKind={setKind} />
        ) : null}
      </Panel>

      {holders.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {holders.map((a) => {
            const held = data.rows.filter((r) => r.accountId === a._id)
            const value = held.reduce((t, r) => t + (r.valueEur ?? 0), 0)
            const known = paidSums(held, data.usdRate)
            /* A bank that is also a broker: the cash beside its shares is
               its broker cash, not the bank's euros (10 Oct). */
            const both = a.kinds.includes('bank')
            const w = worth.byAccount.find((x) => x.accountId === a._id)
            const cash = (both ? w?.brokerCash : w?.cash) ?? null
            return (
              <button
                key={a._id}
                type="button"
                aria-pressed={filter === a._id}
                onClick={() => setFilter(filter === a._id ? 'all' : a._id)}
                className={`glass motion-press flex flex-col gap-3 rounded-[20px] p-4 text-left ring-1 transition-shadow ring-inset ${
                  filter === a._id ? 'ring-lav-400/55' : 'ring-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <AccountLogo name={a.name} domain={a.domain} size={34} />
                  <span className="flex-1 truncate text-[16px] text-foreground">
                    {a.name}
                  </span>
                  <span className="font-mono text-[10.5px] text-ink-500">
                    {held.length} positions
                  </span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="label-caps">total</span>
                  <span className="text-[28px] leading-none font-light text-foreground">
                    <Veiled>
                      {euros(Math.round((value + (cash ?? 0)) * 100) / 100)}
                    </Veiled>
                  </span>
                </span>
                <span className="flex flex-col gap-1.5 font-mono text-[12px]">
                  {/* One line a currency, each with its own gain, the
                      label on the first (10 Oct: "alignment is bad"). */}
                  <span className="flex items-start justify-between gap-2">
                    <span className="leading-[22px] text-ink-500">
                      investments
                    </span>
                    <span className="grid grid-cols-[auto_auto] items-center justify-end gap-x-2 gap-y-1">
                      <span className="text-right leading-[22px]">
                        <Veiled>{euros(Math.round(value * 100) / 100)}</Veiled>
                      </span>
                      <span className="flex justify-end">
                        {known.known > 0 ? (
                          <ProfitPill
                            profit={known.value - known.paid}
                            base={known.paid}
                            small
                          />
                        ) : null}
                      </span>
                      {data.usdRate ? (
                        <>
                          <span className="text-right leading-[22px] text-ink-400">
                            <Veiled>
                              {money(
                                Math.round((value / data.usdRate) * 100) / 100,
                                'USD',
                              )}
                            </Veiled>
                          </span>
                          <span className="flex justify-end">
                            {known.knownUsd > 0 ? (
                              <ProfitPill
                                profit={known.valueUsd - known.paidUsd}
                                base={known.paidUsd}
                                small
                                usd
                              />
                            ) : null}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">
                      {both ? 'broker cash' : 'free cash'}
                    </span>
                    <span>
                      {cash === null ? (
                        <span className="text-ink-600">missing</span>
                      ) : (
                        <Veiled>{euros(cash)}</Veiled>
                      )}
                    </span>
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {data.rows.length > 0 || data.sold.length > 0 ? (
        <PortfolioList
          rows={data.rows}
          sold={data.sold}
          holders={holders}
          filter={filter}
          onFilter={setFilter}
          kind={kind}
        />
      ) : null}
    </div>
  )
}

const KINDS: ReadonlyArray<{ kind: Kind; label: string; tone: string }> = [
  { kind: 'stock', label: 'stocks', tone: 'bg-lav-400' },
  { kind: 'etf', label: 'ETFs', tone: 'bg-area-knowledge' },
  { kind: 'gold', label: 'gold', tone: 'bg-money-cash' },
  { kind: 'crypto', label: 'crypto', tone: 'bg-state-warn' },
]

/* What he owns, by kind (4 Oct: "we gonna have etfs, stocks, crypto and
   gold"): the valued positions' sums, as a bar and its words. */
function KindSplit({
  rows,
  kind,
  onKind,
}: {
  rows: ReadonlyArray<Position>
  kind: Kind | 'all'
  onKind: (next: Kind | 'all') => void
}) {
  const sum = new Map<Kind, number>()
  for (const r of rows)
    if (r.valueEur !== null)
      sum.set(kindOf(r), (sum.get(kindOf(r)) ?? 0) + r.valueEur)
  const total = [...sum.values()].reduce((t, v) => t + v, 0)
  if (total <= 0) return null
  const parts = KINDS.filter((k) => (sum.get(k.kind) ?? 0) > 0)
  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full">
        {parts.map((k) => (
          <span
            key={k.kind}
            style={{ flex: sum.get(k.kind) }}
            className={`rounded-full ${k.tone} transition-[flex,opacity] duration-700 ${
              kind === 'all' || kind === k.kind ? '' : 'opacity-25'
            }`}
          />
        ))}
      </div>
      <div className="-mx-2 flex flex-wrap gap-x-1 gap-y-1">
        {parts.map((k) => {
          const v = sum.get(k.kind) ?? 0
          return (
            <button
              key={k.kind}
              type="button"
              aria-pressed={kind === k.kind}
              onClick={() => onKind(kind === k.kind ? 'all' : k.kind)}
              className={`label-caps motion-press flex items-center gap-1.5 rounded-[8px] px-2 py-1 transition-colors hover:bg-lift/[0.07] ${
                kind === k.kind ? 'bg-lift/[0.07] text-foreground' : ''
              }`}
            >
              <i className={`inline-block size-2 rounded-[2px] ${k.tone}`} />
              {k.label} <Veiled>{euros(Math.round(v))}</Veiled> ·{' '}
              {Math.round((v / total) * 100)}%
            </button>
          )
        })}
      </div>
    </div>
  )
}
