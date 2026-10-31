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
import { useCompanies, useFunds } from './YourCompanies'
import { WeekStories } from './WeekStories'
import { Movers, useAllMovers } from './Movers'
import { Opportunities } from './Opportunities'
import { Coming, useComing } from './Coming'
import { MineWeek } from './MineWeek'
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
import { resultsFacts } from '@/lib/companies'
import { moverFacts } from '@/lib/movers'
import { marketFacts } from '@/lib/marketRead'
import { placed } from '@/lib/insightsMine'
import type { MoneyInput } from '@/lib/weekMoney'
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
  /* One switch for SECTORS, THE TREND and MINE; the day first, like READ
     and CLOSE (30 Oct: "it should be day"). */
  const [period, setPeriod] = useState<Period>('1D')
  const market = useMarket(period)
  /* The MARKET tab's badge is today's S&P 500, whatever the switch says
     (30 Oct: "why i see market S&P up 3.8%? its down today"). Shared
     with CLOSE's 1D answer: one fetch, kept ten minutes. */
  const today = useMarket('1D')
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
  /* YOUR COMPANIES: the held companies, biggest first (30 Oct). */
  const companies = useMemo(
    () =>
      owned
        ?.filter((o) => o.type === 'EQUITY')
        .sort((a, b) => (b.valueEur ?? 0) - (a.valueEur ?? 0))
        .map((o) => ({
          symbol: tickerBase(o.symbol),
          name: o.name,
          valueEur: o.valueEur,
        })) ?? null,
    [owned],
  )
  const comp = useCompanies(companies)
  const funds = useFunds(companies)
  /* COMING and MINE · THIS WEEK (31 Oct, part 5): raw symbols for the
     week's closes, the HELD badge on a company reporting. */
  const coming = useComing(companies)
  const equities = useMemo(
    () => owned?.filter((o) => o.type === 'EQUITY') ?? null,
    [owned],
  )
  /* A held company's results day, and its results out (YOUR COMPANIES):
     facts for the read, THE WEEK and ASK. */
  const earn = [
    ...(mine.base?.earnings
      ? earningsFacts(mine.base.earnings.rows, mine.base.fetchedAt)
      : []),
    ...resultsFacts(comp.answer?.rows ?? []),
  ]
  /* The week's biggest movers in four regions (MOVERS, 31 Oct): facts
     for the read and THE WEEK, so a story can be about the whole market. */
  const allMovers = useAllMovers()
  const movFacts = moverFacts(
    [...allMovers.values()].flatMap((a) =>
      a !== 'failed' && a.reached ? [a] : [],
    ),
  )
  /* READ about his money (29 Oct): his cash and investments, and the
     IDEAS moves a line may point at. */
  const cash = useCash()
  const worth = useQuery(api.aggregate.worth, {})
  const ideas = useQuery(api.ideasReads.latest, {})
  const board = ideas?.shown?.board ?? null
  const read = useMarketRead(
    positions ? positions.rows : null,
    [...allocFacts(alloc), ...earn, ...movFacts],
    [...earn, ...movFacts],
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

  /* THE WEEK before a read: the month's numbers the press would hand
     the model (one fetch, kept ten minutes, shared with the press). */
  const month = useMarket('1M')
  const factsNow = month.answer
    ? [
        ...marketFacts(month.answer, positions?.rows ?? []),
        ...allocFacts(alloc),
        ...earn,
        ...movFacts,
      ]
    : []
  /* YOUR MONEY under each story: his holdings by place, his euro cash,
     and the held companies whose results are out. */
  const money: MoneyInput = {
    held:
      owned?.map((o) => ({
        symbol: o.symbol,
        name: o.name,
        kind: o.kind,
        valueEur: o.valueEur,
        region:
          placed(o.symbol, tags.get(o.instrumentId) ?? null)?.region ?? null,
      })) ?? null,
    cash: cash ? cash.idle : null,
    reported: new Set(
      comp.answer?.rows
        .filter((r) => r.results?.actual != null)
        .map((r) => r.symbol) ?? [],
    ),
  }

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
            <WeekStories
              shown={read.shown}
              facts={factsNow}
              money={money}
              board={board}
              onIdea={goIdea}
            />
            <Movers all={allMovers} />
            <Opportunities
              held={held}
              owned={owned}
              rates={(market.answer ?? market.shown)?.rates ?? null}
            />
            <Coming c={coming} />
            <MineWeek held={equities} c={comp} f={funds} />
            <SectorMap
              shown={market.shown}
              period={period}
              onPeriod={setPeriod}
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
              onPeriod={setPeriod}
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
    const sp = today.answer?.markets.find((m) => m.id === 'sp500')?.move
    /* After a read with THE WEEK, its count (market-story.html). */
    const stories = read.shown?.read?.week?.length ?? 0
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
      market: stories
        ? {
            text: `${stories} ${stories === 1 ? 'STORY' : 'STORIES'}`,
            tone: 'lav',
          }
        : sp
          ? {
              text: `S&P TODAY ${changeWord(sp.change)}`,
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
