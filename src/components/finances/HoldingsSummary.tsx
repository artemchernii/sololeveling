import { useState } from 'react'

import { FIELD } from '@/components/finances/bits'
import { money } from '@/lib/currency'

/* The top of the holdings check: what is in the account — total, invested,
   free cash — and what you paid, only where the screen said it. Out of
   HoldingsReview on 10 Oct, when a file of ounces showed its unknown worth
   as €0: what a file does not say is a dash, in the file's own words. */
export function HoldingsSummary({
  targetName,
  totalEur,
  total,
  invested,
  count,
  valued,
  cash,
  setCash,
  cashNum,
  known,
  paid,
  gain,
  fromFile,
}: {
  targetName: string | undefined
  /** The total the screen printed, when it did. */
  totalEur: number | undefined
  total: number
  invested: number
  /** Positions kept, and how many of them say what they are worth. */
  count: number
  valued: number
  cash: string
  setCash: (cash: string) => void
  cashNum: number | null
  /** How many kept positions say what was paid. */
  known: number
  paid: number
  gain: number
  /** Read from a file, not a screenshot. */
  fromFile: boolean
}) {
  const [editCash, setEditCash] = useState(false)
  const worthKnown = totalEur !== undefined || valued > 0 || cashNum !== null
  return (
    <div className="motion-arrive flex flex-col gap-3 rounded-[16px] bg-lift/[0.03] p-4 ring-1 ring-lift/[0.08] ring-inset">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="label-caps">
            total{targetName ? ` in ${targetName}` : ''}
          </span>
          <span className="text-[30px] leading-none font-light tabular-nums">
            {worthKnown ? money(Math.round(total * 100) / 100) : '—'}
          </span>
          <span className="font-mono text-[10.5px] text-ink-500">
            {totalEur !== undefined
              ? 'what the screen shows'
              : worthKnown
                ? 'invested and free cash'
                : 'worth is not in this file'}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="label-caps flex items-center gap-1.5">
            <span className="size-[7px] rounded-full bg-lav-400" />
            invested
          </span>
          <span className="pt-2 text-[22px] leading-none font-light tabular-nums">
            {valued > 0 ? money(Math.round(invested * 100) / 100) : '—'}
          </span>
          <span className="font-mono text-[10.5px] text-ink-500">
            {count} {count === 1 ? 'position' : 'positions'}
            {valued > 0 ? ' · worth now' : ''}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="label-caps flex items-center gap-1.5">
            <span className="size-[7px] rounded-full bg-money-cash" />
            free cash
          </span>
          {editCash ? (
            <input
              autoFocus
              inputMode="decimal"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              onBlur={() => setEditCash(false)}
              aria-label="Free cash in the account"
              className={`${FIELD} mt-1 w-32 py-1 text-[16px]`}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditCash(true)}
              className="pt-2 text-left text-[22px] leading-none font-light tabular-nums"
            >
              {cashNum === null ? (
                <span className="text-[14px] text-ink-500">
                  {fromFile ? 'not in this file' : 'not on the screen'}
                </span>
              ) : (
                money(cashNum)
              )}
            </button>
          )}
          <span className="font-mono text-[10.5px] text-ink-500">
            not invested · tap to change
          </span>
        </div>
      </div>
      {invested + (cashNum ?? 0) > 0 ? (
        <div className="flex h-1.5 gap-0.5">
          <span
            style={{ flex: invested }}
            className="rounded-full bg-lav-400"
          />
          {cashNum ? (
            <span
              style={{ flex: cashNum }}
              className="rounded-full bg-money-cash"
            />
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t border-lift/[0.06] pt-3 text-[13px] text-ink-300">
        {known === 0 ? (
          <>
            <span className="rounded-[6px] bg-lift/[0.06] px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-400 uppercase">
              what you paid · unknown
            </span>
            <span>
              {fromFile ? 'This file' : 'A screenshot'} doesn&apos;t say it.
              Drop a {targetName ?? 'broker'} statement later and it fills in.
            </span>
          </>
        ) : (
          <>
            <span className="rounded-[6px] bg-lift/[0.06] px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-400 uppercase">
              you paid {money(Math.round(paid * 100) / 100)}
            </span>
            <span
              className={`rounded-[6px] px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${gain >= 0 ? 'bg-state-good/14 text-state-good' : 'bg-state-danger/14 text-state-danger'}`}
            >
              {gain >= 0 ? '+' : '−'}
              {money(Math.abs(Math.round(gain * 100) / 100))} ·{' '}
              {paid > 0 ? `${((gain / paid) * 100).toFixed(1)}%` : ''}
            </span>
            <span>
              {known === count
                ? 'as the screen printed it'
                : `on the ${known} of ${count} the screen gave a % for`}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
