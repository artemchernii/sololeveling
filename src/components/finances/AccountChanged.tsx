import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Landmark, Loader2, X } from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../convex/_generated/api'
import { DAY } from '@/components/finances/BulkParts'
import { TickerLogo } from '@/components/finances/Logo'
import { Sheet } from '@/components/finances/Sheet'
import { Veiled } from '@/components/finances/Veil'
import { money } from '@/lib/currency'
import { UNPRICED } from '@/lib/market'

/** What Trading 212's answers changed since the last look (bank.links). */
export type Changed = NonNullable<
  FunctionReturnType<typeof api.bank.links>[number]['changed']
>

const ON_CARD = 3
/* The mark, the name, then two amounts that line up down the block. The
   shares get the whole width underneath: a card is narrow. */
const COLS =
  'grid grid-cols-[28px_minmax(0,1fr)_62px_80px] items-center gap-x-1.5 px-2.5'
const shares = (n: number) => String(Math.round(n * 1e4) / 1e4)

/* What changed at Trading 212 (12 Oct, trading-212.html): one line per
   company — what it was worth in the account at the last look, and now,
   with an arrow; the shares small underneath ("amount is important") —
   and the free cash. It grows into the card and stays until he closes it
   with ✕. Three lines on the card; the rest open in a window, so the card
   stays one size. Every number is the server's. */
export function AccountChanged({
  changed,
  onShut,
}: {
  changed: Changed
  onShut: () => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [shutting, setShutting] = useState(false)
  const [all, setAll] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(t)
  }, [])
  const cash = changed.cash ? (
    <Line
      key="cash"
      mark={
        <span className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-money-cash/10 text-money-cash">
          <Landmark className="size-3.5" />
        </span>
      }
      name="Free cash"
      sub={changed.cash.currency}
      was={money(changed.cash.was, changed.cash.currency)}
      now={money(changed.cash.now, changed.cash.currency)}
      way={Math.sign(changed.cash.now - changed.cash.was)}
    />
  ) : null
  const lines = changed.lines.map((l) => (
    <Line
      key={l.symbol}
      mark={
        <TickerLogo symbol={l.symbol} type={l.type} name={l.name} size={28} />
      }
      name={l.name}
      sub={
        l.type === UNPRICED
          ? `${shares(l.now)} shares · price from Trading 212`
          : `${shares(l.was)} → ${shares(l.now)} shares`
      }
      lit={l.type === UNPRICED}
      was={l.wasEur === null ? '—' : money(l.wasEur)}
      now={l.nowEur === null ? '—' : money(l.nowEur)}
      way={
        l.wasEur !== null && l.nowEur !== null
          ? Math.sign(l.nowEur - l.wasEur)
          : Math.sign(l.now - l.was)
      }
    />
  ))
  const count = lines.length + (cash ? 1 : 0)
  const more = count - ON_CARD
  const head = (
    <div
      className={`${COLS} py-[7px] text-[9.5px] tracking-[0.12em] text-ink-500 uppercase`}
    >
      <span className="col-span-2" />
      <span className="text-right">{DAY.format(changed.at)}</span>
      <span className="text-right">now</span>
    </div>
  )
  const TABLE =
    'overflow-hidden rounded-[12px] bg-sink/[0.22] font-mono text-[12px] ring-1 ring-lift/[0.06] ring-inset'
  return (
    <div
      data-testid="t212-changed"
      className={`grid transition-[grid-template-rows] duration-[450ms] ease-out ${
        open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className="flex min-h-0 flex-col gap-2.5 overflow-hidden">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-state-good/10 px-2.5 py-1 font-mono text-[10.5px] tracking-[0.06em] text-state-good ring-1 ring-state-good/35 ring-inset">
            <i className="size-1.5 rounded-full bg-current" />
            {count} changed
          </span>
          <span className="mr-auto inline-flex min-w-0 items-center gap-[5px] font-mono text-[10.5px] text-state-good">
            <Check className="motion-pop size-3 shrink-0" strokeWidth={3} />
            <span className="truncate">as Trading 212 shows</span>
          </span>
          <button
            type="button"
            aria-label="close what changed"
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
        <div className={TABLE}>
          {head}
          {more > 0
            ? [...lines.slice(0, cash ? ON_CARD - 1 : ON_CARD), cash]
            : [...lines, cash]}
        </div>
        {more > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setAll(true)
            }}
            className="self-start font-mono text-[10.5px] tracking-[0.12em] text-lav-400 uppercase"
          >
            {more} more
          </button>
        ) : null}
      </div>
      {/* A window of its own: a press in it is not a press on the card. */}
      <span onClick={(e) => e.stopPropagation()}>
        <Sheet
          open={all}
          title={`${count} changed`}
          onClose={() => setAll(false)}
        >
          <div className={`${TABLE} max-h-[52vh] overflow-auto`}>
            {head}
            {lines}
            {cash}
          </div>
        </Sheet>
      </span>
    </div>
  )
}

function Line({
  mark,
  name,
  sub,
  lit = false,
  was,
  now,
  way,
}: {
  mark: React.ReactNode
  name: string
  sub: string
  /** Said in lavender: the price is Trading 212's own. */
  lit?: boolean
  was: string
  now: string
  /** Up, down, or the same. */
  way: number
}) {
  return (
    <div
      className={`${COLS} min-h-[42px] border-t border-lift/[0.06] py-[7px] text-[11.5px]`}
    >
      <span className="row-span-2 self-center">{mark}</span>
      <span className="truncate font-sans text-[12.5px] text-ink-200">
        {name}
      </span>
      <span className="text-right whitespace-nowrap text-ink-500">
        <Veiled>{was}</Veiled>
      </span>
      <span className="flex items-center justify-end gap-[5px] whitespace-nowrap text-ink-100">
        {way > 0 ? (
          <ArrowUp
            aria-label="up"
            className="motion-pop size-3 text-state-good"
            strokeWidth={2.6}
          />
        ) : way < 0 ? (
          <ArrowDown
            aria-label="down"
            className="motion-pop size-3 text-state-danger"
            strokeWidth={2.6}
          />
        ) : null}
        <Veiled>{now}</Veiled>
      </span>
      <small
        className={`col-span-3 truncate font-mono text-[10px] leading-[1.35] ${lit ? 'text-lav-300' : 'text-ink-500'}`}
      >
        {sub}
      </small>
    </div>
  )
}
