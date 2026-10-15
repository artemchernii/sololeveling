import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Loader2, Trash2, Undo2, X } from 'lucide-react'

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

const PILL =
  'motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] uppercase disabled:opacity-80'

/** One buy or sell: its badge, what it came to, its units and day (mockup
    trade-remove.html). The × asks first, on the row — REMOVE or KEEP
    (14 Oct night: the × took his MSFT buy away with no question). A
    removed one stays struck in its place with UNDO, until the page is
    left; later it sits folded at the end of the list. */
export function TradeRow({
  row: t,
  i,
  unit,
  account: a,
  back = false,
  onRemoved,
  onRestored,
}: {
  row: Doc<'trades'> | Doc<'removedTrades'>
  i: number
  unit: (n: number) => string
  account: Pick<Doc<'accounts'>, 'name' | 'domain'> | undefined
  /** Just put back by UNDO: it flashes green as it lands. */
  back?: boolean
  onRemoved?: (id: Id<'removedTrades'>) => void
  onRestored?: (id: Id<'trades'>) => void
}) {
  const remove = useMutation(api.invest.removeTrade)
  const restore = useMutation(api.invest.restoreTrade)
  const [ask, setAsk] = useState(false)
  const [busy, setBusy] = useState(false)
  const gone = 'removedAt' in t
  const free = t.reward || t.split
  const sell = t.side === 'sell'
  const press = async () => {
    setBusy(true)
    try {
      if ('removedAt' in t) onRestored?.(await restore({ removedId: t._id }))
      else onRemoved?.(await remove({ tradeId: t._id }))
    } catch {
      setBusy(false)
    }
  }
  const wide = ask || gone
  return (
    <div
      data-testid={gone ? 'trade-removed' : 'trade-row'}
      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
      className={`-mx-2 grid items-center gap-3 rounded-[10px] border-t border-lift/6 px-2 py-2.5 transition-colors ${back ? 'motion-land bg-state-good/[0.12]' : 'motion-arrive'} ${
        wide
          ? 'grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[64px_minmax(0,1fr)_auto]'
          : 'grid-cols-[64px_minmax(0,1fr)_16px_20px] sm:grid-cols-[64px_minmax(0,1fr)_auto_16px_20px]'
      } ${ask ? 'bg-state-warn/[0.08] ring-1 ring-state-warn/40 ring-inset' : gone ? 'bg-lift/[0.02]' : ''}`}
    >
      <span
        className={`justify-self-start rounded-full px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.12em] uppercase ring-1 ring-inset ${gone ? 'opacity-50' : ''} ${sell ? 'bg-state-danger/16 text-state-danger ring-state-danger/35' : 'bg-state-good/16 text-state-good ring-state-good/35'}`}
      >
        {t.reward ? 'staking' : t.split ? 'split' : t.side}
      </span>
      <span
        className={`flex min-w-0 flex-col gap-0.5 ${gone ? 'text-ink-500 line-through decoration-state-danger/70' : ''}`}
      >
        <span
          className={`text-[17px] font-medium tabular-nums ${gone ? '' : 'text-foreground'}`}
        >
          <Veiled>
            {free
              ? `${t.shares} ${unit(t.shares)}`
              : euros(Math.round(t.shares * t.priceEur * 100) / 100)}
          </Veiled>
        </span>
        <span
          className={`truncate font-mono text-[11px] ${gone ? '' : 'text-ink-300'}`}
        >
          {t.reward ? (
            'not counted as income'
          ) : t.split ? (
            'added by a split'
          ) : (
            <>
              <b className={`font-medium ${gone ? '' : 'text-foreground'}`}>
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
      {gone ? (
        <span className="motion-land col-span-2 flex items-center justify-end gap-1.5 sm:col-span-1">
          <span className="rounded-full bg-state-danger/14 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-state-danger uppercase">
            removed
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void press()}
            className={`${PILL} bg-lav-400 text-background`}
          >
            {busy ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Undo2 className="size-3" />
            )}
            {busy ? 'restoring…' : 'undo'}
          </button>
        </span>
      ) : ask ? (
        <span className="motion-land col-span-2 flex items-center justify-end gap-1.5 sm:col-span-1">
          <span className="rounded-full bg-state-warn/16 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-state-warn uppercase">
            remove?
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void press()}
            className={`${PILL} bg-state-danger text-background`}
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
              className={`${PILL} text-foreground ring-1 ring-lift/20 ring-inset`}
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
