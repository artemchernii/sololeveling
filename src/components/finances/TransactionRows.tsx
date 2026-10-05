import { useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ArrowLeftRight, TrendingUp } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { groupIcon } from '@/components/finances/GroupBadge'
import { usePayees } from '@/components/finances/flow/Payees'
import { TickerLogo } from '@/components/finances/Logo'
import { money } from '@/lib/currency'
import { sameCompany } from '@/lib/intake'
import { Section } from '@/components/finances/IntakeParts'

export const DAY_FMT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

/* The orders a broker's cash statement printed as rows (splitStatement,
   27 Sep): shares bought and sold inside the account — never "to which
   account?". Grouped by ticker; they fill in what he paid, and the cash
   they used is in the statement's balance already. */
export function OrdersFound({
  orders,
  account,
}: {
  orders: NonNullable<Doc<'intakes'>['trades']>
  account: Doc<'accounts'> | null
}) {
  const positions = useQuery(api.aggregate.positions, {})
  const heldHere = (positions?.rows ?? []).filter(
    (r) => r.accountId === account?._id,
  )
  const by = new Map<
    string,
    {
      symbol: string | null
      name: string
      buys: number
      sells: number
      shares: number
      paid: number
    }
  >()
  for (const o of orders) {
    /* As confirm will file it: under a ticker the account already holds
       when it is the same company (sameCompany), else the search's. */
    const same = sameCompany({ name: o.name, isin: o.isin }, heldHere)
    const c =
      same >= 0
        ? heldHere[same]
        : o.candidates.at(
            o.preferred !== undefined && o.preferred >= 0 ? o.preferred : 0,
          )
    const key = c?.symbol ?? o.isin ?? o.name
    const g = by.get(key) ?? {
      symbol: c?.symbol ?? null,
      name: o.name,
      buys: 0,
      sells: 0,
      shares: 0,
      paid: 0,
    }
    const sign = o.side === 'buy' ? 1 : -1
    if (o.side === 'buy') g.buys++
    else g.sells++
    g.shares += sign * o.shares
    g.paid += sign * o.shares * o.price
    by.set(key, g)
  }
  const groups = [...by.values()].sort(
    (a, b) => b.buys + b.sells - (a.buys + a.sells),
  )
  const buys = orders.filter((o) => o.side === 'buy').length
  const broker = account?.kinds.includes('broker') ?? true
  return (
    <Section
      title={`↔ shares bought and sold${account ? ` in ${account.name}` : ''}`}
      aside={`${buys} buys · ${orders.length - buys} sells`}
    >
      <span className="pb-1 text-[12.5px] text-ink-400">
        Not money leaving — these fill in what you paid for each position. The
        cash they used is in the balance already.
      </span>
      {groups.map((g, i) => (
        <div
          key={g.symbol ?? g.name}
          style={{ animationDelay: `${i * 30}ms` }}
          className="motion-land flex items-center gap-3 border-t border-lift/[0.04] py-2"
        >
          {g.symbol ? (
            <TickerLogo symbol={g.symbol} size={26} />
          ) : (
            <span className="size-[26px] shrink-0 rounded-[7px] bg-state-warn/15" />
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13.5px] text-foreground">
              {g.symbol ?? 'no ticker found'}{' '}
              <span className="text-ink-400">{g.name}</span>
            </span>
            <span className="font-mono text-[10.5px] text-ink-500">
              {[
                g.buys ? `${g.buys} ${g.buys === 1 ? 'buy' : 'buys'}` : null,
                g.sells
                  ? `${g.sells} ${g.sells === 1 ? 'sell' : 'sells'}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              {g.symbol ? '' : ' · left out'}
            </span>
          </span>
          <span className="text-right font-mono text-[12px] text-ink-300">
            {Math.abs(g.shares) < 1e-6
              ? 'sold out'
              : `${g.shares > 0 ? '' : '−'}${Math.abs(g.shares)
                  .toFixed(4)
                  .replace(/\.?0+$/, '')} sh`}
          </span>
        </div>
      ))}
      {!broker ? (
        <span className="font-mono text-[11px] text-state-warn">
          {account?.name} is not a broker — pick the broker these were bought
          in.
        </span>
      ) : null}
    </Section>
  )
}

export function Kpi({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note?: string
  tone?: 'bad' | 'good'
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] bg-lift/[0.035] p-3 ring-1 ring-lift/10 ring-inset">
      <span className="label-caps">{label}</span>
      <span
        className={`text-[19px] font-light ${tone === 'bad' ? 'text-state-danger' : tone === 'good' ? 'text-state-good' : 'text-foreground'}`}
      >
        {value}
      </span>
      {note ? (
        <span className="font-mono text-[10.5px] text-ink-500">{note}</span>
      ) : null}
    </div>
  )
}

export function Row({
  r,
  dim = false,
  order,
  kind,
  children,
}: {
  r: {
    occurredAt: number
    time?: string | null
    merchant: string
    raw: string
    amount: number
    currency: string
    category?: string | null
  }
  dim?: boolean
  /** Its place in the list: rows slide in one after another. */
  order?: number
  kind?: 'spend' | 'income' | 'move'
  children?: React.ReactNode
}) {
  /* The time, its mark, the name and the amount get the line; what he
     decides about the row sits under them, so a phone never cuts a
     merchant to "Tr…". The day is the heading above (5 Oct). */
  return (
    <div
      className={`motion-arrive flex flex-col gap-1.5 border-t border-lift/[0.04] py-2 first:border-t-0 ${dim ? 'opacity-50' : ''}`}
      style={
        order !== undefined
          ? { animationDelay: `${Math.min(order, 12) * 35}ms` }
          : undefined
      }
    >
      <div className="flex items-center gap-2.5">
        <span className="w-10 shrink-0 font-mono text-[11px] text-ink-500">
          {r.time ?? ''}
        </span>
        <RowMark r={r} kind={kind} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] text-foreground">
            {r.merchant}
          </span>
          {r.raw !== r.merchant ? (
            <span className="truncate font-mono text-[10.5px] text-ink-600">
              {r.raw}
            </span>
          ) : null}
        </span>
        <span
          className={`shrink-0 text-right font-mono text-[13px] ${r.amount > 0 ? 'text-state-good' : kind === 'spend' && !dim ? 'text-state-danger' : 'text-ink-100'}`}
        >
          {r.amount > 0 ? '+' : ''}
          {money(r.amount, r.currency)}
        </span>
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-1.5 pl-[86px]">
          {children}
        </div>
      ) : null}
    </div>
  )
}

/** A row's mark: the shop's logo where the app knows its site, else what
    it is — a move, money in, or its group's icon (5 Oct, "Bolt icon +
    Bolt, Salary can have growth icon"). */

function RowMark({
  r,
  kind,
}: {
  r: { merchant: string; raw: string; category?: string | null }
  kind?: 'spend' | 'income' | 'move'
}) {
  const { who } = usePayees()
  const [failed, setFailed] = useState(false)
  const domain = who({ raw: r.raw, name: r.merchant }).domain
  if (domain && !failed && kind !== 'move')
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        alt=""
        aria-hidden
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="size-[26px] shrink-0 rounded-[8px] bg-mark-ground object-contain p-[4px]"
      />
    )
  const Icon =
    kind === 'move'
      ? ArrowLeftRight
      : kind === 'income'
        ? TrendingUp
        : groupIcon(r.category)
  return (
    <span
      className={`grid size-[26px] shrink-0 place-items-center rounded-[8px] ${kind === 'move' ? 'bg-lav-400/14 text-lav-400' : kind === 'income' ? 'bg-state-good/14 text-state-good' : 'bg-lift/[0.06] text-ink-300'}`}
    >
      <Icon className="size-[15px]" />
    </span>
  )
}

/** "your move" — his own money between his own accounts, in the app's
    lavender (5 Oct). */

export function MoveChip() {
  return (
    <span className="rounded-full bg-lav-400/12 px-2 py-0.5 font-mono text-[10.5px] tracking-[0.06em] text-lav-300 uppercase ring-1 ring-lav-400/45 ring-inset">
      your move
    </span>
  )
}

export function DayHeading({ at }: { at: number }) {
  return (
    <span className="pt-2 pb-0.5 font-mono text-[10px] tracking-[0.14em] text-ink-400 uppercase">
      {DAY_FMT.format(new Date(at))}
    </span>
  )
}
