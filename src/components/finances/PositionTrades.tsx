import { useState } from 'react'
import { useMutation } from 'convex/react'
import { ChevronDown, Loader2, Trash2, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'

import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { euros } from '@/lib/money'
import type { Round } from '@/lib/rounds'

const FULL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
/** Rows of the round now shown before "all". */
const FIRST = 8

/* Every buy and sell of one position, in euros, newest first — what its
   sums are made of (13 Oct; split out of PortfolioPosition). Cut into
   rounds where it was held at zero (14 Oct, mockup position-rounds.html):
   the round now open, each closed one folded with its own BUY and SELL
   sums. */
export function PositionTrades({
  loaded,
  all,
  cut,
  unit,
  accountOf,
}: {
  loaded: boolean
  all: ReadonlyArray<Doc<'trades'>>
  cut: ReadonlyArray<Round<Doc<'trades'>>>
  unit: (n: number) => string
  accountOf: (
    id: Id<'accounts'>,
  ) => Pick<Doc<'accounts'>, 'name' | 'domain'> | undefined
}) {
  /* A long round shows its newest rows; the rest is one press away. */
  const [whole, setWhole] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set())
  const row = (t: Doc<'trades'>, i: number) => (
    <TradeRow
      key={t._id}
      trade={t}
      i={i}
      unit={unit}
      account={accountOf(t.accountId)}
    />
  )
  return (
    <div className="flex flex-col rounded-[16px] bg-lift/[0.025] p-3.5 ring-1 ring-lift/8 ring-inset">
      <span className="label-caps mb-1">
        buys and sells{loaded && all.length > 0 ? ` · ${all.length}` : ''}
      </span>
      {!loaded ? (
        <span className="py-3 font-mono text-[11px] text-ink-500">
          reading…
        </span>
      ) : all.length === 0 ? (
        <span className="py-3 font-mono text-[11px] text-ink-400">
          0 BUY · 0 SELL
        </span>
      ) : (
        cut.map((r, k) => {
          /* Sold out: its last round is the page, open at first. */
          const lead = k === 0 && !r.open
          const shown = r.open || (lead ? !open.has(k) : open.has(k))
          const rows = r.open && !whole ? r.trades.slice(0, FIRST) : r.trades
          return (
            <div
              key={r.from}
              data-testid={r.open ? 'round-now' : 'round-closed'}
              className={r.open ? '' : '[&_[data-testid=trade-row]]:opacity-75'}
            >
              <RoundHead
                round={r}
                shown={shown}
                first={k === 0}
                onToggle={
                  r.open
                    ? undefined
                    : () =>
                        setOpen((o) => {
                          const n = new Set(o)
                          if (n.has(k)) n.delete(k)
                          else n.add(k)
                          return n
                        })
                }
              />
              {shown ? rows.map(row) : null}
              {r.open && !whole && r.trades.length > FIRST ? (
                <button
                  type="button"
                  onClick={() => setWhole(true)}
                  className="motion-press my-1 rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase ring-1 ring-lav-400/40 ring-inset hover:bg-lav-400/10"
                >
                  all {r.trades.length}
                </button>
              ) : null}
            </div>
          )
        })
      )}
    </div>
  )
}

/** A round's line: NOW and its first day, or CLOSED and its two days,
    with its BUY and SELL sums as badges. */
