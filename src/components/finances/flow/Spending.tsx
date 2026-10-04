import { useEffect, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../../convex/_generated/api'
import { MoneyRow } from '@/components/finances/MoneyRow'
import { Sheet } from '@/components/finances/Sheet'
import { SkeletonRows } from '@/components/Skeleton'
import { categoryLabel } from '@/lib/money'
import { spendingOf } from '@/lib/spending'
import { PILL_QUIET } from '@/components/finances/bits'
import type { Span } from './time'
import { eur, monthName } from './time'

type Months = FunctionReturnType<typeof api.aggregate.flowMonths>

/* SPENDING (journey steps 2 and 7: "is my spending growing, and on
   what?"). One month's groups, biggest first, each with six small bars
   of its last six months and the change on the month before; the group
   that grew most said in one line. Tap a group: its rows, both months. */
export function Spending({
  months,
  spans,
  today,
  open,
}: {
  months: Months | undefined
  spans: ReadonlyArray<Span>
  today: number
  /** "2026-08": a month asked for in the URL. */
  open?: string
}) {
  const early = new Date(today).getDate() < 10
  const [picked, setPicked] = useState<number | null>(null)
  const [group, setGroup] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!open) return
    const [y, m] = open.split('-').map(Number)
    const i = spans.findIndex((s) => {
      const d = new Date(s.start)
      return d.getFullYear() === y && d.getMonth() === m - 1
    })
    if (i !== -1) setPicked(i)
  }, [open, spans])
  if (months === undefined) {
    return (
      <section className="glass rounded-[22px] p-4 sm:p-5">
        <SkeletonRows rows={6} />
      </section>
    )
  }
  const last = months.length - 1
  /* Early in a month, the month just closed says more than three days. */
  const at = picked ?? (early && last > 0 ? last - 1 : last)
  const s = spendingOf(months, at)
  const max = Math.max(1, ...s.lines.map((l) => l.now))
  const name = (c: string | null) => categoryLabel('expense', c)
  const nothing = months.every((m) => m.rows === 0)

  return (
    <section className="glass motion-arrive flex flex-col gap-3 rounded-[22px] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="system-title">[ WHERE IT WENT ]</span>
        <span className="flex flex-wrap gap-1">
          {months.slice(-6).map((m, i) => {
            const idx = months.length - 6 + i
            return (
              <button
                key={m.start}
                type="button"
                onClick={() => setPicked(idx)}
                className={`${PILL_QUIET} ${idx === at ? 'bg-lav-400/16 text-foreground ring-lav-400/45' : ''}`}
              >
                {monthName(m.start)}
                {idx === last ? ' so far' : ''}
              </button>
            )
          })}
        </span>
      </div>
      {nothing ? (
        <p className="py-6 text-center text-[13.5px] leading-relaxed text-ink-400">
          <span className="block text-[16px] text-foreground">
            No spending read yet
          </span>
          Every payment from your statements lands in a group. Six months of it
          shows how each one is changing.
        </p>
      ) : (
        <>
          <p className="text-[13.5px] leading-relaxed text-ink-300">
            {s.grew ? (
              <>
                <span className="text-foreground">
                  {name(s.grew.category)} {eur(s.grew.now)}, up{' '}
                  {eur(s.grew.change)} on {monthName(spans[at - 1]?.start ?? 0)}
                </span>{' '}
                — the most of any group.{' '}
              </>
            ) : null}
            {monthName(spans[at]?.start ?? 0)}: −{eur(s.total)} out
            {s.hasPrev ? (
              <>
                ,{' '}
                {s.total > s.prevTotal ? (
                  <span className="text-state-danger">
                    {eur(s.total - s.prevTotal)} more
                  </span>
                ) : (
                  <span className="text-state-good">
                    {eur(s.prevTotal - s.total)} less
                  </span>
                )}{' '}
                than {monthName(spans[at - 1]?.start ?? 0)}
              </>
            ) : null}
            .
          </p>
          <div className="flex flex-col">
            {s.lines.map((l) => {
              const d = l.now - l.prev
              const smax = Math.max(1, ...l.six)
              return (
                <button
                  key={l.category ?? ''}
                  type="button"
                  onClick={() => setGroup(l.category)}
                  className="grid grid-cols-[92px_minmax(0,1fr)_92px_58px] items-center gap-3.5 rounded-[8px] border-b border-lift/5 px-1.5 py-2.5 text-left transition-colors hover:bg-lift/[0.035] md:grid-cols-[150px_1fr_120px_96px_86px]"
                >
                  <span className="flex flex-col">
                    <span className="truncate text-[14px]">
                      {name(l.category)}
                    </span>
                    <span className="font-mono text-[10px] text-ink-500">
                      {l.count} payment{l.count === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-lift/5">
                    <span
                      className="motion-arrive block h-full rounded-full bg-money-cash"
                      style={{ width: `${(l.now / max) * 100}%` }}
                    />
                  </span>
                  <svg
                    viewBox="0 0 120 26"
                    className="hidden h-[26px] w-[120px] md:block"
                    aria-hidden
                  >
                    {l.six.map((v, i) => (
                      <rect
                        key={i}
                        x={i * 20 + 2}
                        y={24 - (v / smax) * 22}
                        width={14}
                        height={Math.max(1, (v / smax) * 22)}
                        rx={2}
                        className={i === 5 ? 'fill-money-cash' : 'fill-lift/15'}
                      />
                    ))}
                  </svg>
                  <span className="text-right font-mono whitespace-nowrap">
                    −{eur(l.now, true)}
                  </span>
                  <span
                    className={`text-right font-mono text-[12px] ${
                      Math.abs(d) < 5
                        ? 'text-ink-500'
                        : d > 0
                          ? 'text-state-danger'
                          : 'text-state-good'
                    }`}
                  >
                    {Math.abs(d) < 5
                      ? 'same'
                      : `${d > 0 ? '▲' : '▼'} ${eur(Math.abs(d))}`}
                  </span>
                </button>
              )
            })}
          </div>
          <span className="label-caps leading-relaxed">
            bar: this month · six small bars: the last six months · ▲ more spent
            than the month before
          </span>
        </>
      )}
      <Sheet
        open={group !== undefined}
        title={`${group !== undefined ? name(group) : ''} · ${monthName(spans[at]?.start ?? 0)}`}
        onClose={() => setGroup(undefined)}
      >
        {group !== undefined && spans[at] ? (
          <GroupRows category={group} now={spans[at]} prev={spans[at - 1]} />
        ) : null}
      </Sheet>
    </section>
  )
}

/* A group's rows, this month and the one before: the sums opened (PLAN.md
   §1), listed by moneyRows and never re-added. */
function GroupRows({
  category,
  now,
  prev,
}: {
  category: string | null
  now: Span
  prev?: Span
}) {
  const span = { start: prev?.start ?? now.start, end: now.end }
  const rows = useQuery(api.logs.moneyRows, span)
  if (rows === undefined) return <SkeletonRows rows={4} />
  const mine = rows.filter(
    (r) => r.kind === 'expense' && (r.meta?.category ?? null) === category,
  )
  const part = (s: Span) =>
    mine.filter((r) => r.occurredAt >= s.start && r.occurredAt < s.end)
  return (
    <div className="flex flex-col gap-4">
      {[now, prev].map((s) =>
        s ? (
          <div key={s.start} className="flex flex-col">
            <span className="label-caps mb-1">{monthName(s.start)}</span>
            {part(s).length ? (
              part(s).map((r) => <MoneyRow key={r._id} row={r} showDay />)
            ) : (
              <span className="text-[13px] text-ink-500">
                Nothing in this group.
              </span>
            )}
          </div>
        ) : null,
      )}
    </div>
  )
}
