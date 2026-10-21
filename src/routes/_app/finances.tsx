import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CandlestickChart, LayoutGrid, Sparkles, Waves } from 'lucide-react'

import { Accounts } from '@/components/finances/Accounts'
import { Flow } from '@/components/finances/flow/Flow'
import { Insights } from '@/components/finances/insights/Insights'
import { Portfolio } from '@/components/finances/Portfolio'
import { useFreshPrices } from '@/components/finances/useFreshPrices'
import { RoomTabLabel, RoomTabs, roomTabClass } from '@/components/RoomTabs'
import { TreasuryHero } from '@/components/finances/TreasuryHero'
import { WorthChart } from '@/components/finances/WorthChart'
import { areaVars } from '@/lib/areas'

/* The Treasury (R6b-c, 27 Sep; docs/specs/2026-09-27-r6b-treasury.md).
   Artem: "log + track + invest but not slop but bigboy approach." The hero
   over three rooms — OVERVIEW (his accounts, and anything still being
   read), FLOW (bills and salary, where the month went, the calendar),
   PORTFOLIO (brokers and positions with their profit). Everything comes in
   through + in the hero: files dropped and read, or the few things worth
   typing. The room is in the URL. */
const ROOMS = [
  { id: 'overview', label: 'Overview', Icon: LayoutGrid },
  { id: 'flow', label: 'Flow', Icon: Waves },
  { id: 'portfolio', label: 'Portfolio', Icon: CandlestickChart },
  /* The market and what it means for his money (19 Oct). */
  { id: 'insights', label: 'Insights', Icon: Sparkles },
] as const

type Room = (typeof ROOMS)[number]['id']

function Treasury() {
  const { room = 'overview', month, position } = Route.useSearch()
  useFreshPrices()
  /* A room loads the first time it is opened, then stays (9 Oct): loading
     all three on arrival made him wait ~2s for rooms he could not see, and
     read Flow's and Portfolio's sums on every visit. */
  const [opened, setOpened] = useState<ReadonlySet<Room>>(() => new Set([room]))
  useEffect(() => {
    setOpened((was) => (was.has(room) ? was : new Set([...was, room])))
  }, [room])
  return (
    <div className="flex flex-col gap-[18px]">
      <TreasuryHero />
      <RoomTabs label="Treasury rooms" style={areaVars('money')}>
        {ROOMS.map(({ id, label, Icon }) => {
          const on = id === room
          return (
            <Link
              key={id}
              to="/finances"
              search={id === 'overview' ? {} : { room: id }}
              replace
              aria-current={on ? 'page' : undefined}
              className={roomTabClass(on)}
            >
              <RoomTabLabel on={on} Icon={Icon} label={label} />
            </Link>
          )
        })}
      </RoomTabs>

      {/* A room once opened stays mounted; a tab only shows one (27 Sep:
          every switch rebuilt the room — its queries reloaded, skeletons
          flashed, it slid in again. "IT JUMPS FLICK"). */}
      <div
        style={areaVars('money')}
        hidden={room !== 'overview'}
        className="flex flex-col gap-3"
      >
        {opened.has('overview') ? (
          <>
            <WorthChart />
            <Accounts />
          </>
        ) : null}
      </div>
      <div
        style={areaVars('money')}
        hidden={room !== 'flow'}
        className="flex flex-col gap-3"
      >
        {opened.has('flow') ? <Flow open={month} /> : null}
      </div>
      <div
        style={areaVars('money')}
        hidden={room !== 'portfolio'}
        className="flex flex-col gap-3"
      >
        {opened.has('portfolio') ? <Portfolio position={position} /> : null}
      </div>
      <div
        style={areaVars('money')}
        hidden={room !== 'insights'}
        className="flex flex-col gap-3"
      >
        {opened.has('insights') ? <Insights shown={room === 'insights'} /> : null}
      </div>
    </div>
  )
}

export const Route = createFileRoute('/_app/finances')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { room?: Room; month?: string; position?: string } => ({
    ...(ROOMS.some((r) => r.id === search.room) && search.room !== 'overview'
      ? { room: search.room as Room }
      : {}),
    ...(typeof search.month === 'string' && /^\d{4}-\d{2}$/.test(search.month)
      ? { month: search.month }
      : {}),
    /* One position's page, inside Portfolio (13 Oct). */
    ...(search.room === 'portfolio' &&
    typeof search.position === 'string' &&
    search.position !== ''
      ? { position: search.position }
      : {}),
  }),
  component: Treasury,
})
