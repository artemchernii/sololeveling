import { Pencil } from 'lucide-react'

import type { api } from '../../../convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'
import { PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { money } from '@/lib/currency'
import { freshness } from '@/lib/freshness'
import { ProfitPill } from '@/components/finances/Portfolio'
import { euros } from '@/lib/money'
import { KindBadge } from '@/components/finances/AccountParts'

type BalanceRow = FunctionReturnType<
  typeof api.aggregate.balances
>['accounts'][number]

/* One account (27 Sep, as mocked on :3950 — "our current in app are faded
   and weak"): lit panel, bright badges, the balance big with its last 30
   days beside it, each pocket, its investments, this month, and a footer
   that says where the balance came from and what to do when it is old. */
export function AccountCard({
  row: a,
  index,
  invested,
  month,
  monthStart,
  held,
  line,
  onEdit,
  onUpdate,
  onOpen,
}: {
  row: BalanceRow
  index: number
  invested: number | null
  month: {
    net: number
    in: number
    out: number
    moves: number
    bought: number
    sold: number
    trades: number
  } | null
  /** Local midnight of the 1st: what "since" says. */
  monthStart: number
  /** A broker's positions: paid and worth where both are known. */
  held: { paid: number; value: number; known: number } | null
  line: Array<number | null>
  onEdit: () => void
  onUpdate: () => void
  /** The account, opened: its rows, balances and files (A.4). */
  onOpen: () => void
}) {
  const f = freshness(a.pockets, Date.now())
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${a.name}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (
          e.target === e.currentTarget &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          e.preventDefault()
          onOpen()
        }
      }}
      style={{ animationDelay: `${index * 40}ms` }}
      className="motion-arrive flex h-full cursor-pointer flex-col gap-3.5 rounded-[18px] bg-lift/[0.055] p-4 ring-1 ring-lift/[0.12] transition-shadow ring-inset hover:ring-lav-400/40"
    >
      <div className="flex items-start gap-3">
        <AccountLogo name={a.name} domain={a.domain} size={40} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-[17px] leading-none text-foreground">
            {a.name}
          </span>
          <span className="flex flex-wrap gap-1">
            {a.kinds.map((k) => (
              <KindBadge key={k} kind={k} />
            ))}
          </span>
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          aria-label={`Edit or delete ${a.name}`}
          className={PILL_QUIET}
        >
          <Pencil className="size-3" />
          edit
        </button>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[30px] leading-none font-light text-foreground">
          <Veiled>
            {euros(Math.round((a.cashEur + (invested ?? 0)) * 100) / 100)}
          </Veiled>
        </span>
        {/* The line is cash only. Where shares are held, cash spent on them
            would draw as a loss (27 Sep, TR's red line), so it waits for
            stored closes to draw the whole account. */}
        {invested !== null && invested > 0 ? null : <Sparkline values={line} />}
      </div>
      <div className="flex flex-col gap-1.5 font-mono text-[12.5px]">
        {a.pockets
          /* "$0 ≈ €0" is noise beside a pocket that holds something. */
          .filter(
            (p) =>
              (p.value !== null && p.value !== 0) || a.pockets.length === 1,
          )
          .map((p) => (
            <span
              key={p.currency}
              className="flex items-center justify-between gap-2"
            >
              <span className="text-ink-400">
                free cash{' '}
                <span className="rounded-[5px] bg-lift/[0.08] px-1.5 py-0.5 text-[10.5px] text-ink-200">
                  {p.currency}
                </span>
              </span>
              <span className="text-ink-100">
                {p.value === null ? (
                  <span className="text-ink-500">not read</span>
                ) : (
                  <Veiled>
                    {money(p.value, p.currency)}
                    {p.currency !== 'EUR' && p.eur !== null ? (
                      <span className="text-ink-500"> ≈ {euros(p.eur)}</span>
                    ) : null}
                  </Veiled>
                )}
              </span>
            </span>
          ))}
        {invested !== null && invested > 0 ? (
          <span className="flex items-center justify-between gap-2">
            <span className="text-ink-400">investments</span>
            <span className="text-ink-100">
              <Veiled>{euros(invested)}</Veiled>
            </span>
          </span>
        ) : null}
        {a.kinds.includes('broker') && !a.kinds.includes('bank') ? (
          /* A broker's month (4 Oct: "brokers are sad without one line …
             bought sold stocks since 1st day of month"), and where its
             positions stand since bought. */
          <>
            <span className="flex items-center justify-between gap-2">
              <span className="text-ink-400">
                since 1{' '}
                {new Date(monthStart).toLocaleDateString('en-GB', {
                  month: 'short',
                })}
              </span>
              {month && month.trades > 0 ? (
                <span className="flex flex-wrap justify-end gap-x-2.5 text-[12px]">
                  {month.bought ? (
                    <span className="text-lav-300">
                      <Veiled>bought {euros(month.bought)}</Veiled>
                    </span>
                  ) : null}
                  {month.sold ? (
                    <span className="text-ink-200">
                      <Veiled>sold {euros(month.sold)}</Veiled>
                    </span>
                  ) : null}
                </span>
              ) : (
                <span className="text-[12px] text-ink-500">no trades yet</span>
              )}
            </span>
            {held && held.known > 0 ? (
              <span className="flex items-center justify-between gap-2">
                <span className="text-ink-400">since bought</span>
                <ProfitPill
                  profit={held.value - held.paid}
                  base={held.paid}
                  small
                />
              </span>
            ) : null}
          </>
        ) : null}
        {a.kinds.includes('bank') && month !== null && month.net !== 0 ? (
          /* "since 1 Oct", and what makes it (4 Oct: "explain what are
             those this month +374 … I dont get those nums"). */
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center justify-between gap-2">
              <span className="text-ink-400">
                since 1{' '}
                {new Date(monthStart).toLocaleDateString('en-GB', {
                  month: 'short',
                })}
              </span>
              <span
                className={
                  month.net > 0 ? 'text-state-good' : 'text-state-danger'
                }
              >
                <Veiled>
                  {month.net > 0 ? '+' : '−'}
                  {euros(Math.abs(month.net))}
                </Veiled>
              </span>
            </span>
            <span className="flex flex-wrap justify-end gap-x-2.5 text-[11px]">
              {month.in ? (
                <span className="text-state-good/80">
                  <Veiled>in +{euros(month.in)}</Veiled>
                </span>
              ) : null}
              {month.out ? (
                <span className="text-state-danger/80">
                  <Veiled>spent −{euros(month.out)}</Veiled>
                </span>
              ) : null}
              {month.moves ? (
                <span className="text-lav-300">
                  <Veiled>
                    transfers {month.moves > 0 ? '+' : '−'}
                    {euros(Math.abs(month.moves))}
                  </Veiled>
                </span>
              ) : null}
            </span>
          </span>
        ) : null}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-lift/[0.08] pt-3">
        <span
          title={f.todo ?? undefined}
          className={`min-w-0 font-mono text-[11px] ${f.stale ? 'text-state-warn' : 'text-ink-400'}`}
        >
          {f.label}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onUpdate()
          }}
          className={
            f.stale
              ? 'motion-press shrink-0 rounded-full bg-state-warn/12 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-state-warn uppercase ring-1 ring-state-warn/50 ring-inset'
              : PILL_QUIET
          }
        >
          update
        </button>
      </div>
    </div>
  )
}

/* The last 30 days of an account's cash, green when it ended higher than
   it began, red when lower — a direction, never a grade. */
function Sparkline({ values }: { values: Array<number | null> }) {
  const pts = values
    .map((v, i) => (v === null ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p !== null)
  if (pts.length < 2) return <span className="flex-1" />
  const min = Math.min(...pts.map((p) => p.v))
  const max = Math.max(...pts.map((p) => p.v))
  const span = max - min || 1
  const w = 120
  const h = 32
  const first = pts[0] as { v: number }
  const last = pts[pts.length - 1] as { v: number }
  const tone =
    last.v > first.v
      ? 'text-state-good'
      : last.v < first.v
        ? 'text-state-danger'
        : 'text-ink-500'
  const d = pts
    .map(
      (p, n) =>
        `${n === 0 ? 'M' : 'L'}${((p.i / (values.length - 1)) * w).toFixed(1)},${(h - 3 - ((p.v - min) / span) * (h - 6)).toFixed(1)}`,
    )
    .join(' ')
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`ml-auto h-8 w-full max-w-[140px] ${tone}`}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  )
}
