import { useQuery } from 'convex-helpers/react/cache/hooks'
import { CalendarClock } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { api } from '../../../convex/_generated/api'
import { AddButton } from '@/components/finances/Add'
import { Veiled, VeilToggle } from '@/components/finances/Veil'
import { Skeleton } from '@/components/Skeleton'
import { useDayStarts } from '@/components/track/useDayStarts'
import { areaVars } from '@/lib/areas'
import { dayLabel } from '@/lib/bills'
import { agoLabel } from '@/lib/format'
import { monthRange } from '@/lib/month'
import { euros } from '@/lib/money'

const MONTH = new Intl.DateTimeFormat(undefined, { month: 'long' })

/* [ TREASURY ] (27 Sep). The System window over the three rooms: what is
   his — capital, cash + investments, the two halves as one bar — this
   month's money in and out in green and red (P&L colour, allowed in
   Finances since 26 Sep), and the next bill. + is here: drop files or log
   something. One shape from the first frame, so nothing jumps. */
export function TreasuryHero() {
  const today = useDayStarts(1).at(-1) as number
  const { monthStart, nextStart } = monthRange(today)
  const worth = useQuery(api.aggregate.worth, {})
  const sums = useQuery(api.aggregate.moneySums, {
    start: monthStart,
    end: nextStart,
  })
  const empty = worth !== undefined && worth.byAccount.length === 0
  const cash = worth?.cash.total ?? 0
  const invested = worth?.invested.total ?? 0

  return (
    <section
      style={areaVars('money')}
      className="system-frame system-open relative flex flex-col gap-4 overflow-clip p-4 sm:p-5"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-(--area)/14 blur-3xl"
      />
      <div className="relative flex flex-wrap items-center gap-2 border-b border-lav-400/20 pb-3">
        <span className="system-title flex-1">[ treasury ]</span>
        <span className="label-caps hidden text-ink-300 sm:inline">
          {MONTH.format(new Date(today))}
        </span>
        <VeilToggle hideOnLeave />
        <AddButton />
      </div>

      <div className="relative flex flex-col gap-1">
        <span className="label-caps">capital · cash + investments</span>
        <span className="flex h-[46px] items-center sm:h-[58px]">
          {worth === undefined ? (
            <Skeleton className="h-9 w-56" />
          ) : empty ? (
            <span className="text-[46px] leading-none font-light text-ink-600 sm:text-[58px]">
              —
            </span>
          ) : (
            <span
              key={worth.total}
              className="motion-pop text-[46px] leading-none font-light tracking-tight text-foreground sm:text-[58px]"
            >
              <Veiled>{euros(worth.total)}</Veiled>
            </span>
          )}
        </span>
      </div>

      <div className="relative flex flex-wrap items-center gap-2">
        <span className="inline-flex h-9 items-center gap-2.5 rounded-[10px] bg-lift/[0.06] px-3 font-mono text-[14.5px]">
          {sums === undefined ? (
            <Skeleton className="h-3 w-32" />
          ) : (
            <>
              <span className="text-state-good">
                <Veiled>{`+${euros(sums.in.sum)}`}</Veiled>
              </span>
              <span className="text-state-danger">
                <Veiled>{`−${euros(sums.out.sum)}`}</Veiled>
              </span>
              <span className="text-[11.5px] text-ink-500">
                in · out · {MONTH.format(new Date(today)).toLowerCase()}
              </span>
            </>
          )}
        </span>
        <NextBill today={today} />
      </div>

      <div className="relative flex max-w-xl flex-col gap-1.5">
        <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-lift/[0.06]">
          {cash + invested > 0 ? (
            <>
              <span
                style={{ flex: cash }}
                className="rounded-full bg-money-cash transition-[flex] duration-700"
              />
              <span
                style={{ flex: invested }}
                className="rounded-full bg-lav-400 transition-[flex] duration-700"
              />
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-between gap-x-4 font-mono text-[12px]">
          <Link
            to="/finances"
            className="flex items-center gap-1.5 text-ink-200 hover:text-foreground"
          >
            <span className="size-2 rounded-full bg-money-cash" />
            free cash {worth ? <Veiled>{euros(cash)}</Veiled> : null}
          </Link>
          <Link
            to="/finances"
            search={{ room: 'portfolio' }}
            className="flex items-center gap-1.5 text-ink-200 hover:text-foreground"
          >
            <span className="size-2 rounded-full bg-lav-400" />
            invested {worth ? <Veiled>{euros(invested)}</Veiled> : null}
          </Link>
        </div>
        <span className="font-mono text-[10.5px] text-ink-500">
          {worth === undefined
            ? ' '
            : empty
              ? 'add an account, then drop a statement on + add'
              : [
                  worth.cash.oldestAt !== null
                    ? `cash oldest read ${agoLabel(worth.cash.oldestAt)}`
                    : 'no cash typed yet',
                  worth.invested.oldestAt !== null
                    ? `closes as of ${agoLabel(worth.invested.oldestAt)} · Yahoo Finance`
                    : null,
                  worth.cash.unread > 0
                    ? `${worth.cash.unread} not read`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
        </span>
      </div>
    </section>
  )
}

/* The next bill not yet paid this month. Always holds its row. */
function NextBill({ today }: { today: number }) {
  const now = new Date(today)
  const year = now.getFullYear()
  const month = now.getMonth()
  const rows = useQuery(api.recurring.month, {
    year,
    month,
    start: new Date(year, month, 1).getTime(),
    end: new Date(year, month + 1, 1).getTime(),
  })
  if (rows === undefined) return <span className="h-9" aria-hidden />
  const next = rows.find((r) => r.paid === null && r.item.endedAt === undefined)
  const late = next !== undefined && next.day < now.getDate()
  return (
    <Link
      to="/finances"
      search={{ room: 'flow' }}
      className={`inline-flex h-9 items-center gap-2 rounded-full px-3 font-mono text-[11.5px] ring-1 ring-inset ${
        late
          ? 'text-state-warn ring-state-warn/35'
          : next
            ? 'text-ink-200 ring-lav-400/25 hover:ring-lav-400/50'
            : 'text-ink-500 ring-lift/12'
      }`}
    >
      <CalendarClock className="size-3.5 text-area" />
      {next
        ? `${late ? 'waiting' : 'next'}: ${next.item.name} · ${euros(next.item.amount)} · ${next.day === now.getDate() ? 'today' : dayLabel(next.day)}`
        : rows.length === 0
          ? 'no bills set up'
          : 'every bill this month is done'}
    </Link>
  )
}
