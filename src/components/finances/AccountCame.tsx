import { useEffect, useState } from 'react'
import {
  ArrowLeftRight,
  Check,
  Loader2,
  Percent,
  ReceiptText,
  X,
} from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../convex/_generated/api'
import { DAY } from '@/components/finances/BulkParts'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { money } from '@/lib/currency'

/** What Trading 212's history wrote since the block opened (bank.links). */
export type Came = NonNullable<
  FunctionReturnType<typeof api.bank.links>[number]['came']
>
type Line = Came['lines'][number]

const BADGE =
  'justify-self-start rounded-full px-2 py-[3px] font-mono text-[9.5px] font-medium tracking-[0.1em] uppercase ring-1 ring-inset'
const TONE: Record<Line['kind'], string> = {
  buy: 'bg-state-good/16 text-state-good ring-state-good/35',
  sell: 'bg-state-danger/16 text-state-danger ring-state-danger/35',
  dividend: 'bg-state-good/16 text-state-good ring-state-good/35',
  interest: 'bg-state-good/16 text-state-good ring-state-good/35',
  fee: 'text-ink-300 ring-lift/18',
  transfer: 'bg-lav-400/12 text-lav-300 ring-lav-400/38',
}
const TAG =
  'inline-flex max-w-full min-w-0 items-center gap-1 truncate rounded-[5px] px-1.5 font-mono text-[9.5px] tracking-[0.08em] uppercase ring-1 ring-inset'
const shares = (n: number) =>
  `${Math.round(n * 1e4) / 1e4} ${n === 1 ? 'share' : 'shares'}`

/* Trading 212's own rows (18 Oct, t212-history.html): a badge for what
   each is, the company or the account, and the euros it moved — the newest
   three on the card, the rest one press away in the account. It grows into
   the card and stays until he closes it with ✕. Every number is the
   server's. */
export function AccountCame({
  came,
  onShut,
  onMore,
}: {
  came: Came
  onShut: () => Promise<unknown>
  /** "N more": the account, opened. */
  onMore: () => void
}) {
  const [open, setOpen] = useState(false)
  const [shutting, setShutting] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(t)
  }, [])
  const more = came.rows - came.lines.length
  return (
    <div
      data-testid="t212-came"
      className={`grid transition-[grid-template-rows] duration-[450ms] ease-out ${
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-state-good/10 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.06em] text-state-good ring-1 ring-state-good/35 ring-inset">
            <i className="size-1.5 rounded-full bg-current" />
            {came.rows} new
          </span>
          {came.had > 0 ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-lav-400/8 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.06em] text-lav-300/75 ring-1 ring-lav-400/22 ring-inset">
              {came.had} already added
            </span>
          ) : null}
          <span className="mr-auto inline-flex min-w-0 items-center gap-[5px] font-mono text-[10.5px] text-state-good">
            <Check className="motion-pop size-3 shrink-0" strokeWidth={3} />
            <span className="truncate">as Trading 212 shows</span>
          </span>
          <button
            type="button"
            aria-label="close what came"
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
        {/* Wide: the badge has its own column, as the mockup. Narrow (a card
            among three): it starts the line under the name. */}
        <div className="@container rounded-[12px] bg-sink/[0.22] px-2.5 py-1 ring-1 ring-lift/[0.06] ring-inset">
          {came.lines.map((l, i) => (
            <Row key={`${l.kind}${l.at}${i}`} line={l} i={i} />
          ))}
          {more > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onMore()
              }}
              className="flex w-full justify-center border-t border-lift/6 pt-2 pb-1.5 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase hover:text-foreground"
            >
              {more} more ›
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Mark({ line: l }: { line: Line }) {
  if (l.kind === 'transfer' && l.other)
    return <AccountLogo name={l.other.name} domain={l.other.domain} size={22} />
  if (l.symbol !== null)
    return <TickerLogo symbol={l.symbol} name={l.name} size={22} />
  const Icon =
    l.kind === 'interest'
      ? Percent
      : l.kind === 'fee'
        ? ReceiptText
        : ArrowLeftRight
  return (
    <span className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] bg-lav-400/12 text-lav-300">
      <Icon className="size-3" />
    </span>
  )
}

function Row({ line: l, i }: { line: Line; i: number }) {
  const cur = (n: number) => money(n, l.currency)
  const sub =
    l.kind === 'transfer' ? (
      l.other ? (
        <span className={`${TAG} text-state-good ring-state-good/40`}>
          <Check className="size-2.5 shrink-0" strokeWidth={3} />
          <span className="truncate">
            saved in {l.other.name}
            {l.other.at === null ? '' : ` · ${DAY.format(l.other.at)}`}
          </span>
        </span>
      ) : (
        <span className={`${TAG} text-state-warn ring-state-warn/45`}>
          <i className="motion-pulse size-[5px] shrink-0 rounded-full bg-current" />
          not saved in a bank
        </span>
      )
    ) : l.kind === 'interest' ? (
      'free cash'
    ) : l.shares !== null && l.each !== null ? (
      <Veiled>
        {shares(l.shares)} · {cur(l.each)}
        {l.kind === 'dividend' ? ' each' : ''}
      </Veiled>
    ) : null
  return (
    <div
      data-testid="t212-came-line"
      style={{ animationDelay: `${i * 40}ms` }}
      className="motion-arrive grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 border-t border-lift/6 py-2 first:border-t-0 @[380px]:grid-cols-[70px_minmax(0,1fr)_auto]"
    >
      <span className={`${BADGE} ${TONE[l.kind]} hidden @[380px]:block`}>
        {l.kind}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <Mark line={l} />
        <span className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
          <span className="truncate text-[13.5px] text-foreground">
            {l.name}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10.5px] text-ink-500">
            <span
              className={`${BADGE} ${TONE[l.kind]} shrink-0 px-1.5 py-px text-[9px] @[380px]:hidden`}
            >
              {l.kind}
            </span>
            {sub === null ? null : (
              <span className="flex min-w-0 truncate">{sub}</span>
            )}
          </span>
        </span>
      </span>
      <b
        className={`font-mono text-[13.5px] font-normal whitespace-nowrap ${
          l.kind === 'transfer'
            ? 'text-lav-300'
            : l.amount > 0
              ? 'text-state-good'
              : 'text-foreground'
        }`}
      >
        <Veiled>
          {l.amount > 0 ? '+' : '−'}
          {cur(Math.abs(l.amount))}
        </Veiled>
      </b>
    </div>
  )
}
