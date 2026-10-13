import { useState } from 'react'
import { useMutation } from 'convex/react'
import { X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { euros } from '@/lib/money'

const FULL = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
/** Rows of buys and sells shown before "all". */
const FIRST = 8

/* Every buy and sell of one position, in euros, newest first — what its
   sums are made of (13 Oct; split out of PortfolioPosition). */
export function PositionTrades({
  loaded,
  all,
  unit,
  accountOf,
}: {
  loaded: boolean
  all: ReadonlyArray<Doc<'trades'>>
  unit: (n: number) => string
  accountOf: (
    id: Id<'accounts'>,
  ) => Pick<Doc<'accounts'>, 'name' | 'domain'> | undefined
}) {
  /* A long history shows its newest rows; the rest is one press away. */
  const [whole, setWhole] = useState(false)
  const remove = useMutation(api.invest.removeTrade)
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
        <span className="py-3 text-[13px] text-ink-400">
          No buys or sells in the files yet.
        </span>
      ) : (
        (whole ? all : all.slice(0, FIRST)).map((t, i) => {
          const a = accountOf(t.accountId)
          const free = t.reward || t.split
          return (
            <div
              key={t._id}
              style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              className="group motion-arrive grid grid-cols-[62px_minmax(0,1fr)_auto_16px_20px] items-center gap-2.5 border-t border-lift/6 py-2.5 first:border-t-0"
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
              <button
                type="button"
                aria-label="Remove this trade"
                onClick={() => void remove({ tradeId: t._id })}
                className="grid size-5 place-items-center rounded-[6px] text-ink-600 opacity-0 group-hover:opacity-100 hover:text-state-danger [@media(hover:none)]:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          )
        })
      )}
      {loaded && !whole && all.length > FIRST ? (
        <button
          type="button"
          onClick={() => setWhole(true)}
          className="motion-press mt-1 self-start rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase ring-1 ring-lav-400/40 ring-inset hover:bg-lav-400/10"
        >
          all {all.length}
        </button>
      ) : null}
    </div>
  )
}
