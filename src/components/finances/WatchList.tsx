import { useState } from 'react'
import { Plus, Star, X } from 'lucide-react'

import { Panel } from '@/components/finances/bits'
import { TickerSearch } from '@/components/finances/HoldingsTickerSearch'
import { WatchRow, BADGE, COLS } from '@/components/finances/WatchRow'
import {
  useStar,
  useWatchFacts,
  useWatchList,
} from '@/components/finances/useWatch'
import { SkeletonRows } from '@/components/Skeleton'
import { WATCH_MAX } from '@/lib/watch'

/* The WATCHLIST on Portfolio (1 Nov, mockup watchlist.html, his "go"):
   names not owned, ★ from MARKET or the field here, a row each. Its
   year (52W, VS HIGH, SIGNAL) arrives a moment after the rows. */

const HEADS = [
  '',
  'ticker',
  'last',
  'day',
  '52w range',
  'vs high',
  'signal',
  'alert',
  '',
]
const RIGHT = new Set(['last', 'day', 'vs high'])

export function WatchList() {
  const list = useWatchList()
  const star = useStar()
  const [finding, setFinding] = useState(false)
  const ids = (list ?? []).map((w) => w.instrumentId)
  const stamp = (list ?? []).reduce(
    (t, w) => t + (w.closes.at(0)?.asOf ?? 0),
    0,
  )
  const facts = useWatchFacts(ids, stamp)
  const full = (list?.length ?? 0) >= WATCH_MAX

  return (
    <div id="watchlist" data-testid="watchlist">
      <Panel
        title={
          <span className="flex items-center gap-2 text-ink-200">
            <Star
              className="size-[18px] text-state-warn"
              fill="currentColor"
              strokeWidth={1.5}
            />
            watchlist
          </span>
        }
        aside={
          <span className="flex items-center gap-2">
            <span
              data-testid="watch-count"
              className={`font-mono text-[11px] font-semibold tabular-nums ${full ? 'text-state-danger' : 'text-ink-300'}`}
            >
              {list?.length ?? 0} / {WATCH_MAX}
              {full ? ' · full' : ''}
            </span>
            <button
              type="button"
              aria-label={finding ? 'close search' : 'find a ticker'}
              onClick={() => setFinding((f) => !f)}
              className={`${BADGE} motion-press py-[5px] text-lav-300 ring-lav-400/45 hover:bg-lav-400/10`}
            >
              {finding ? <X className="size-3" /> : <Plus className="size-3" />}
              {finding ? 'close' : 'ticker'}
            </button>
          </span>
        }
      >
        {finding ? (
          <TickerSearch
            logos
            initial=""
            onClose={() => setFinding(false)}
            onPick={(c) => {
              if (!star.isOn(c.symbol)) void star.press(c)
              setFinding(false)
            }}
          />
        ) : null}
        {list === undefined ? (
          <SkeletonRows rows={3} twoLine rowClassName="py-3" />
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 py-5">
            <Star className="motion-pulse size-8 text-ink-500" />
            <div className="flex flex-wrap justify-center gap-1.5">
              {['★ movers', '★ opportunities', '+ ticker'].map((p) => (
                <span key={p} className={`${BADGE} text-ink-400 ring-lift/20`}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="-mx-1 flex flex-col sm:-mx-2">
            <div
              className={`hidden items-center gap-x-2.5 border-b border-lift/10 px-2 pb-2 sm:grid ${COLS}`}
            >
              {HEADS.map((h, i) => (
                <span
                  key={i}
                  className={`font-mono text-[9px] tracking-[0.14em] text-ink-500 uppercase ${RIGHT.has(h) ? 'text-right' : ''}`}
                >
                  {h}
                </span>
              ))}
            </div>
            {list.map((w, i) => (
              <WatchRow
                key={w.instrumentId}
                w={w}
                facts={facts.get(w.instrumentId)}
                delay={Math.min(i, 8) * 50}
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
