import { useEffect, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'

import { DAY } from '@/components/finances/BulkParts'
import { Veiled } from '@/components/finances/Veil'
import { money } from '@/lib/currency'

/** Rows the bank brought that were saved by themselves (bank.links). */
export type Arrived = {
  rows: number
  currency: string
  was: number
  wasAt: number
  out: number
  in: number
  now: number
}

/* What arrived from the bank (11 Oct, bank-connected.html): how many rows,
   that they reach the bank's balance, and the same four numbers as the
   check — was · out · in · now. It grows into the card and stays until he
   closes it with ✕. Every number is the server's. */
export function AccountArrived({
  arrived,
  onShut,
}: {
  arrived: Arrived
  onShut: () => Promise<unknown>
}) {
  /* Grown in after the first paint, so the card glides taller. */
  const [open, setOpen] = useState(false)
  const [shutting, setShutting] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(t)
  }, [])
  const cur = (n: number) => money(n, arrived.currency)
  return (
    <div
      data-testid="bank-arrived"
      className={`grid transition-[grid-template-rows] duration-[450ms] ease-out ${
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-state-good/10 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.06em] text-state-good ring-1 ring-state-good/35 ring-inset">
            <i className="size-1.5 rounded-full bg-current" />
            {arrived.rows} new
          </span>
          <span className="mr-auto inline-flex min-w-0 items-center gap-[5px] font-mono text-[10.5px] text-state-good">
            <Check className="motion-pop size-3 shrink-0" strokeWidth={3} />
            <span className="truncate">as the bank shows</span>
          </span>
          <button
            type="button"
            aria-label="close what arrived"
            disabled={shutting}
            onClick={(e) => {
              e.stopPropagation()
              setShutting(true)
              void onShut().finally(() => setShutting(false))
            }}
            className="motion-press grid size-[26px] shrink-0 place-items-center rounded-full text-ink-400 ring-1 ring-lift/[0.14] ring-inset hover:text-foreground hover:ring-lav-400/40"
          >
            {shutting ? (
              <Loader2 className="save-spinner size-3" />
            ) : (
              <X className="size-3" />
            )}
          </button>
        </div>
        {/* Four on one line where the card is wide enough, else two and two. */}
        <div className="@container">
          <div className="grid grid-cols-2 overflow-hidden rounded-[12px] bg-sink/[0.22] ring-1 ring-lift/[0.06] ring-inset @[270px]:grid-cols-[repeat(4,auto)]">
            <Cell label={`was · ${DAY.format(arrived.wasAt)}`}>
              <span className="text-ink-200">{cur(arrived.was)}</span>
            </Cell>
            <Cell label="out">
              <span
                className={
                  arrived.out > 0 ? 'text-state-danger' : 'text-ink-500'
                }
              >
                {cur(arrived.out)}
              </span>
            </Cell>
            <Cell label="in">
              <span
                className={arrived.in > 0 ? 'text-state-good' : 'text-ink-500'}
              >
                {cur(arrived.in)}
              </span>
            </Cell>
            <Cell label="now" lit>
              <span className="font-normal text-foreground">
                {cur(arrived.now)}
              </span>
            </Cell>
          </div>
        </div>
      </div>
    </div>
  )
}

function Cell({
  label,
  lit = false,
  children,
}: {
  label: string
  lit?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-[3px] px-2 py-2 ring-1 ring-lift/[0.035] ${
        lit ? 'bg-lav-400/[0.07]' : ''
      }`}
    >
      <span className="truncate font-mono text-[9.5px] tracking-[0.04em] text-ink-500 uppercase">
        {label}
      </span>
      <b className="truncate text-[14px] font-light">
        <Veiled>{children}</Veiled>
      </b>
    </div>
  )
}
