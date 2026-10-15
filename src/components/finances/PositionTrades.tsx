import { useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ChevronDown } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { TradeRow } from '@/components/finances/TradeRow'
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
   sums. A removed trade stays struck in its place with UNDO while the
   page is open, then folds at the end as REMOVED · N (15 Oct, mockup
   trade-remove.html). */
export function PositionTrades({
  loaded,
  all,
  cut,
  instrumentIds,
  unit,
  accountOf,
}: {
  loaded: boolean
  /** Every listing it is owned under: where its removed trades sit. */
  instrumentIds: ReadonlyArray<Id<'instruments'>>
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
  const removed = useQuery(api.invest.removedTrades, {
    instrumentIds: [...instrumentIds],
  })
  /* Removed on this visit: shown in place. Put back: flashes as it lands. */
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set())
  const [back, setBack] = useState<ReadonlySet<string>>(new Set())
  const [folded, setFolded] = useState(true)
  const add = (set: typeof setFresh, id: string) =>
    set((o) => new Set(o).add(id))
  const row = (t: Doc<'trades'> | Doc<'removedTrades'>, i: number) => (
    <TradeRow
      key={t._id}
      row={t}
      i={i}
      unit={unit}
      account={accountOf(t.accountId)}
      back={back.has(t._id)}
      onRemoved={(id) => add(setFresh, id)}
      onRestored={(id) => add(setBack, id)}
    />
  )
  const here = (removed ?? []).filter((r) => fresh.has(r._id))
  /* A removed row of this visit sits in the round its day falls in. */
  const inRound = (r: Round<Doc<'trades'>>) =>
    here.filter(
      (g) => g.occurredAt >= r.from && (r.open || g.occurredAt <= r.to),
    )
  const placed = new Set(cut.flatMap((r) => inRound(r).map((g) => g._id)))
  const aside = (removed ?? []).filter((r) => !placed.has(r._id))
  const byDay = (
    a: Doc<'trades'> | Doc<'removedTrades'>,
    b: Doc<'trades'> | Doc<'removedTrades'>,
  ) => b.occurredAt - a.occurredAt
  return (
    <div className="flex flex-col rounded-[16px] bg-lift/[0.025] p-3.5 ring-1 ring-lift/8 ring-inset">
      <span className="label-caps mb-1">
        buys and sells{loaded && all.length > 0 ? ` · ${all.length}` : ''}
      </span>
      {!loaded ? (
        <span className="py-3 font-mono text-[11px] text-ink-500">
          reading…
        </span>
      ) : all.length === 0 && aside.length === 0 ? (
        <span className="py-3 font-mono text-[11px] text-ink-400">
          0 BUY · 0 SELL
        </span>
      ) : (
        cut.map((r, k) => {
          /* Sold out: its last round is the page, open at first. */
          const lead = k === 0 && !r.open
          const shown = r.open || (lead ? !open.has(k) : open.has(k))
          const rows = [
            ...(r.open && !whole ? r.trades.slice(0, FIRST) : r.trades),
            ...inRound(r),
          ].sort(byDay)
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
      {loaded && aside.length > 0 ? (
        <div data-testid="trades-removed">
          <button
            type="button"
            aria-expanded={!folded}
            onClick={() => setFolded((f) => !f)}
            className="motion-press mt-1 flex w-full items-center gap-2 border-t border-lift/8 pt-2.5 pb-2 text-left"
          >
            <span className="rounded-full bg-state-danger/14 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-state-danger uppercase">
              removed · {aside.length}
            </span>
            <span className="flex-1" />
            <ChevronDown
              className={`size-3.5 shrink-0 text-ink-400 transition-transform ${folded ? '' : 'rotate-180'}`}
            />
          </button>
          {folded ? null : aside.map(row)}
        </div>
      ) : null}
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
