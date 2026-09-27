import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CandlestickChart, LayoutGrid, Waves } from 'lucide-react'

import { Accounts } from '@/components/finances/Accounts'
import { Bills } from '@/components/finances/Bills'
import { IntakeFlow, OpenIntakes } from '@/components/finances/Intake'
import { MoneyCalendar } from '@/components/finances/MoneyCalendar'
import { MonthMoney } from '@/components/finances/MonthMoney'
import { Portfolio } from '@/components/finances/Portfolio'
import { RoomTabLabel, RoomTabs, roomTabClass } from '@/components/RoomTabs'
import { Sheet } from '@/components/finances/Sheet'
import { TreasuryHero } from '@/components/finances/TreasuryHero'
import { WorthChart } from '@/components/finances/WorthChart'
import { areaVars } from '@/lib/areas'
import type { Id } from '../../../convex/_generated/dataModel'

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
] as const

type Room = (typeof ROOMS)[number]['id']

function Treasury() {
  const { room = 'overview', month } = Route.useSearch()
  const [reviewing, setReviewing] = useState<Id<'intakes'> | null>(null)
  useEffect(() => setReviewing(null), [room])
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

      {/* All three rooms stay mounted; a tab only shows one (27 Sep: every
          switch rebuilt the room — its queries reloaded, skeletons
          flashed, it slid in again. "IT JUMPS FLICK"). */}
      <div
        style={areaVars('money')}
        hidden={room !== 'overview'}
        className="flex flex-col gap-3"
      >
        <OpenIntakes onOpen={setReviewing} />
        <WorthChart />
        <Accounts />
      </div>
      <div
        style={areaVars('money')}
        hidden={room !== 'flow'}
        className="flex flex-col gap-3"
      >
        <Bills />
        <MonthMoney open={month} />
        <section className="glass flex flex-col gap-5 rounded-[22px] p-4 sm:p-5">
          <MoneyCalendar />
        </section>
      </div>
      <div
        style={areaVars('money')}
        hidden={room !== 'portfolio'}
        className="flex flex-col gap-3"
      >
        <Portfolio />
      </div>

      <Sheet
        open={reviewing !== null}
        title="check it"
        wide
        onClose={() => setReviewing(null)}
      >
        {reviewing ? (
          <IntakeFlow
            intakeId={reviewing}
            onBack={() => setReviewing(null)}
            onDone={() => setReviewing(null)}
          />
        ) : null}
      </Sheet>
    </div>
  )
}

export const Route = createFileRoute('/_app/finances')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { room?: Room; month?: string } => ({
    ...(ROOMS.some((r) => r.id === search.room) && search.room !== 'overview'
      ? { room: search.room as Room }
      : {}),
    ...(typeof search.month === 'string' && /^\d{4}-\d{2}$/.test(search.month)
      ? { month: search.month }
      : {}),
  }),
  component: Treasury,
})
