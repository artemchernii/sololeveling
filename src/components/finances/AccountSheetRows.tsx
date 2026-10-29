import { usePayees } from '@/components/finances/flow/Payees'
import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Banknote,
  RefreshCw,
} from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Busy } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { RowMark } from '@/components/finances/RowMark'
import { cashOut } from '@/lib/intake'
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
/* A day of another year says its year (12 Oct: Revolut's rows went back
   past January and "14 Dec" could be either). */
export const short = (t: number, year = false) => {
  const d = new Date(t)
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(!year && d.getFullYear() === new Date().getFullYear()
      ? {}
      : { year: 'numeric' }),
  })
}

export function Divider({
  label,
  value,
  file,
  typed,
  bank,
  onFile,
}: {
  label: string
  value?: string
  file: FileInfo | undefined
  /** A balance typed by hand: its own line, which removes it. */
  typed?: ReactNode
  /** A connected bank's answer (17 Oct): its logo and "Synced with
      bank", never a PDF. `at` is when it answered. */
  bank?: {
    name: string
    domain?: string
    at: number
    pending: number
    /** The bank's last answer: the only one whose pending is now. */
    latest: boolean
  }
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
      {bank && (file === undefined || file.bank) ? (
        <Synced bank={bank} file={file} onFile={onFile} />
      ) : file ? (
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
              ·{' '}
              {file.positions > 0 && file.added === 0
                ? `${file.positions} ${file.positions === 1 ? 'position' : 'positions'}`
                : `added ${file.added} ${file.added === 1 ? 'row' : 'rows'}`}{' '}
              · read {short(file.readAt)}
            </span>
          </span>
          <span className="font-mono text-[10px] tracking-[0.12em] text-lav-300 uppercase">
            open ›
          </span>
        </button>
      ) : (
        (typed ?? null)
      )}
    </div>
  )
}

const BADGE =
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] uppercase'

/* The bank's answer between the rows (mockup bank-pending.html, his
   "Synced with bank" and a violet icon): the time, what it added, what
   it showed pending. */
