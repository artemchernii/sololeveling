import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { CandlestickChart, LayoutGrid, Waves } from 'lucide-react'

import { Accounts } from '@/components/finances/Accounts'
import { Bills } from '@/components/finances/Bills'
import { IntakeFlow, OpenIntakes } from '@/components/finances/Intake'
import { MoneyCalendar } from '@/components/finances/MoneyCalendar'
import { MonthMoney } from '@/components/finances/MonthMoney'
import { Portfolio } from '@/components/finances/Portfolio'
import { Sheet } from '@/components/finances/Sheet'
import { TreasuryHero } from '@/components/finances/TreasuryHero'
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
  const { room = 'overview' } = Route.useSearch()
  const [reviewing, setReviewing] = useState<Id<'intakes'> | null>(null)
  useEffect(() => setReviewing(null), [room])
  return (
    <div className="flex flex-col gap-[18px]">
      <TreasuryHero />
      <nav
        style={areaVars('money')}
        aria-label="Treasury rooms"
        className="flex gap-1.5 sm:gap-2"
      >
        {ROOMS.map(({ id, label, Icon }) => {
          const on = id === room
          return (
            <Link
              key={id}
              to="/finances"
              search={id === 'overview' ? {} : { room: id }}
              replace
              aria-current={on ? 'page' : undefined}
              className={`motion-press inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full font-mono text-[11.5px] tracking-[0.14em] uppercase ring-1 transition-colors ring-inset ${
                on ? 'px-4' : 'w-10 sm:w-auto sm:px-4'
              } ${
                on
                  ? 'bg-lav-400/12 text-foreground ring-lav-400/45 shadow-[0_0_18px_-6px_var(--system-shine)]'
                  : 'text-ink-400 ring-lift/12 hover:text-foreground hover:ring-lift/25'
              }`}
            >
              <Icon className={`size-4 ${on ? 'text-area' : ''}`} />
              {/* On a phone the rooms not open are their icons. */}
              <span className={on ? '' : 'sr-only sm:not-sr-only'}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>

      <div
        key={room}
        style={areaVars('money')}
        className="motion-arrive flex flex-col gap-3"
      >
        {room === 'overview' ? (
          <>
            <OpenIntakes onOpen={setReviewing} />
            <Accounts />
          </>
        ) : room === 'flow' ? (
          <>
            <Bills />
            <MonthMoney />
            <section className="glass flex flex-col gap-5 rounded-[22px] p-4 sm:p-5">
              <MoneyCalendar />
            </section>
          </>
        ) : (
          <Portfolio />
        )}
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
  validateSearch: (search: Record<string, unknown>): { room?: Room } =>
    ROOMS.some((r) => r.id === search.room) && search.room !== 'overview'
      ? { room: search.room as Room }
      : {},
  component: Treasury,
})