function RoundHead({
  round: r,
  shown,
  first,
  onToggle,
}: {
  round: Round<Doc<'trades'>>
  shown: boolean
  first: boolean
  onToggle?: () => void
}) {
  const body = (
    <>
      <span
        className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${r.open ? 'bg-lav-400/16 text-lav-300' : 'bg-lift/[0.06] text-ink-300'}`}
      >
        {r.open ? 'now' : 'closed'}
      </span>
      <span className="font-mono text-[11px] text-ink-300">
        {r.open
          ? `since ${FULL.format(new Date(r.from))}`
          : `${FULL.format(new Date(r.from))} → ${FULL.format(new Date(r.to))}`}
      </span>
      <span className="flex-1" />
      {r.buys > 0 ? (
        <span className="rounded-full bg-state-good/14 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-state-good uppercase">
          <Veiled>{`${r.buys} buy · ${euros(r.buyEur)}`}</Veiled>
        </span>
      ) : null}
      {r.sells > 0 ? (
        <span className="rounded-full bg-state-danger/14 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-state-danger uppercase">
          <Veiled>{`${r.sells} sell · ${euros(r.sellEur)}`}</Veiled>
        </span>
      ) : null}
      {onToggle ? (
        <ChevronDown
          className={`size-3.5 shrink-0 text-ink-400 transition-transform ${shown ? 'rotate-180' : ''}`}
        />
      ) : null}
    </>
  )
  const look = `flex w-full flex-wrap items-center gap-2 pt-2.5 pb-2 text-left ${first ? '' : 'mt-1 border-t border-lift/8'}`
  return onToggle ? (
    <button
      type="button"
      aria-expanded={shown}
      onClick={onToggle}
      className={`motion-press ${look}`}
    >
      {body}
    </button>
  ) : (
    <div className={look}>{body}</div>
  )
}

/** One buy or sell: its badge, what it came to, its units and day. The ×
    asks first, on the row — REMOVE or KEEP (14 Oct night: the × took his
    MSFT buy away with no question; mockup trade-remove.html). */
function TradeRow({
  trade: t,
  i,
  unit,
  account: a,
}: {
  trade: Doc<'trades'>
  i: number
  unit: (n: number) => string
  account: Pick<Doc<'accounts'>, 'name' | 'domain'> | undefined
}) {
  const remove = useMutation(api.invest.removeTrade)
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const free = t.reward || t.split
  const sell = t.side === 'sell'
  const go = async () => {
    setBusy(true)
    try {
      await remove({ tradeId: t._id })
    } catch {
      setBusy(false)
    }
  }
  return (
    <div
      data-testid="trade-row"
      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
      className={`motion-arrive -mx-2 grid items-center gap-3 rounded-[10px] border-t border-lift/6 px-2 py-2.5 transition-colors ${ask ? 'grid-cols-[64px_minmax(0,1fr)] bg-state-warn/[0.08] ring-1 ring-state-warn/40 ring-inset sm:grid-cols-[64px_minmax(0,1fr)_auto]' : 'grid-cols-[64px_minmax(0,1fr)_16px_20px] sm:grid-cols-[64px_minmax(0,1fr)_auto_16px_20px]'}`}
    >
      <span
        className={`justify-self-start rounded-full px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.12em] uppercase ring-1 ring-inset ${sell ? 'bg-state-danger/16 text-state-danger ring-state-danger/35' : 'bg-state-good/16 text-state-good ring-state-good/35'}`}
      >
        {t.reward ? 'staking' : t.split ? 'split' : t.side}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[17px] font-medium text-foreground tabular-nums">
          <Veiled>
            {free
              ? `${t.shares} ${unit(t.shares)}`
              : euros(Math.round(t.shares * t.priceEur * 100) / 100)}
          </Veiled>
        </span>
        <span className="truncate font-mono text-[11px] text-ink-300">
          {t.reward ? (
            'not counted as income'
          ) : t.split ? (
            'added by a split'
          ) : (
            <>
              <b className="font-medium text-foreground">
                <Veiled>{String(t.shares)}</Veiled>
              </b>{' '}
              {unit(t.shares)}
              <span className="max-sm:hidden">{` at ${euros(t.priceEur)}`}</span>
              <span className="sm:hidden">{` · ${FULL.format(new Date(t.occurredAt))}`}</span>
              {t.opening ? ' · owned before the first file' : ''}
            </>
          )}
        </span>
      </span>
      {ask ? (
        <span className="motion-land col-span-2 flex items-center justify-end gap-1.5 sm:col-span-1">
          <span className="rounded-full bg-state-warn/16 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-state-warn uppercase">
            remove?
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void go()}
            className="motion-press inline-flex items-center gap-1.5 rounded-full bg-state-danger px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-background uppercase disabled:opacity-80"
          >
            {busy ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Trash2 className="size-3" />
            )}
            {busy ? 'removing…' : 'remove'}
          </button>
          {busy ? null : (
            <button
              type="button"
              onClick={() => setAsk(false)}
              className="motion-press rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-foreground uppercase ring-1 ring-lift/20 ring-inset"
            >
              keep
            </button>
          )}
        </span>
      ) : (
        <>
          <span className="font-mono text-[11.5px] text-ink-300 max-sm:hidden">
            {FULL.format(new Date(t.occurredAt))}
          </span>
          <AccountLogo name={a?.name ?? ''} domain={a?.domain} size={16} />
          <button
            type="button"
            aria-label="Remove this trade"
            onClick={() => setAsk(true)}
            className="grid size-5 place-items-center justify-self-end rounded-[6px] text-ink-500 transition-colors hover:bg-state-danger/12 hover:text-state-danger"
          >
            <X className="size-3" />
          </button>
        </>
      )}
    </div>
  )
}