function Synced({
  bank,
  file,
  onFile,
}: {
  bank: NonNullable<Parameters<typeof Divider>[0]['bank']>
  file: FileInfo | undefined
  onFile: (id: Id<'intakes'>) => void
}) {
  const time = new Date(bank.at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const body = (
    <>
      <AccountLogo name={bank.name} domain={bank.domain} size={30} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5 text-[13px] text-foreground">
          <RefreshCw className="size-3.5 text-lav-400 drop-shadow-[0_0_6px_var(--color-lav-400)]" />
          Synced with bank
        </span>
        <span className="flex flex-wrap gap-1.5">
          <span className={`${BADGE} bg-lift/[0.05] text-ink-400`}>
            {short(bank.at)} · {time}
          </span>
          {file && file.added > 0 ? (
            bank.latest ? (
              <span className={`${BADGE} bg-state-good/12 text-state-good`}>
                <i className="size-1.5 rounded-full bg-current" />
                {file.added} new
              </span>
            ) : (
              <span className={`${BADGE} bg-lift/[0.05] text-ink-400`}>
                {file.added} saved
              </span>
            )
          ) : null}
          {bank.pending > 0 ? (
            bank.latest ? (
              <span className={`${BADGE} bg-state-warn/12 text-state-warn`}>
                <i className="size-1.5 animate-pulse rounded-full bg-current" />
                {bank.pending} pending
              </span>
            ) : (
              <span className={`${BADGE} bg-lift/[0.05] text-ink-500`}>
                {bank.pending} was pending
              </span>
            )
          ) : null}
        </span>
      </span>
    </>
  )
  return file ? (
    <button
      type="button"
      onClick={() => onFile(file.id)}
      className="motion-press flex items-center gap-2.5 rounded-[10px] bg-sink/30 px-2.5 py-2 text-left hover:bg-sink/50"
    >
      {body}
      <span className="font-mono text-[10px] tracking-[0.12em] text-lav-300 uppercase">
        open ›
      </span>
    </button>
  ) : (
    <span className="flex items-center gap-2.5 rounded-[10px] bg-sink/30 px-2.5 py-2">
      {body}
    </span>
  )
}

/** A row the bank shows pending: never saved, named under its day. */
export function PendingLine({
  merchant,
  amount,
  currency,
}: {
  merchant: string
  amount: number
  currency: string
}) {
  const { who } = usePayees()
  const named = who({ name: merchant })
  return (
    <div
      data-testid="pending-row"
      className="motion-land flex items-center gap-2.5 rounded-[10px] px-2.5 py-2"
    >
      <span className="opacity-70">
        <RowMark name={merchant} category={null}>
          <span className="grid size-[26px] shrink-0 place-items-center rounded-[8px] bg-lift/[0.06] text-ink-400">
            <ArrowUp className="size-3.5" />
          </span>
        </RowMark>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[13.5px] text-foreground">
          {named.name}
        </span>
        <span
          className={`${BADGE} self-start bg-state-warn/12 text-state-warn`}
        >
          <i className="size-1.5 animate-pulse rounded-full bg-current" />
          pending
        </span>
      </span>
      <span className="font-mono text-[13.5px] whitespace-nowrap text-ink-400">
        <Veiled>{fmt(amount, currency, true)}</Veiled>
      </span>
    </div>
  )
}

export function RowLine({
  row: r,
  inside,
  index,
  onDelete,
  onNotHere,
  booked = false,
}: {
  row: Row
  /** The day of the balance that already covers this typed row. */
  inside: number | null
  index: number
  /** Pending at the last answer, booked at this one: says so for a
      moment, then is a row like the others. */
  booked?: boolean
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
  /* The same name Movements gives the row (13 Oct), the bank's line
     underneath. A trade is named by its ticker already. */
  const { who } = usePayees()
  const named = traded ? null : who({ name: r.text })
  const cls = moved
    ? 'text-lav-300'
    : r.amount > 0
      ? 'text-state-good'
      : 'text-foreground'
  /* Out of an ATM into his wallet: a move with no account on the other
     side, said as ATM · CASH with a banknote. */
  const atm = moved && !r.other && cashOut(r.text)
  const Icon = atm
    ? Banknote
    : moved || traded
      ? ArrowLeftRight
      : r.amount > 0
        ? ArrowDown
        : ArrowUp
  /* A shop the app knows shows its logo, else the row's group its icon
     (RowMark, 11 Oct); a transfer, a trade and a row with neither keep
     the arrow. */
  return (
    <div
      style={{ animationDelay: `${Math.min(index, 20) * 18}ms` }}
      className={`motion-land group flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 hover:bg-lift/[0.035] ${booked ? 'motion-booked' : ''}`}
    >
      <RowMark
        name={moved || traded ? '' : r.text}
        category={moved || traded ? null : r.category}
        income={r.amount > 0}
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
      </RowMark>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          data-testid="row-name"
          className="truncate text-[13.5px] text-foreground"
        >
          {named?.name ?? r.text}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-ink-500">
          {named?.original ? (
            <span data-testid="row-bank" className="max-w-full truncate">
              {named.original}
              {moved || r.category ? ' ·' : ''}
            </span>
          ) : null}
          {moved ? (
            <span className="rounded-[5px] px-1.5 text-[9.5px] tracking-[0.08em] text-lav-300 uppercase ring-1 ring-lav-400/35 ring-inset">
              {atm ? (
                'atm · cash'
              ) : (
                <>
                  transfer{' '}
                  {r.other
                    ? ` · ${r.amount < 0 ? '→' : '←'} ${r.other}`
                    : ' · own account'}
                </>
              )}
            </span>
          ) : traded ? (
            <span className="rounded-[5px] px-1.5 text-[9.5px] tracking-[0.08em] text-lav-300 uppercase ring-1 ring-lav-400/35 ring-inset">
              {r.kind}
            </span>
          ) : r.category ? (
            <span>{r.category}</span>
          ) : null}
          {booked ? (
            <span
              data-testid="booked"
              className={`${BADGE} motion-booked-badge bg-state-good/12 text-state-good`}
            >
              booked
            </span>
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
          title={`Added from ${r.sideOf ?? 'another account'}'s file. Deleting it here keeps the row in ${r.sideOf ?? 'that account'}.`}
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
