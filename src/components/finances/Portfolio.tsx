import { useEffect, useRef, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, Loader2, Plus, Search, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import {
  FIELD,
  PILL_LOUD,
  PILL_QUIET,
  Panel,
  Sparkline,
} from '@/components/finances/bits'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { Sparks } from '@/components/track/Sparks'
import { useDayStarts } from '@/components/track/useDayStarts'
import type { Candidate } from '@/lib/market'
import { euros } from '@/lib/money'
import { SkeletonRows } from '@/components/Skeleton'

const DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

/* The Portfolio room (Treasury, 27 Sep). A card per account that holds
   shares — its logo, what it holds in all, the shares at the last stored
   close with their profit in green or red, what he paid for them, and its
   free cash — then every position with its line. Positions come in by the
   batch from a broker screenshot (+ → drop files); a single buy or sell
   can still be typed here. Profit is value against what he paid: allowed
   in Finances since 26 Sep (pick D). */
export function Portfolio() {
  const data = useQuery(api.aggregate.positions, {})
  const worth = useQuery(api.aggregate.worth, {})
  const accounts = useQuery(api.accounts.list, {})
  const [adding, setAdding] = useState(false)
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
  const totalPaid = data.rows.reduce((t, r) => t + r.putIn, 0)
  const profit = data.totalEur - totalPaid

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="shares · all brokers"
        aside={
          <button
            type="button"
            onClick={() => setAdding((a) => !a)}
            className={adding ? PILL_LOUD : PILL_QUIET}
          >
            {adding ? <X className="size-3" /> : <Plus className="size-3" />}
            buy / sell
          </button>
        }
      >
        {adding && accounts.length > 0 ? (
          <AddTrade accounts={accounts} onDone={() => setAdding(false)} />
        ) : null}
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
            <ProfitPill profit={profit} base={totalPaid} label="since bought" />
            <span className="font-mono text-[11px] text-ink-500">
              you paid{' '}
              <Veiled>{euros(Math.round(totalPaid * 100) / 100)}</Veiled>
              {data.oldestPriceAsOf !== null
                ? ` · closes as of ${DATE.format(new Date(data.oldestPriceAsOf))} · Yahoo Finance`
                : ''}
              {data.unvalued > 0
                ? ` · ${data.unvalued} without a price yet`
                : ''}
            </span>
          </div>
        )}
      </Panel>

      {holders.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {holders.map((a) => {
            const held = data.rows.filter((r) => r.accountId === a._id)
            const value = held.reduce((t, r) => t + (r.valueEur ?? 0), 0)
            const paid = held.reduce((t, r) => t + r.putIn, 0)
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
                    <span className="text-ink-500">shares worth</span>
                    <span className="flex items-center gap-2">
                      <Veiled>{euros(Math.round(value * 100) / 100)}</Veiled>
                      <ProfitPill profit={value - paid} base={paid} small />
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-ink-500">you paid for them</span>
                    <Veiled>{euros(Math.round(paid * 100) / 100)}</Veiled>
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

/* Profit in green, loss in red — the one place colour means a quantity's
   direction, allowed for P&L in Finances (26 Sep). */
function ProfitPill({
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
  putIn: number
  price: number | null
  priceAsOf: number | null
  valueEur: number | null
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
  const profit = row.valueEur === null ? null : row.valueEur - row.putIn
  const up = (profit ?? 0) >= 0
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
        <TickerLogo symbol={row.symbol} size={34} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[14.5px] text-foreground">
            {row.name}
          </span>
          <span className="truncate font-mono text-[11px] text-ink-500">
            {row.symbol} · {account} · <Veiled>{`${row.shares} sh`}</Veiled>
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
              price on its way
            </span>
          ) : (
            <span
              className={`font-mono text-[11.5px] ${up ? 'text-state-good' : 'text-state-danger'}`}
            >
              {up ? '▲' : '▼'}{' '}
              {Math.abs(row.putIn > 0 ? (profit / row.putIn) * 100 : 0).toFixed(
                2,
              )}
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

function Trades({
  accountId,
  instrumentId,
}: {
  accountId: Id<'accounts'>
  instrumentId: Id<'instruments'>
}) {
  const rows = useQuery(api.invest.trades, { accountId, instrumentId })
  const remove = useMutation(api.invest.removeTrade)
  return (
    <div className="motion-arrive ml-6 flex flex-col border-l border-lav-400/20 py-1 pl-2.5">
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
                from screenshot
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

/* Type "tsla" or an ISIN; pick what the market calls it. */
function TickerSearch({
  initial = '',
  onPick,
}: {
  initial?: string
  onPick: (c: Candidate) => void
}) {
  const search = useAction(api.market.search)
  const [q, setQ] = useState(initial)
  const [results, setResults] = useState<Array<Candidate> | null>(null)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults(null)
      return
    }
    const mine = ++seq.current
    setBusy(true)
    const timer = setTimeout(() => {
      search({ q: term })
        .then((r) => {
          if (mine === seq.current) setResults(r)
        })
        .catch(() => {
          if (mine === seq.current) setResults([])
        })
        .finally(() => {
          if (mine === seq.current) setBusy(false)
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [q, search])

  return (
    <div className="flex flex-col gap-1.5">
      <label className={`${FIELD} flex items-center gap-2`}>
        {busy ? (
          <Loader2 className="size-4 animate-spin text-lav-400" />
        ) : (
          <Search className="size-4 text-ink-500" />
        )}
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="tsla, vwce, an ISIN…"
          aria-label="Find a ticker"
          className="w-full bg-transparent focus:outline-none"
        />
      </label>
      {results !== null ? (
        results.length === 0 ? (
          <span className="px-1 font-mono text-[11px] text-ink-500">
            nothing found
          </span>
        ) : (
          <div className="flex flex-col">
            {results.map((c) => (
              <button
                key={c.symbol}
                type="button"
                onClick={() => onPick(c)}
                className="motion-press flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left hover:bg-lav-400/10"
              >
                <span className="w-20 shrink-0 font-mono text-[12px] text-area">
                  {c.symbol}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-100">
                  {c.name}
                </span>
                <span className="font-mono text-[10.5px] text-ink-500">
                  {c.exchange} · {c.type.toLowerCase()}
                </span>
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  )
}

function AccountPick({
  accounts,
  value,
  onChange,
}: {
  accounts: Array<Doc<'accounts'>>
  value: Id<'accounts'>
  onChange: (id: Id<'accounts'>) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {accounts.map((a) => (
        <button
          key={a._id}
          type="button"
          aria-pressed={value === a._id}
          onClick={() => onChange(a._id)}
          className={value === a._id ? PILL_LOUD : PILL_QUIET}
        >
          {a.name}
        </button>
      ))}
    </div>
  )
}

function AddTrade({
  accounts,
  onDone,
}: {
  accounts: Array<Doc<'accounts'>>
  onDone: () => void
}) {
  const add = useMutation(api.invest.addTrade)
  const [accountId, setAccountId] = useState(accounts[0]._id)
  const [ticker, setTicker] = useState<Candidate | null>(null)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [burst, setBurst] = useState(0)

  async function save() {
    if (ticker === null) return
    const at = new Date(`${date}T12:00:00`).getTime()
    try {
      await add({
        accountId,
        candidate: ticker,
        side,
        shares: Number(shares.replace(',', '.')),
        priceEur: Number(price.replace(',', '.')),
        occurredAt: Math.min(at, Date.now()),
      })
      setBurst((b) => b + 1)
      setTimeout(onDone, 500)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*: /, '').split('\n')[0]
          : 'Not saved',
      )
    }
  }

  return (
    <div className="motion-arrive flex flex-col gap-2.5 rounded-[14px] bg-lav-400/6 p-3 ring-1 ring-lav-400/25 ring-inset">
      <AccountPick
        accounts={accounts}
        value={accountId}
        onChange={setAccountId}
      />
      {ticker === null ? (
        <TickerSearch onPick={setTicker} />
      ) : (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] text-area">
            {ticker.symbol}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-200">
            {ticker.name}
          </span>
          <button
            type="button"
            onClick={() => setTicker(null)}
            className={PILL_QUIET}
          >
            change
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {(['buy', 'sell'] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={side === s}
            onClick={() => setSide(s)}
            className={side === s ? PILL_LOUD : PILL_QUIET}
          >
            {s}
          </button>
        ))}
        <input
          inputMode="decimal"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
          placeholder="shares"
          aria-label="Shares"
          className={`${FIELD} w-24`}
        />
        <label className={`${FIELD} inline-flex w-36 items-center gap-1`}>
          <span className="text-ink-400">€</span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="per share"
            aria-label="Price per share in euros"
            className="w-full bg-transparent focus:outline-none"
          />
        </label>
        <input
          type="date"
          value={date}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Date"
          className={FIELD}
        />
        <button
          type="button"
          disabled={ticker === null}
          onClick={() => void save()}
          className={`relative ${PILL_LOUD} disabled:opacity-40`}
        >
          <Check className="size-3" />
          save
          {burst > 0 ? <Sparks key={burst} count={12} reach={34} /> : null}
        </button>
      </div>
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
    </div>
  )
}
