import { useEffect, useState } from 'react'
import { useAction } from 'convex/react'

import { api } from '../../../../convex/_generated/api'
import type {
  LevelsAnswer,
  StocksAnswer,
} from '../../../../convex/marketSources/opportunities'
import { MOVER_REGIONS } from '@/lib/movers'
import type { MoverRegion } from '@/lib/movers'

/* OPPORTUNITIES' answers (out of Opportunities.tsx on 1 Nov, when the
   watchlist's FIND began to read them too): four regions and the
   levels, asked once on open, kept ten minutes in page memory, never
   stored. */

const KEEP_MS = 10 * 60_000
export type Shown = StocksAnswer | 'failed'

const keptStocks = new Map<MoverRegion, { at: number; answer: StocksAnswer }>()
let keptLevels: { at: number; answer: LevelsAnswer } | null = null

export function useOpportunities() {
  const askStocks = useAction(api.marketSources.opportunities.stocks)
  const askLevels = useAction(api.marketSources.opportunities.levels)
  const fresh = (at: number) => Date.now() - at < KEEP_MS
  const [stocks, setStocks] = useState(() => {
    const m = new Map<MoverRegion, Shown>()
    for (const r of MOVER_REGIONS) {
      const k = keptStocks.get(r)
      if (k && fresh(k.at)) m.set(r, k.answer)
    }
    return m
  })
  const [levels, setLevels] = useState<LevelsAnswer | 'failed' | null>(() =>
    keptLevels && fresh(keptLevels.at) ? keptLevels.answer : null,
  )
  useEffect(() => {
    let live = true
    for (const region of MOVER_REGIONS) {
      if (stocks.has(region)) continue
      askStocks({ region })
        .then((a) => {
          keptStocks.set(region, { at: Date.now(), answer: a })
          if (live) setStocks((m) => new Map(m).set(region, a))
        })
        .catch(() => {
          if (live) setStocks((m) => new Map(m).set(region, 'failed'))
        })
    }
    if (levels === null)
      askLevels({})
        .then((a) => {
          keptLevels = { at: Date.now(), answer: a }
          if (live) setLevels(a)
        })
        .catch(() => {
          if (live) setLevels('failed')
        })
    return () => {
      live = false
    }
    /* asked once on open: what is kept is not asked again */
  }, [askStocks, askLevels])
  return { stocks, levels }
}
