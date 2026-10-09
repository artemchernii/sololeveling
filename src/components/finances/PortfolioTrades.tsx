import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Veiled } from '@/components/finances/Veil'
import { euros } from '@/lib/money'

/* One position's trades, opened under its row in Portfolio — split out of
   Portfolio.tsx (10 Oct) to keep that file under 500 lines. */

const DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

export function Trades({
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
            {t.split ? 'split' : t.side}
          </span>
          <span className="flex-1 text-ink-200">
            <Veiled>
              {t.split ? `+${t.shares}` : `${t.shares} × ${euros(t.priceEur)}`}
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
