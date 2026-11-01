import { useEffect, useState } from 'react'
import { useAction } from 'convex/react'
import { Loader2, Search } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { FIELD } from '@/components/finances/bits'
import { TickerLogo } from '@/components/finances/Logo'
import type { Candidate } from '@/lib/market'

/* Another ticker for a position, found by name (out of HoldingsReview on
   11 Oct, when that file passed 500 lines). */
export function TickerSearch({
  initial,
  onPick,
  logos = false,
}: {
  initial: string
  onPick: (c: Candidate) => void
  /** Each result with its mark (the watchlist's field, 1 Nov). */
  logos?: boolean
}) {
  const search = useAction(api.market.search)
  const [q, setQ] = useState(initial)
  const [results, setResults] = useState<Array<Candidate> | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    setBusy(true)
    const t = setTimeout(() => {
      search({ q: term })
        .then(setResults, () => setResults([]))
        .finally(() => setBusy(false))
    }, 300)
    return () => clearTimeout(t)
  }, [q, search])
  return (
    <div className="flex flex-col gap-1">
      <label className={`${FIELD} flex items-center gap-2 py-1.5`}>
        {busy ? (
          <Loader2 className="size-4 animate-spin text-lav-400" />
        ) : (
          <Search className="size-4 text-ink-500" />
        )}
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Find a ticker"
          className="w-full bg-transparent focus:outline-none"
        />
      </label>
      {(results ?? []).map((c) => (
        <button
          key={c.symbol}
          type="button"
          onClick={() => onPick(c)}
          className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left hover:bg-lav-400/10"
        >
          {logos ? (
            <TickerLogo
              symbol={c.symbol}
              type={c.type}
              name={c.name}
              size={26}
            />
          ) : null}
          <span className="w-20 font-mono text-[12px] text-area">
            {c.symbol}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px]">{c.name}</span>
          <span className="font-mono text-[10.5px] text-ink-500">
            {c.exchange}
          </span>
        </button>
      ))}
    </div>
  )
}
