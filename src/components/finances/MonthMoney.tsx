import { useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { MoneyIcon } from '@/components/finances/icons'
import { MoneyRow } from '@/components/finances/MoneyRow'
import { useDayStarts } from '@/components/track/useDayStarts'
import { compareMonths, monthOf, shiftMonth } from '@/lib/month-grid'
import type { YearMonth } from '@/lib/month-grid'
import { categoryLabel, euros } from '@/lib/money'
import { SkeletonRows } from '@/components/Skeleton'

const MONTH_NAME = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
})

/* Where a month went (F1): out, then in, each by category, biggest first —
   aggregate.moneySums. A category with nothing this month is not shown.
   Tap one and its rows open under it (logs.moneyRows over the same month,
   narrowed to that kind and category — listed, never re-added). ‹ › steps
   back through months; there is none after this one. */
export function MonthMoney() {
  const today = useDayStarts(1).at(-1) as number
  const current = monthOf(new Date(today))
  const [shown, setShown] = useState<YearMonth>(current)
  const [open, setOpen] = useState<string | null>(null)
  const start = new Date(shown.year, shown.month, 1).getTime()
  const end = new Date(shown.year, shown.month + 1, 1).getTime()
  const sums = useQuery(api.aggregate.moneySums, { start, end })
  const rows = useQuery(
    api.logs.moneyRows,
    open === null ? 'skip' : { start, end },
  )

  function step(delta: number) {
    setShown(shiftMonth(shown, delta))
    setOpen(null)
  }

  const groups = (['expense', 'income'] as const).map((kind) => ({
    kind,
    buckets: (sums?.buckets ?? []).filter((b) => b.kind === kind),
  }))

  return (
    <section className="glass flex flex-col gap-4 rounded-[22px] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="motion-press grid size-8 place-items-center rounded-full text-ink-400 ring-1 ring-lift/12 transition-colors ring-inset hover:text-foreground hover:ring-lift/25"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="font-mono text-[12px] tracking-[0.16em] text-ink-200 uppercase">
          {MONTH_NAME.format(new Date(start))}
        </span>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={compareMonths(shown, current) >= 0}
          aria-label="Next month"
          className="motion-press grid size-8 place-items-center rounded-full text-ink-400 ring-1 ring-lift/12 transition-colors ring-inset hover:text-foreground hover:ring-lift/25 disabled:opacity-25"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      {sums === undefined ? (
        <SkeletonRows rows={3} twoLine rowClassName="py-2" />
      ) : sums.out.count + sums.in.count === 0 ? (
        <p className="py-4 text-center text-[13.5px] text-ink-500">
          Nothing logged in {MONTH_NAME.format(new Date(start))}.
        </p>
      ) : (
        <div
          key={`${shown.year}-${shown.month}`}
          className="motion-arrive flex flex-col gap-5"
        >
          {groups.map(({ kind, buckets }) =>
            buckets.length === 0 ? null : (
              <div key={kind} className="flex flex-col gap-1.5">
                <span className="label-caps flex items-center gap-1.5">
                  {kind === 'expense' ? (
                    <ArrowDownRight className="size-3.5 text-area" />
                  ) : (
                    <ArrowUpRight className="size-3.5 text-area" />
                  )}
                  {kind === 'expense' ? 'out' : 'in'} ·{' '}
                  {euros(kind === 'expense' ? sums.out.sum : sums.in.sum)}
                </span>
                {buckets.map((b, i) => {
                  const key = `${kind}:${b.category ?? ''}`
                  const isOpen = open === key
                  return (
                    <div key={key} className="flex flex-col">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : key)}
                        style={{ animationDelay: `${i * 40}ms` }}
                        className={`motion-press motion-land flex min-h-12 items-center gap-3 rounded-[12px] px-2.5 py-2 text-left ring-1 transition-colors ring-inset ${
                          isOpen
                            ? 'bg-lav-400/8 ring-lav-400/35'
                            : 'ring-transparent hover:bg-lift/[0.04] hover:ring-lift/12'
                        }`}
                      >
                        <span
                          className={`grid size-8 shrink-0 place-items-center rounded-full ${
                            b.category === null
                              ? 'bg-state-warn/15'
                              : 'bg-(--area)/15 text-area'
                          }`}
                        >
                          <MoneyIcon
                            kind={kind}
                            category={b.category}
                            className="size-4"
                          />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            className={`text-[14.5px] ${
                              b.category === null
                                ? 'text-state-warn'
                                : 'text-foreground'
                            }`}
                          >
                            {b.category === null
                              ? 'Unsorted — tap to file'
                              : categoryLabel(kind, b.category)}
                          </span>
                          <span className="font-mono text-[11px] text-ink-500">
                            {b.count} {b.count === 1 ? 'log' : 'logs'}
                          </span>
                        </span>
                        <span className="font-mono text-[16px] font-light text-foreground">
                          {euros(b.sum)}
                        </span>
                      </button>
                      {isOpen ? (
                        <div className="motion-arrive ml-6 flex flex-col border-l border-lav-400/20 py-1 pl-2.5">
                          {rows === undefined ? (
                            <span className="h-10" />
                          ) : (
                            rows
                              .filter(
                                (r) =>
                                  r.kind === kind &&
                                  (r.meta?.category ?? null) === b.category,
                              )
                              .map((r) => (
                                <MoneyRow key={r._id} row={r} showDay />
                              ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ),
          )}
        </div>
      )}
    </section>
  )
}
