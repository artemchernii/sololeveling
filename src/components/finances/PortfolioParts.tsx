import { Veiled } from '@/components/finances/Veil'
import { money } from '@/lib/currency'
import { euros } from '@/lib/money'

/* Gains, in euros and in dollars — split out of Portfolio.tsx (10 Oct). */

/* What was paid and what it is worth, over the rows where both are known
   — a profit is never shown against a cost no file gave. */
export function paidSums(
  rows: ReadonlyArray<{
    paid: number | null
    paidUsd?: number | null
    valueEur: number | null
  }>,
  usdRate: number | null = null,
) {
  let paid = 0
  let value = 0
  let known = 0
  /* The same in dollars (10 Oct): paid at each buy day's rate, worth at
     today's — Revolut's own view of his crypto. */
  let paidUsd = 0
  let valueUsd = 0
  let knownUsd = 0
  for (const r of rows) {
    if (r.paid === null || r.valueEur === null) continue
    paid += r.paid
    value += r.valueEur
    known++
    if (usdRate && r.paidUsd !== undefined && r.paidUsd !== null) {
      paidUsd += r.paidUsd
      valueUsd += r.valueEur / usdRate
      knownUsd++
    }
  }
  return { paid, value, known, paidUsd, valueUsd, knownUsd }
}

/* Profit in green, loss in red — the one place colour means a quantity's
   direction, allowed for P&L in Finances (26 Sep). */
export function ProfitPill({
  profit,
  base,
  label,
  small = false,
  usd = false,
}: {
  profit: number
  base: number
  label?: string
  small?: boolean
  usd?: boolean
}) {
  const up = profit >= 0
  const amount = Math.abs(Math.round(profit * 100) / 100)
  const pct = base > 0 ? (profit / base) * 100 : 0
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-[8px] bg-lift/[0.06] font-mono ${small ? 'px-1.5 py-0.5 text-[11px]' : 'px-3 py-1.5 text-[15px]'} ${up ? 'text-state-good' : 'text-state-danger'}`}
    >
      <Veiled>{`${up ? '+' : '−'}${usd ? money(amount, 'USD') : euros(amount)}`}</Veiled>
      <span>{`${up ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`}</span>
      {label ? <span className="text-[11px] text-ink-500">{label}</span> : null}
    </span>
  )
}

export function DollarLine({
  value,
  paid,
}: {
  value: number
  paid: number | null
}) {
  const pct = paid && paid > 0 ? ((value - paid) / paid) * 100 : null
  return (
    <span className="font-mono text-[10.5px] text-ink-400">
      <Veiled>{money(Math.round(value * 100) / 100, 'USD')}</Veiled>
      {pct === null ? null : (
        <span className={pct >= 0 ? 'text-state-good' : 'text-state-danger'}>
          {' '}
          {pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
        </span>
      )}
    </span>
  )
}
