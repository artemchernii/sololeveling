import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import { AskDrawer } from './AskDrawer'
import { TILE_OF, TabBar, useTab } from './InsightsTabs'
import type { Badge, Tab } from './InsightsTabs'
import { changeWord } from './parts'
import { Ideas, useQuotes } from './Ideas'
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
import type { Kind } from '@/lib/marketRead'

/* Insights, Finances' fourth room (19 Oct; spec
   docs/specs/2026-10-19-insights.md, mockup
   design/treasury-mockup/insights.html, his "go"). Once a month, often
   after payday: he reads what the market did and where his money sits.
   I1 built band 1, THE MARKET — fetched when the room opens, never saved.
   I3 adds the read: the hero, band 2 WHAT IT MEANS and band 4's ideas.
   I2 adds band 3, MINE. I4 adds ASK, never saved. On 21 Oct the bands
   became tabs under the hero and ASK a drawer (insights-tabs.html). */

const NONE: [] = []

/** shown: the room is the one on screen — rooms stay mounted when
    hidden, and the ASK pill lives outside the room. */
export function Insights({ shown }: { shown: boolean }) {
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

  const ideas = read.shown?.read?.ideas ?? null
  const quotes = useQuotes(ideas?.map((i) => i.ticker) ?? [])
  const [tab, pick] = useTab(read.row?.read !== undefined, read.loading)
  const room = useRef<HTMLDivElement>(null)
  /* A read line's → MINE: its tab opens, then its tile is lit. */
  const [lit, setLit] = useState<{ tile: string } | null>(null)
  useEffect(() => {
    const el = lit
      ? room.current?.querySelectorAll<HTMLElement>(`[data-tile="${lit.tile}"]`)
      : null
    if (!el || el.length === 0) return
    el[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
    /* Lit once the band has arrived, for long enough to be seen. */
    const on = setTimeout(() => el.forEach((t) => t.classList.add('lit')), 450)
    const off = setTimeout(() => setLit(null), 2050)
    return () => {
      clearTimeout(on)
      clearTimeout(off)
      el.forEach((t) => t.classList.remove('lit'))
    }
  }, [lit])
  const go = (kind: Kind) => {
    const to = TILE_OF[kind]
    if (!to) return
    pick(to.tab)
    setLit({ tile: to.tile })
  }

  return (
    <div
      ref={room}
      data-testid="insights-room"
      className="flex flex-col gap-3.5"
    >
      <ReadHero r={read} positions={count} />
      <TabBar tab={tab} badges={badgesOf()} onPick={pick} />

      {tab === 'market' ? (
        <div data-testid="tab-market" className="ins-panel">
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
      ) : tab === 'read' ? (
        <div data-testid="tab-read" className="ins-panel">
          <ReadLines shown={read.shown} positions={count} onGo={go} />
        </div>
      ) : tab === 'mine' ? (
        <div data-testid="tab-mine" className="ins-panel">
          {positions ? (
            <Mine
              held={owned ?? []}
              period={period}
              mine={mine}
              rows={alloc}
              read={read.shown}
            />
          ) : null}
        </div>
      ) : tab === 'ideas' ? (
        <div data-testid="tab-ideas" className="ins-panel">
          <Ideas ideas={ideas} quotes={quotes} />
        </div>
      ) : null}

      {shown ? <AskDrawer r={read} /> : null}
    </div>
  )

  /** Each tab's badge, from numbers already on the page. */
  function badgesOf(): Partial<Record<Tab, Badge>> {
    const sp = market.shown?.markets.find((m) => m.id === 'sp500')?.move
    const lines = read.shown?.read?.lines.length
    const adds = mine.base?.calls
      ? mine.base.calls.filter((c) => c.call === 'add').length
      : null
    /* The cards NEXT shows: a ticker the market did not answer is left out. */
    const cards =
      ideas && quotes
        ? ideas.filter((i) => quotes.some((q) => q.symbol === i.ticker)).length
        : null
    return {
      market: sp
        ? {
            text: `S&P ${changeWord(sp.change)}`,
            tone: sp.change > 0 ? 'good' : sp.change < 0 ? 'bad' : 'dim',
          }
        : undefined,
      read: lines ? { text: `${lines} LINES`, tone: 'lav' } : undefined,
      mine:
        adds === null
          ? undefined
          : { text: `${adds} ADD`, tone: adds > 0 ? 'good' : 'dim' },
      ideas: cards ? { text: String(cards), tone: 'dim' } : undefined,
    }
  }
}
