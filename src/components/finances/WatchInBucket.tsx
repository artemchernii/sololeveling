import { Link } from '@tanstack/react-router'
import { Star } from 'lucide-react'

import { BADGE, CALL } from '@/components/finances/WatchRow'
import { useWatchFacts, useWatchList } from '@/components/finances/useWatch'
import { money } from '@/lib/currency'
import { bucketOf } from '@/lib/targets'
import type { Bucket } from '@/lib/targets'

/* A pressed TARGET bucket's watched names (1 Nov, mockup watchlist.html
   "in target"): under the held ones the list below shows, the names not
   owned that would count in it, each with its price and signal. */
export function WatchInBucket({ bucket }: { bucket: Bucket }) {
  const list = useWatchList()
  const here = (list ?? []).filter((w) => bucketOf(w) === bucket)
  const facts = useWatchFacts(here.map((w) => w.instrumentId))
  if (here.length === 0) return null
  return (
    <div
      data-testid="target-watch"
      className="motion-arrive ml-2 flex flex-col gap-1.5 border-l-2 border-lift/10 py-1 pl-3 sm:ml-[110px]"
    >
      <span className="label-caps flex items-center gap-1.5 text-state-warn">
        <Star className="size-3" fill="currentColor" /> watchlist ·{' '}
        {here.length}
      </span>
      {here.map((w) => {
        const last = w.closes.at(0)
        const call = facts.get(w.instrumentId)?.call
        return (
          <Link
            key={w.instrumentId}
            to="/finances"
            search={{ room: 'portfolio', position: w.instrumentId }}
            className="flex items-center gap-2.5 rounded-[8px] text-[12.5px] hover:text-lav-300"
          >
            <span className="w-12 font-mono text-[10px] font-bold text-state-warn">
              {w.symbol}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-200">
              {w.name}
            </span>
            <span className="font-mono text-[12px] tabular-nums">
              {last ? money(last.price, w.currency || 'EUR') : '—'}
            </span>
            {call ? (
              <span className={`${BADGE} ${CALL[call]}`}>{call}</span>
            ) : null}
          </Link>
        )
      })}
    </div>
  )
}
