import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useMemo, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import { Ideas } from './Ideas'
import { Markets } from './Markets'
import { allocFacts, allocRows } from './Allocation'
import { Mine, itemOf } from './Mine'
import { useMine } from './useMine'
import { useTags } from '@/components/finances/PortfolioMap'
import { RateCards } from './RateCards'
import { ReadHero } from './ReadHero'
import { ReadLines } from './ReadLines'
import { SectorMap } from './SectorMap'
import { useMarket } from './useMarket'
import { useMarketRead } from './useMarketRead'
import { tickerBase } from '@/lib/market'
import { combine } from '@/lib/owned'
import type { Period } from '@/lib/insightsMarket'

/* Insights, Finances' fourth room (19 Oct; spec
   docs/specs/2026-10-19-insights.md, mockup
   design/treasury-mockup/insights.html, his "go"). Once a month, often
   after payday: he reads what the market did and where his money sits.
   I1 built band 1, THE MARKET — fetched when the room opens, never saved.
   I3 adds the read: the hero, band 2 WHAT IT MEANS and band 4's ideas.
   I2 adds band 3, MINE. ASK (I4) comes in its own slice. */

const NONE: [] = []

export function Insights() {
  const [period, setPeriod] = useState<Period>('1M')
  const market = useMarket(period)
  /* Portfolio's own positions, for the white dot on a held company. */
  const positions = useQuery(api.aggregate.positions, {})
  /* Portfolio's region and sector tags, for ALLOCATION (band 3). */
  const tags = useTags(positions?.rows ?? NONE)
  const held = new Set(positions?.rows.map((r) => tickerBase(r.symbol)) ?? [])
  /* Band 3's answer and lines live here: the read takes the lines as
     facts, so its opinion speaks to them. */
  const owned = useMemo(
    () => (positions ? combine(positions.rows) : null),
    [positions],
  )
  const mine = useMine(period, owned?.map(itemOf) ?? null)
  const alloc = owned ? allocRows(owned, tags, mine.base) : null
  const read = useMarketRead(
    positions ? positions.rows : null,
    allocFacts(alloc),
  )
  const count = positions ? positions.rows.length : null

  return (
    <div data-testid="insights-room" className="flex flex-col gap-3.5">
      <ReadHero r={read} positions={count} />

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

      <div className="ins-band">
        <span className="n">2</span>
        <b>WHAT IT MEANS</b>
        <span className="label-caps">MODEL · SOURCES SHOWN</span>
      </div>
      <ReadLines shown={read.shown} positions={count} />

      {positions ? (
        <Mine
          held={owned ?? []}
          period={period}
          mine={mine}
          rows={alloc}
          read={read.shown}
        />
      ) : null}

      <div className="ins-band">
        <span className="n">4</span>
        <b>NEXT</b>
        <span className="label-caps">IDEAS</span>
      </div>
      <Ideas ideas={read.shown?.read?.ideas ?? null} />
    </div>
  )
}
