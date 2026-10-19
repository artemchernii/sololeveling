import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import { Markets } from './Markets'
import { RateCards } from './RateCards'
import { SectorMap } from './SectorMap'
import { useMarket } from './useMarket'
import { tickerBase } from '@/lib/market'
import type { Period } from '@/lib/insightsMarket'

/* Insights, Finances' fourth room (19 Oct; spec
   docs/specs/2026-10-19-insights.md, mockup
   design/treasury-mockup/insights.html, his "go"). Once a month, often
   after payday: he reads what the market did and where his money sits.
   I1 builds the hero not yet read and band 1, THE MARKET — fetched when
   the room opens, never saved. The read itself (I3), MINE (I2) and ASK
   (I4) come in their own slices. */

const MONTH = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')

export function Insights() {
  const [period, setPeriod] = useState<Period>('1M')
  const market = useMarket(period)
  /* Portfolio's own positions, for the white dot on a held company. */
  const positions = useQuery(api.aggregate.positions, {})
  const held = new Set(positions?.rows.map((r) => tickerBase(r.symbol)) ?? [])

  return (
    <div data-testid="insights-room" className="flex flex-col gap-3.5">
      <Hero positions={positions ? positions.rows.length : null} />

      <div className="ins-band">
        <span className="n">1</span>
        <b>THE MARKET</b>
        <span className="label-caps">FETCHED ON OPEN · NOT SAVED</span>
      </div>
      <RateCards
        answer={market.answer ?? market.shown}
        reading={market.reading}
        failed={market.failed}
      />
      <Markets
        period={period}
        onPeriod={setPeriod}
        shown={market.shown}
        reading={market.reading}
        failed={market.failed}
      />
      <SectorMap
        shown={market.shown}
        period={period}
        held={held}
        reading={market.reading}
      />
    </div>
  )
}

/* The hero before any read (mockup state "not read"): what a read will
   look at, as badges. No READ MARKET until it works (19 Oct, his mark: a
   dead button reads as broken) — it comes with the read itself (I3). */
function Hero({ positions }: { positions: number | null }) {
  const month = MONTH[new Date().getMonth()]
  const kpis: Array<[string, string]> = [
    ['🌡️', 'INFLATION'],
    ['🏛️', 'FED · ECB'],
    ['📊', 'MARKETS · SECTORS'],
    ['🌐', 'NEWS'],
    ...(positions !== null
      ? [
          [
            '💼',
            `${positions} ${positions === 1 ? 'POSITION' : 'POSITIONS'}`,
          ] as [string, string],
        ]
      : []),
  ]
  return (
    <section
      className="ins-tile ins-hero system-frame"
      style={{ '--i': 0 } as React.CSSProperties}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <span className="system-title">[ MARKET READ · {month} ]</span>
        <span className="headline">Not read yet</span>
        <div className="flex flex-wrap gap-2">
          {kpis.map(([e, k]) => (
            <span key={k} className="ins-kpi">
              <span className="e">{e}</span>
              {k}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
