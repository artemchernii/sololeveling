import { useState } from 'react'
import { ArrowDown, ArrowLeftRight, ArrowUp } from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Busy } from '@/components/finances/bits'
import { Veiled } from '@/components/finances/Veil'

/* The account sheet's lines (split from OpenAccount.tsx, 5 Oct): a
   balance or a file between the rows, and one row with its delete. */

type SheetData = NonNullable<
  FunctionReturnType<typeof api.aggregate.accountSheet>
>
type Row = SheetData['rows'][number]
type FileInfo = SheetData['files'][number]

export const fmt = (v: number, currency = 'EUR', sign = false) => {
  const s = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(v))
  return `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}${s}`
}
export const short = (t: number) =>
  new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function Divider({
  label,
  value,
  file,
  typed = false,
  onFile,
}: {
  label: string
  value?: string
  file: FileInfo | undefined
  typed?: boolean
  onFile: (id: Id<'intakes'>) => void
}) {
  return (
    <div className="motion-arrive my-2 flex flex-col gap-2 rounded-[14px] bg-lav-400/[0.06] px-3 py-2.5 ring-1 ring-lav-400/22 ring-inset">
      <span className="flex items-baseline gap-2.5">
        <span className="label-caps text-lav-300">{label}</span>
        {value ? (
          <b className="ml-auto font-mono text-[14px] font-medium text-foreground">
            <Veiled>{value}</Veiled>
          </b>
        ) : null}
      </span>
      {file ? (
        <button
          type="button"
          onClick={() => onFile(file.id)}
          className="motion-press flex items-center gap-2.5 rounded-[10px] bg-sink/30 px-2.5 py-2 text-left hover:bg-sink/50"
        >
          <span className="grid h-[30px] w-[26px] shrink-0 place-items-center rounded-[5px] bg-lift/[0.08] font-mono text-[8.5px] text-ink-300">
            {file.images ? 'IMG' : 'PDF'}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] text-foreground">
              {file.names.join(' · ') || file.title}
            </span>
            <span className="font-mono text-[10.5px] text-ink-400">
              {file.images
                ? `${file.names.length} ${file.names.length === 1 ? 'screenshot' : 'screenshots'}`
                : 'statement'}
              {file.from !== null && file.to !== null
                ? ` · ${short(file.from)} → ${short(file.to)}`
                : ''}{' '}
              · added {file.added} {file.added === 1 ? 'row' : 'rows'} · read{' '}
              {short(file.readAt)}
            </span>
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] text-lav-300 uppercase">
            open ›
          </span>
        </button>
      ) : typed ? (
        <span className="font-mono text-[10.5px] text-ink-400">
          typed by you
        </span>
      ) : null}
    </div>
  )
}

export function RowLine({
  row: r,
  inside,
  index,
  onDelete,
  onNotHere,
}: {
  row: Row
  /** The day of the balance that already covers this typed row. */
  inside: number | null
  index: number
  onDelete?: () => Promise<unknown>
  /** The other side of another account's transfer: "not from here". */
  onNotHere?: () => Promise<unknown>
}) {
  /* A press answers at once (5 Oct, every press answers): the row says
     what it is doing until it is gone. */
  const [doing, setDoing] = useState<string | null>(null)
  const run = (what: string, write: () => Promise<unknown>) => () => {
    setDoing(what)
    void write().catch(() => setDoing(null))
  }
  const moved = r.kind === 'move'
  const traded = r.kind === 'buy' || r.kind === 'sell'
  const cls = moved
    ? 'text-lav-300'
    : r.amount > 0
      ? 'text-state-good'
      : 'text-foreground'
  const Icon =
    moved || traded ? ArrowLeftRight : r.amount > 0 ? ArrowDown : ArrowUp
  return (
    <div
      style={{ animationDelay: `${Math.min(index, 20) * 18}ms` }}
      className="motion-land group flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 hover:bg-lift/[0.035]"
    >
      <span
        className={`grid size-[26px] shrink-0 place-items-center rounded-[8px] ${
          moved || traded
            ? 'bg-lav-400/12 text-lav-300'
            : r.amount > 0
              ? 'bg-state-good/14 text-state-good'
              : 'bg-lift/[0.06] text-ink-400'
        }`}
      >
        <Icon className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13.5px] text-foreground">{r.text}</span>
        <span className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-ink-500">
          {moved ? (
            <span className="rounded-[5px] px-1.5 text-[9.5px] tracking-[0.08em] text-lav-300 uppercase ring-1 ring-lav-400/35 ring-inset">
              move
              {r.other
                ? ` · ${r.amount < 0 ? '→' : '←'} ${r.other}`
                : ' · your own money'}
            </span>
          ) : traded ? (
            <span className="rounded-[5px] px-1.5 text-[9.5px] tracking-[0.08em] text-lav-300 uppercase ring-1 ring-lav-400/35 ring-inset">
              {r.kind}
            </span>
          ) : r.category ? (
            <span>{r.category}</span>
          ) : null}
          {r.logId ? (
            <span className="rounded-[5px] px-1.5 text-[9.5px] tracking-[0.08em] text-ink-300 uppercase ring-1 ring-lift/10 ring-inset">
              typed
            </span>
          ) : null}
          {inside !== null ? (
            /* Information, not a warning (2 Oct: in amber it read as one,
               on the very row that made the balance add up). */
            <span className="rounded-[5px] px-1.5 text-[9.5px] tracking-[0.08em] text-ink-400 uppercase ring-1 ring-lift/10 ring-inset">
              in the {short(inside)} balance
            </span>
          ) : null}
        </span>
      </span>
      {doing ? (
        <span className="px-1 font-mono text-[10px] tracking-[0.1em] text-ink-300 uppercase">
          <Busy on doing={doing}>
            {null}
          </Busy>
        </span>
      ) : null}
      {onNotHere && !doing ? (
        <button
          type="button"
          onClick={run('removing', onNotHere)}
          title={`Written because ${r.sideOf ?? 'another account'}'s file said it came from here. Remove only this side; ${r.sideOf ?? 'that account'} keeps its row.`}
          className="px-1 font-mono text-[10px] tracking-[0.1em] text-state-warn uppercase opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          not from here
        </button>
      ) : null}
      {onDelete && !doing ? (
        <button
          type="button"
          onClick={run('deleting', onDelete)}
          className="px-1 font-mono text-[10px] tracking-[0.1em] text-state-danger uppercase opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          delete
        </button>
      ) : null}
      <span className={`font-mono text-[13.5px] whitespace-nowrap ${cls}`}>
        <Veiled>{fmt(r.amount, r.currency, true)}</Veiled>
      </span>
    </div>
  )
}
