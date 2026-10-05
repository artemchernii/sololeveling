import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  PILL_LOUD,
  PILL_QUIET,
  Panel,
  Sparkline,
} from '@/components/finances/bits'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { useDayStarts } from '@/components/track/useDayStarts'
import { euros } from '@/lib/money'
import { UNPRICED } from '@/lib/market'
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
export function Portfolio() {
  const data = useQuery(api.aggregate.positions, {})
  const worth = useQuery(api.aggregate.worth, {})
  const accounts = useQuery(api.accounts.list, {})
  const [filter, setFilter] = useState<Id<'accounts'> | 'all'>('all')

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
  const rows = data.rows.filter(
    (r) => filter === 'all' || r.accountId === filter,
  )
  const sums = paidSums(data.rows)

  return (
    <div className="flex flex-col gap-3">
      <Panel title="portfolio · all accounts">
        {data.rows.length === 0 ? (
          <p className="py-4 text-center text-[13.5px] text-ink-400">
            No positions yet. Press + and drop a screenshot of your
            broker&apos;s holdings — each position is matched to its ticker, and
            you check it before it lands.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="flex flex-col gap-1">
              <span className="label-caps">worth now</span>
              <span className="text-[38px] leading-none font-light text-foreground">
                <Veiled>{euros(data.totalEur)}</Veiled>
              </span>
            </div>
            {sums.known > 0 ? (
              <ProfitPill
                profit={sums.value - sums.paid}
                base={sums.paid}
                label={
                  sums.known === data.rows.length
                    ? 'since bought'
                    : `on ${sums.known} of ${data.rows.length}`
                }
              />
            ) : null}
            <span className="font-mono text-[11px] text-ink-500">
              {sums.known === 0 ? (
                'put in: unknown until a statement comes'
              ) : (
                <>
                  put in{' '}
                  <Veiled>{euros(Math.round(sums.paid * 100) / 100)}</Veiled>
                  {sums.known < data.rows.length
                    ? ` for ${sums.known} of ${data.rows.length}`
                    : ''}
                </>
              )}
              {data.oldestPriceAsOf !== null
                ? ` · closes as of ${DATE.format(new Date(data.oldestPriceAsOf))} · Yahoo Finance`
                : ''}
              {data.unvalued > 0
                ? ` · ${data.unvalued} without a price yet`
                : ''}
            </span>
          </div>
        )}
        {data.rows.length > 0 ? <KindSplit rows={data.rows} /> : null}
      </Panel>

      {holders.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {holders.map((a) => {
            const held = data.rows.filter((r) => r.accountId === a._id)
            const value = held.reduce((t, r) => t + (r.valueEur ?? 0), 0)
            const known = paidSums(held)
            const cash =
              worth.byAccount.find((w) => w.accountId === a._id)?.cash ?? null
            return (
              <section
                key={a._id}
                className="glass flex flex-col gap-3 rounded-[20px] p-4"
              >
                <div className="flex items-center gap-2.5">
                  <AccountLogo name={a.name} domain={a.domain} size={34} />
                  <span className="flex-1 truncate text-[16px] text-foreground">
                    {a.name}
                  </span>
                  <span className="font-mono text-[10.5px] text-ink-500">
                    {held.length} positions
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="label-caps">total</span>
                  <span className="text-[28px] leading-none font-light text-foreground">
                    <Veiled>
                      {euros(Math.round((value + (cash ?? 0)) * 100) / 100)}
                    </Veiled>
                  </span>
                </div>
                <div className="flex flex-col gap-1.5 font-mono text-[12px]">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">investments</span>
                    <span className="flex items-center gap-2">
                      <Veiled>{euros(Math.round(value * 100) / 100)}</Veiled>
                      {known.known > 0 ? (
                        <ProfitPill
                          profit={known.value - known.paid}
                          base={known.paid}
                          small
                        />
                      ) : null}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    {/* Buys less what sells brought back (4 Oct: "you paid
                        for them" was not clear). */}
                    <span className="text-ink-500">put in</span>
                    {known.known === 0 ? (
                      <span className="text-ink-600">unknown</span>
                    ) : (
                      <span>
                        <Veiled>
                          {euros(Math.round(known.paid * 100) / 100)}
                        </Veiled>
                        {known.known < held.length ? (
                          <span className="text-ink-600">
                            {' '}
                            · {known.known} of {held.length}
                          </span>
                        ) : null}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">free cash</span>
                    <span>
                      {cash === null ? (
                        <span className="text-ink-600">not typed</span>
                      ) : (
                        <Veiled>{euros(cash)}</Veiled>
                      )}
                    </span>
                  </span>
                </div>
              </section>
            )
          })}
        </div>
      ) : null}

      {data.rows.length > 0 ? (
        <Panel
          title="positions"
          aside={
            holders.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={filter === 'all' ? PILL_LOUD : PILL_QUIET}
                >
                  all
                </button>
                {holders.map((a) => (
                  <button
                    key={a._id}
                    type="button"
                    onClick={() => setFilter(a._id)}
                    className={filter === a._id ? PILL_LOUD : PILL_QUIET}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-1">
            {rows.map((r, i) => (
              <PositionRow
                key={`${r.accountId}:${r.instrumentId}`}
                row={r}
                account={
                  accounts.find((a) => a._id === r.accountId)?.name ?? ''
                }
                delay={i * 30}
              />
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  )
}

/* What was paid and what it is worth, over the rows where both are known
   — a profit is never shown against a cost no file gave. */
export function paidSums(
  rows: ReadonlyArray<{ paid: number | null; valueEur: number | null }>,
) {
  let paid = 0
  let value = 0
  let known = 0
  for (const r of rows) {
    if (r.paid === null || r.valueEur === null) continue
    paid += r.paid
    value += r.valueEur
    known++
  }
  return { paid, value, known }
}

/* Profit in green, loss in red — the one place colour means a quantity's
   direction, allowed for P&L in Finances (26 Sep). */
export function ProfitPill({
  profit,
  base,
  label,
  small = false,
}: {
  profit: number
  base: number
  label?: string
  small?: boolean
}) {
  const up = profit >= 0
  const pct = base > 0 ? (profit / base) * 100 : 0
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-[8px] bg-lift/[0.06] font-mono ${small ? 'px-1.5 py-0.5 text-[11px]' : 'px-3 py-1.5 text-[15px]'} ${up ? 'text-state-good' : 'text-state-danger'}`}
    >
      <Veiled>{`${up ? '+' : '−'}${euros(Math.abs(Math.round(profit * 100) / 100))}`}</Veiled>
      <span>{`${up ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`}</span>
      {label ? <span className="text-[11px] text-ink-500">{label}</span> : null}
    </span>
  )
}

type Position = {
  accountId: Id<'accounts'>
  instrumentId: Id<'instruments'>
  symbol: string
  name: string
  type: string
  currency: string
  shares: number
  paid: number | null
  status: 'trades' | 'match' | 'screen' | 'gap' | 'over'
  seenAt: number | null
  gap: number
  notSeen: boolean
  price: number | null
  priceAsOf: number | null
  valueEur: number | null
  staked: number
}

function PositionRow({
  row,
  account,
  delay,
}: {
  row: Position
  account: string
  delay: number
}) {
  const today = useDayStarts(1).at(-1) as number
  const line = useQuery(api.invest.priceLine, {
    instrumentId: row.instrumentId,
    since: today - 90 * 86_400_000,
  })
  const [open, setOpen] = useState(false)
  const profit =
    row.valueEur === null || row.paid === null ? null : row.valueEur - row.paid
  const up = (profit ?? 0) >= 0
  const said = standing(row)
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ animationDelay: `${delay}ms` }}
        className={`motion-press motion-land flex min-h-16 items-center gap-3 rounded-[14px] px-2.5 py-2 text-left ring-1 transition-colors ring-inset ${
          open
            ? 'bg-lav-400/8 ring-lav-400/35'
            : 'ring-transparent hover:bg-lift/[0.03] hover:ring-lift/12'
        }`}
      >
        <TickerLogo
          symbol={row.symbol}
          type={row.type}
          name={row.name}
          size={34}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14.5px] text-foreground">
            {row.name}
          </span>
          <span className="truncate font-mono text-[11px] text-ink-500">
            {row.symbol.split('-')[0]} · {account} ·{' '}
            <Veiled>{`${row.shares} ${unitOf(row)}`}</Veiled>
          </span>
          {row.staked > 0 ? (
            <span className="truncate font-mono text-[10.5px] text-state-good">
              +{row.staked < 10 ? row.staked.toFixed(2) : row.staked.toFixed(1)}{' '}
              {unitOf(row)} free from staking
            </span>
          ) : null}
          <span
            className={`truncate font-mono text-[10.5px] ${said.warn ? 'text-state-warn' : 'text-ink-500'}`}
          >
            {said.warn ? '⚠ ' : said.ok ? '✓ ' : ''}
            {said.text}
          </span>
        </span>
        <Sparkline
          className="hidden h-8 w-24 sm:block"
          points={(line ?? []).map((p) => ({ t: p.asOf, v: p.price }))}
        />
        <span className="flex w-28 flex-col items-end">
          <span className="font-mono text-[14.5px] text-foreground">
            {row.valueEur === null ? (
              '—'
            ) : (
              <Veiled>{euros(row.valueEur)}</Veiled>
            )}
          </span>
          {profit === null ? (
            <span className="font-mono text-[10.5px] text-ink-500">
              {row.valueEur === null ? 'price on its way' : 'paid unknown'}
            </span>
          ) : (
            <span
              className={`font-mono text-[11.5px] ${up ? 'text-state-good' : 'text-state-danger'}`}
            >
              {up ? '▲' : '▼'}{' '}
              {Math.abs(
                row.paid && row.paid > 0 ? (profit / row.paid) * 100 : 0,
              ).toFixed(2)}
              %
            </span>
          )}
        </span>
      </button>
      {open ? (
        <Trades accountId={row.accountId} instrumentId={row.instrumentId} />
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
function KindSplit({ rows }: { rows: ReadonlyArray<Position> }) {
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
            className={`rounded-full ${k.tone} transition-[flex] duration-700`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((k) => {
          const v = sum.get(k.kind) ?? 0
          return (
            <span key={k.kind} className="label-caps flex items-center gap-1.5">
              <i className={`inline-block size-2 rounded-[2px] ${k.tone}`} />
              {k.label} <Veiled>{euros(Math.round(v))}</Veiled> ·{' '}
              {Math.round((v / total) * 100)}%
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** "sh" for a share, the coin's own symbol for a coin. */
function unitOf(row: Pick<Position, 'symbol' | 'type'>): string {
  return kindOf(row) === 'crypto' ? row.symbol.split('-')[0] : 'sh'
}

/* Where the row's number came from, in a line: which files agree. */
function standing(row: Position): {
  text: string
  warn: boolean
  ok: boolean
} {
  const day = row.seenAt === null ? '' : DATE.format(new Date(row.seenAt))
  /* Frozen: no market prices it, the broker's screen does. */
  if (row.type === UNPRICED && !row.notSeen)
    return {
      text: `no market price · the ${row.priceAsOf === null ? day : DATE.format(new Date(row.priceAsOf))} screen's value`,
      warn: false,
      ok: false,
    }
  if (row.notSeen)
    return {
      text: `not on the latest screenshot — last seen ${day}`,
      warn: true,
      ok: false,
    }
  /* A coin's amount is its statement's closing amount (4 Oct). */
  if (kindOf(row) === 'crypto' && row.seenAt !== null) {
    const unit = unitOf(row)
    if (row.status === 'match')
      return { text: `matches the ${day} statement`, warn: false, ok: true }
    if (row.status === 'gap' || row.status === 'over')
      return {
        text: `the ${day} statement has ${Math.abs(row.gap)} ${unit} ${row.gap > 0 ? 'more' : 'less'} than its trades add up to — its amount is used`,
        warn: false,
        ok: true,
      }
  }
  switch (row.status) {
    case 'match':
      return {
        text: `statement and ${day} screen agree`,
        warn: false,
        ok: true,
      }
    case 'trades':
      return { text: 'from statements', warn: false, ok: false }
    case 'screen':
      return {
        text:
          row.paid === null
            ? `${day} screen · drop a statement for what you paid`
            : `${day} screen`,
        warn: false,
        ok: false,
      }
    case 'gap':
      return {
        text: `${day} screen shows ${row.gap} sh more than the statements — one is missing`,
        warn: true,
        ok: false,
      }
    case 'over':
      return {
        text: `statements show ${-row.gap} sh more than the ${day} screen — a sell is missing`,
        warn: true,
        ok: false,
      }
  }
}

function Trades({
  accountId,
  instrumentId,
}: {
  accountId: Id<'accounts'>
  instrumentId: Id<'instruments'>
}) {
  const rows = useQuery(api.invest.trades, { accountId, instrumentId })
  const looks = useQuery(api.invest.looks, { accountId, instrumentId })
  const remove = useMutation(api.invest.removeTrade)
  return (
    <div className="motion-arrive ml-6 flex flex-col border-l border-lav-400/20 py-1 pl-2.5">
      {(looks ?? []).map((h) => (
        <div
          key={h._id}
          className="flex min-h-9 items-center gap-2.5 text-[13px]"
        >
          <span className="w-10 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase">
            seen
          </span>
          <span className="flex-1 text-ink-200">
            <Veiled>{`${h.shares} sh`}</Veiled>
            {h.paidEur !== undefined ? (
              <span className="text-ink-400">
                {' '}
                · paid <Veiled>{euros(h.paidEur)}</Veiled>
              </span>
            ) : null}
            <span className="ml-2 font-mono text-[10px] text-ink-600">
              {h.sharesCalculated
                ? 'screenshot · shares worked out'
                : 'screenshot'}
            </span>
          </span>
          <span className="font-mono text-[11px] text-ink-500">
            {DATE.format(new Date(h.asOf))}
          </span>
          <span className="size-5" />
        </div>
      ))}
      {(rows ?? []).map((t) => (
        <div
          key={t._id}
          className="group flex min-h-9 items-center gap-2.5 text-[13px]"
        >
          <span
            className={`w-10 font-mono text-[10.5px] tracking-[0.12em] uppercase ${
              t.side === 'buy' ? 'text-area' : 'text-ink-300'
            }`}
          >
            {t.side}
          </span>
          <span className="flex-1 text-ink-200">
            <Veiled>
              {t.shares} × {euros(t.priceEur)}
            </Veiled>
            {t.importId ? (
              <span className="ml-2 font-mono text-[10px] text-ink-600">
                {t.opening ? 'held when first read' : 'from a statement'}
              </span>
            ) : null}
          </span>
          <span className="font-mono text-[11px] text-ink-500">
            {DATE.format(new Date(t.occurredAt))}
          </span>
          <button
            type="button"
            aria-label="Remove this trade"
            onClick={() => void remove({ tradeId: t._id })}
            className="grid size-5 place-items-center rounded-[6px] text-ink-700 opacity-0 group-hover:opacity-100 hover:text-state-danger [@media(hover:none)]:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
