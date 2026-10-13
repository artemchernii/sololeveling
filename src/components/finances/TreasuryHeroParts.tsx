import { ChevronRight } from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { freshness as balanceFreshness } from '@/lib/freshness'
import { money } from '@/lib/currency'
import { euros } from '@/lib/money'

/* The hero's inner pieces (TreasuryHero.tsx): the check-in chip, the
   three group rows, and a group's accounts in a sheet. */

export type Row = FunctionReturnType<
  typeof api.aggregate.balances
>['accounts'][number]
export type Group = 'investments' | 'banks' | 'cash'

/* Out of date: its logos when one or two, a count from three. Up to date
   is quiet (27 Sep: the lit green pill with every logo "looks a bit weird
   and cheap"): the same pill as hide beside it, with a green light. */
export function CheckIn({
  stale,
  onOpen,
}: {
  stale: Array<Row>
  onOpen: () => void
}) {
  if (stale.length === 0) {
    return (
      <span className="motion-arrive inline-flex items-center gap-2 rounded-full px-2.5 py-1 font-mono text-[10.5px] tracking-[0.12em] text-ink-300 uppercase ring-1 ring-lift/15 ring-inset">
        <span className="size-1.5 rounded-full bg-state-good shadow-[0_0_8px_var(--color-state-good)]" />
        up to date
      </span>
    )
  }
  return (
    <button
      data-testid="check-in"
      type="button"
      onClick={onOpen}
      className="motion-press inline-flex items-center gap-2 rounded-full bg-state-warn/10 py-1 pr-1.5 pl-2.5 font-mono text-[10.5px] tracking-[0.1em] text-state-warn uppercase ring-1 ring-state-warn/45 ring-inset"
    >
      {stale.length <= 2 ? (
        <>
          outdated
          <span className="flex pl-1">
            {stale.map((a) => (
              <span
                key={a.accountId}
                className="-ml-1 rounded-[6px] ring-[1.5px] ring-sink"
              >
                <AccountLogo name={a.name} domain={a.domain} size={18} />
              </span>
            ))}
          </span>
        </>
      ) : (
        <span className="pr-1">{stale.length} balances outdated</span>
      )}
    </button>
  )
}

const SHADES = ['bg-lav-400', 'bg-lav-300', 'bg-lav-600', 'bg-lav-200']

/* One of the three rows: its total, the accounts' logos stacked (four,
   then +n), and a bar split by what each account holds. One height. */
export function GroupRow({
  label,
  total,
  parts,
  stale,
  cash = false,
  note,
  onOpen,
}: {
  label: string
  total: React.ReactNode
  parts: Array<{ a: Row; v: number }>
  stale: Array<Row>
  cash?: boolean
  note?: React.ReactNode
  onOpen: () => void
}) {
  const late = (a: Row) => stale.some((s) => s.accountId === a.accountId)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="motion-press group flex flex-col gap-2 rounded-[13px] bg-sink/35 px-3.5 py-2.5 text-left ring-1 ring-lift/10 backdrop-blur-[3px] transition-[box-shadow,transform] ring-inset hover:-translate-x-0.5 hover:ring-lav-400/45"
    >
      <span className="flex items-center gap-2.5">
        <span className="label-caps flex-1">{label}</span>
        <span className="font-mono text-[13.5px] text-foreground">{total}</span>
        <ChevronRight className="size-4 text-ink-500 group-hover:text-ink-200" />
      </span>
      <span className="flex items-center gap-2.5">
        <span className="flex pl-1">
          {parts.slice(0, 4).map(({ a }) => (
            <span
              key={a.accountId}
              className={`-ml-1 rounded-[6px] ${late(a) ? 'ring-[1.5px] ring-state-warn' : 'ring-[1.5px] ring-sink'}`}
            >
              <AccountLogo name={a.name} domain={a.domain} size={20} />
            </span>
          ))}
          {parts.length > 4 ? (
            <span className="ml-1 grid h-5 place-items-center rounded-[6px] bg-lift/15 px-1.5 font-mono text-[9px] whitespace-nowrap text-ink-200">
              {parts.length - 4} more
            </span>
          ) : null}
        </span>
        <span className="flex h-1.5 flex-1 gap-0.5">
          {parts.map(({ a, v }, i) => (
            <span
              key={a.accountId}
              style={{ flex: Math.max(v, 0.0001) }}
              className={`min-w-1 rounded-full ${cash ? 'bg-money-cash' : SHADES[i % SHADES.length]}`}
            />
          ))}
        </span>
        <span className="font-mono text-[10.5px] whitespace-nowrap text-ink-500">
          {note ??
            `${parts.length} ${parts.length === 1 ? 'account' : 'accounts'}`}
        </span>
      </span>
    </button>
  )
}

/* A group's accounts, opened from its row (or the check-in): each with
   what it holds, how fresh, this month, and update. */
export function AccountList({
  rows,
  group,
  now,
  investedBy,
  monthOf,
  onUpdate,
}: {
  rows: Array<Row>
  group: Group | 'checkin'
  now: number
  investedBy: (id: Id<'accounts'>) => number
  monthOf: (id: Id<'accounts'>) => number | null
  onUpdate: (id: Id<'accounts'>) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {group === 'checkin' ? (
        <span className="text-[13px] text-ink-400">
          Balances older than a week. Add a newer statement or screenshot, or
          type the balance.
        </span>
      ) : null}
      {rows.map((a, i) => {
        const f = balanceFreshness(a.pockets, now)
        const age = f.label
        const late = f.stale
        const m = monthOf(a.accountId)
        const inv = investedBy(a.accountId)
        const showInvested =
          group === 'investments' && a.kinds.includes('broker')
        const showCash = group !== 'investments' || !a.kinds.includes('bank')
        return (
          <div
            key={a.accountId}
            style={{ animationDelay: `${i * 40}ms` }}
            className="motion-land flex items-center gap-3 rounded-[12px] bg-lift/[0.035] p-3 ring-1 ring-lift/10 ring-inset"
          >
            <AccountLogo name={a.name} domain={a.domain} size={30} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-[14px] text-foreground">
                {a.name}
                <span
                  className={`rounded-[5px] px-1.5 font-mono text-[9.5px] ${late ? 'bg-state-warn/12 text-state-warn' : 'text-ink-500'}`}
                >
                  {age}
                </span>
              </span>
              <span className="truncate font-mono text-[11px] text-ink-400">
                <Veiled>
                  {[
                    showInvested ? `invested ${euros(inv)}` : null,
                    showCash
                      ? a.pockets
                          .filter(
                            (p) => p.value !== 0 || a.pockets.length === 1,
                          )
                          .map((p) =>
                            p.value === null
                              ? `${p.currency} balance is missing`
                              : money(p.value, p.currency),
                          )
                          .join(' · ')
                      : null,
                    m !== null && m !== 0
                      ? `${m > 0 ? '+' : '−'}${euros(Math.abs(m))} this month`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Veiled>
              </span>
              {group === 'checkin' && f.todo ? (
                <span className="text-[12px] text-state-warn">{f.todo}</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => onUpdate(a.accountId)}
              className={`motion-press rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] uppercase ring-1 ring-inset ${late ? 'bg-state-warn/10 text-state-warn ring-state-warn/45' : 'text-ink-300 ring-lift/15 hover:text-foreground'}`}
            >
              update
            </button>
          </div>
        )
      })}
    </div>
  )
}
