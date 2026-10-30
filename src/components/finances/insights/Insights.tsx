import { useQuery } from 'convex-helpers/react/cache/hooks'
import { useMemo, useRef, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import { AskDrawer } from './AskDrawer'
import { TabBar, useTab } from './InsightsTabs'
import type { Badge, Tab } from './InsightsTabs'
import { changeWord } from './parts'
import { IdeasTab } from './IdeasTab'
import { Markets } from './Markets'
import { OnReddit } from './OnReddit'
import { allocFacts, allocRows } from './Allocation'
import { Mine, itemOf } from './Mine'
import { useMine } from './useMine'
import { earningsFacts } from '@/lib/insightsEarnings'
import { useTags } from '@/components/finances/PortfolioMap'
import { RateCards } from './RateCards'
import { ReadHero } from './ReadHero'
import { ReadLines } from './ReadLines'
import { SectorMap } from './SectorMap'
import { Close, closeBadge, useClose } from './Close'
import { useMarket } from './useMarket'
import { useMarketRead } from './useMarketRead'
import { useCash } from './useIdeas'
import { spendMonth } from './IdeasParts'
import { ideaFacts, ideaOf, readMine } from '@/lib/readMine'
import { tickerBase } from '@/lib/market'
import { combine } from '@/lib/owned'
import type { Period } from '@/lib/insightsMarket'

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
  /* THE TREND's switch, 3M first (30 Oct); MINE follows it. */
  const [period, setPeriod] = useState<Period>('3M')
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
  /* A held company's results day: a fact for the read and for ASK. */
  const earn = mine.base?.earnings
    ? earningsFacts(mine.base.earnings.rows, mine.base.fetchedAt)
    : []
  /* READ about his money (29 Oct): his cash and investments, and the
     IDEAS moves a line may point at. */
  const cash = useCash()
  const worth = useQuery(api.aggregate.worth, {})
  const ideas = useQuery(api.ideasReads.latest, {})
  const board = ideas?.shown?.board ?? null
  const read = useMarketRead(
    positions ? positions.rows : null,
    [...allocFacts(alloc), ...earn],
    earn,
    (m) => [
      ...readMine({
        cash,
        invested: worth?.invested.total ?? null,
        rates: m.rates,
        markets: m.markets,
        alloc,
        owned,
      }),
      ...ideaFacts(board?.lines ?? null),
    ],
  )

  const count = positions ? positions.rows.length : null

  /* IDEAS' badge: what the board's plan puts to work (29 Oct). */
  const plan = board?.parts
  const [tab, pick] = useTab(read.row?.read !== undefined, read.loading)
  const close = useClose(shown, shown && tab === 'close')
  const room = useRef<HTMLDivElement>(null)
  /* A read line's move: IDEAS opens on that line, lit. */
  const [toIdea, setToIdea] = useState<string | null>(null)
  const goIdea = (ticker: string | null) => {
    pick('ideas')
    setToIdea(ticker)
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
        <div data-testid="tab-market" className="ins-panel ins-mgrid">
          <div className="flex min-w-0 flex-col gap-3.5">
            <SectorMap
              shown={market.shown}
              period={period}
              held={held}
              reading={market.reading}
            />
          </div>
          <div className="side">
            <Markets
              period={period}
              onPeriod={setPeriod}
              shown={market.shown}
              reading={market.reading}
              failed={market.failed}
              held={held}
            />
            <RateCards
              answer={market.answer ?? market.shown}
              reading={market.reading}
              failed={market.failed}
            />
            <OnReddit held={held} />
          </div>
        </div>
      ) : tab === 'read' ? (
        <div data-testid="tab-read" className="ins-panel">
          <ReadLines
            shown={read.shown}
            cash={cash}
            invested={worth?.invested.total ?? null}
            board={board}
            spend={ideas?.shown ? spendMonth(ideas.shown.facts) : null}
            onIdea={goIdea}
          />
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
      ) : tab === 'close' ? (
        <div data-testid="tab-close" className="ins-panel">
          <Close close={close} />
        </div>
      ) : tab === 'ideas' ? (
        <div data-testid="tab-ideas" className="ins-panel">
          <IdeasTab
            r={read}
            held={owned}
            alloc={alloc}
            extra={[...allocFacts(alloc), ...earn]}
            goTo={toIdea}
            onGone={() => setToIdea(null)}
          />
        </div>
      ) : null}

      {shown ? <AskDrawer r={read} docked={tab === 'ideas'} /> : null}
    </div>
  )

  /** Each tab's badge, from numbers already on the page. */
  function badgesOf(): Partial<Record<Tab, Badge>> {
    const sp = market.shown?.markets.find((m) => m.id === 'sp500')?.move
    const lines = read.shown?.read?.lines
    const moves = lines
      ? new Set(
          lines
            .map((l) => ideaOf(l.idea, board?.lines ?? null)?.ticker)
            .filter(Boolean),
        ).size
      : 0
    const adds = mine.base?.calls
      ? mine.base.calls.filter((c) => c.call === 'add').length
      : null
    const put = plan ? plan.protect + plan.add + plan.new : 0
    return {
      market: sp
        ? {
            text: `S&P ${changeWord(sp.change)}`,
            tone: sp.change > 0 ? 'good' : sp.change < 0 ? 'bad' : 'dim',
          }
        : undefined,
      read: !lines
        ? undefined
        : moves > 0
          ? {
              text: `${moves} ${moves === 1 ? 'ACTION' : 'ACTIONS'}`,
              tone: 'lav',
            }
          : { text: 'NO ACTION', tone: 'dim' },
      mine:
        adds === null
          ? undefined
          : { text: `${adds} ADD`, tone: adds > 0 ? 'good' : 'dim' },
      ideas: put
        ? { text: `€${put.toLocaleString('en-GB')}`, tone: 'lav' }
        : undefined,
      close: closeBadge(close.day),
    }
  }
}
