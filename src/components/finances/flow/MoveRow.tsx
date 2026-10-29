import { ArrowLeftRight, Banknote } from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../../convex/_generated/api'
import type { Doc } from '../../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { cashOut } from '@/lib/cashOut'
import { eur } from './time'

/* One move in Movements (split from Movements.tsx, 29 Oct). */

type Item = FunctionReturnType<typeof api.logs.movements>['items'][number]

export function MoveRow({
  i,
  from,
  to,
}: {
  i: Extract<Item, { type: 'move' }>
  from?: Doc<'accounts'>
  to?: Doc<'accounts'>
}) {
  /* Out of an ATM into his wallet (29 Oct: "LEV ATM …" read as
     "ActivoBank → another account"). */
  const atm = !to && cashOut(i.text)
  return (
    /* Lavender (4 Oct: "transfers make violet"): his own money moving,
       apart from red out and green in at a glance. */
    <div className="my-0.5 grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] bg-lav-400/7 px-1.5 py-2 text-[13.5px] text-lav-200 ring-1 ring-lav-400/15 ring-inset">
      <span className="flex items-center">
        {from ? (
          <AccountLogo name={from.name} domain={from.domain} size={18} />
        ) : null}
        {to ? (
          <span className="-ml-1.5 rounded-[7px] ring-2 ring-background">
            <AccountLogo name={to.name} domain={to.domain} size={18} />
          </span>
        ) : atm ? (
          <Banknote className="-ml-0.5 size-4" />
        ) : null}
        {!from && !to && !atm ? <ArrowLeftRight className="size-4" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block truncate">
          {atm
            ? `${from?.name ?? 'another account'} → cash`
            : !from && !to
              ? `Put aside · ${i.text}`
              : from && to && from._id === to._id
                ? `${from.name} · within the account`
                : `${from?.name ?? 'another account'} → ${to?.name ?? 'another account'}`}
        </span>
        <span className="block font-mono text-[10px] text-lav-300/70">
          {atm ? 'atm' : 'transfer'} · {i.text.toLowerCase()} · not in or out
        </span>
      </span>
      <span className="font-mono text-lav-300">⇄ {eur(i.amount, true)}</span>
    </div>
  )
}
