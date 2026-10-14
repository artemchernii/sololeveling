import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

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
  const row = (t: Doc<'trades'>, i: number) => {
    const a = accountOf(t.accountId)
    const free = t.reward || t.split
    return (
      <div
        key={t._id}
        data-testid="trade-row"
        style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
        className="motion-arrive grid grid-cols-[62px_minmax(0,1fr)_auto_16px] items-center gap-2.5 border-t border-lift/6 py-2.5"
      >
        <span
          className={`font-mono text-[10.5px] tracking-[0.12em] uppercase ${
            t.side === 'sell' ? 'text-state-danger' : 'text-state-good'
          }`}
        >
          {t.reward ? 'staking' : t.split ? 'split' : t.side}
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
                {t.opening ? ' · owned before the first file' : ''}
              </>
            )}
          </span>
        </span>
        <span className="font-mono text-[11px] text-ink-500">
          {FULL.format(new Date(t.occurredAt))}
        </span>
        <AccountLogo name={a?.name ?? ''} domain={a?.domain} size={16} />
      </div>
    )
  }
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
