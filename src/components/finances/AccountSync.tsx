import { RefreshCw, X } from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'

import type { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import type { DayLine } from '@/lib/sheetDays'
import { lastSync } from '@/lib/bankLink'
import { fmt, short } from './AccountSheetRows'
import { shownBalance } from './sheetBalances'

/* The clean account list (31 Oct, sync-line.html; his "too much noise. I
   want have a clean list of transactions and maybe some indicator its
   synced from bank"): the bank's syncs leave the list. The newest is one
   pill on top; one that left money with no row is a red strip there; the
   list is days and rows. */

type SheetData = NonNullable<
  FunctionReturnType<typeof api.aggregate.accountSheet>
>
type Reading = SheetData['readings'][number]
type FileInfo = SheetData['files'][number]

const BADGE =
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] whitespace-nowrap uppercase'

const clock = (t: number) =>
  new Date(t).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

export function SyncPill({
  reading,
  file,
  name,
  domain,
  onFile,
}: {
  reading: Reading
  file: FileInfo | undefined
  name: string
  domain?: string
  onFile: (id: Id<'intakes'>) => void
}) {
  const body = (
    <>
      <AccountLogo name={name} domain={domain} size={30} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 font-mono text-[10.5px] font-semibold tracking-[0.16em] text-lav-300 uppercase">
          <RefreshCw className="size-3.5 animate-[spin_1.2s_ease-out_1] drop-shadow-[0_0_6px_var(--color-lav-400)]" />
          synced with bank
        </span>
        <span className="font-mono text-[11px] text-ink-400">
          {short(reading.at)} · {clock(reading.at)}
        </span>
      </span>
      {file && file.added > 0 ? (
        <span className={`${BADGE} bg-state-good/12 text-state-good`}>
          <i className="size-1.5 rounded-full bg-current" />
          {file.added} new
        </span>
      ) : null}
      {reading.pendingRows.length > 0 ? (
        <span className={`${BADGE} bg-state-warn/12 text-state-warn`}>
          <i className="size-1.5 animate-pulse rounded-full bg-current" />
          {reading.pendingRows.length} pending
        </span>
      ) : null}
      {file ? (
        <span className="font-mono text-[10px] tracking-[0.12em] text-lav-300 uppercase">
          open ›
        </span>
      ) : null}
    </>
  )
  const cls =
    'motion-arrive flex items-center gap-3 rounded-[14px] bg-linear-to-r from-lav-400/[0.13] to-lav-400/[0.03] px-3 py-2.5 text-left ring-1 ring-lav-400/30 ring-inset'
  return file ? (
    <button
      type="button"
      data-testid="sync-pill"
      onClick={() => onFile(file.id)}
      className={`${cls} motion-press hover:from-lav-400/[0.18]`}
    >
      {body}
    </button>
  ) : (
    <div data-testid="sync-pill" className={cls}>
      {body}
    </div>
  )
}

/** A sync whose balance the rows do not reach: one strip on top, never a
    card in the list. */
export function NoRowStrip({
  missing,
  currency,
  at,
}: {
  missing: number
  currency: string
  at: number
}) {
  return (
    <div
      data-testid="sync-missing"
      className="motion-arrive flex items-center gap-2.5 rounded-[14px] bg-state-danger/[0.08] px-3 py-2.5 font-mono text-[10.5px] tracking-[0.1em] text-state-danger uppercase ring-1 ring-state-danger/30 ring-inset"
    >
      <X className="size-3.5" />
      <b className="font-semibold">no row</b>
      <Veiled>{fmt(missing, currency, true)}</Veiled>
      <span className="text-state-danger/70">· {short(at)}</span>
    </div>
  )
}

/** FRI 23 OCT · 3 OUT −€31.40 ─── BALANCE €1,003.50 */
export function DayHead({
  label,
  line,
}: {
  label: string
  line: DayLine | null
}) {
  return (
    <span className="flex items-center gap-2 px-0.5 pt-4 pb-1.5">
      <span className="font-mono text-[10.5px] font-semibold tracking-[0.14em] text-ink-300 uppercase">
        {label}
      </span>
      {line && line.outCount > 0 ? (
        <span
          data-testid="day-out"
          className="font-mono text-[10px] tracking-[0.1em] whitespace-nowrap text-ink-500 uppercase"
        >
          {line.outCount} out <Veiled>{fmt(line.outSum, line.currency)}</Veiled>
        </span>
      ) : null}
      <span className="h-px flex-1 bg-lift/10" />
      {line?.balance != null ? (
        <span className="font-mono text-[10.5px] whitespace-nowrap text-ink-500">
          <i className="mr-1.5 text-[9px] tracking-[0.14em] not-italic">
            BALANCE
          </i>
          <Veiled>{fmt(line.balance, line.currency)}</Veiled>
        </span>
      ) : null}
    </span>
  )
}

/* Why a balance adds up although its rows alone do not: said, in grey,
   never asked (3 Oct: ActivoBank's 27 Sep screenshot already had the
   −€100 its statement books on the 28th; €505.20 pending on 3 Oct). */
export function Said({ check: c }: { check: SheetData['checks'][number] }) {
  /* Pending alone: a badge and its amount (17 Oct, no sentences). */
  if (c.bookedLater === null && c.pendingPart !== null)
    return (
      <div className="my-2 flex items-center gap-2.5 rounded-[12px] bg-lift/[0.035] px-3 py-2.5 ring-1 ring-lift/10 ring-inset">
        <span className="font-mono text-[11px] tracking-[0.14em] text-ink-400 uppercase">
          pending
        </span>
        <b className="ml-auto font-mono text-[13px] font-medium whitespace-nowrap text-ink-200">
          <Veiled>{fmt(c.pendingPart, c.currency, true)}</Veiled>
        </b>
      </div>
    )
  return (
    <div className="my-2 flex items-start gap-2.5 rounded-[12px] bg-lift/[0.035] px-3 py-2.5 text-[12.5px] text-ink-300 ring-1 ring-lift/10 ring-inset">
      <span className="mt-px font-mono text-[11px] text-ink-500">i</span>
      <span>
        {c.bookedLater !== null ? (
          <>
            <Veiled>{fmt(c.bookedLater.amount, c.currency, true)}</Veiled>{' '}
            already counted in this balance · booked by the bank on{' '}
            {short(c.bookedLater.at)}
          </>
        ) : null}
        {c.pendingPart !== null ? (
          <>
            <Veiled>{fmt(c.pendingPart, c.currency, true)}</Veiled> pending on
            this day · not in a statement yet
          </>
        ) : null}
      </span>
    </div>
  )
}

/** A balance the bank gave by itself (no statement behind it). */
export const fromBank = (data: SheetData, r: SheetData['readings'][number]) =>
  r.source === 'sync' &&
  (r.fileId === null ||
    data.files.find((f) => f.id === r.fileId)?.bank === true)

export const newestSync = (data: SheetData) =>
  data.readings
    .filter((r) => fromBank(data, r))
    .sort((a, b) => b.at - a.at)[0] as SheetData['readings'][number] | undefined

/* On top: the newest sync as one pill, and a red strip for each sync the
   rows do not reach. */
export function Synced({
  data,
  account,
  onFile,
}: {
  data: SheetData
  account: Doc<'accounts'>
  onFile: (id: Id<'intakes'>) => void
}) {
  const newest = newestSync(data)
  if (newest === undefined) return null
  /* Only a sync the old list would have shown asks (shownBalance): the
     connect's own reading and unchanged ones never did. */
  const latest = lastSync(data.readings)
  const synced = new Set(
    data.readings
      .filter((r) => fromBank(data, r) && shownBalance(data, r, latest))
      .map((r) => `${r.at}:${r.currency}`),
  )
  return (
    <>
      {data.checks
        .filter((c) => c.missing !== 0 && synced.has(`${c.to}:${c.currency}`))
        .map((c) => (
          <NoRowStrip
            key={`${c.to}:${c.currency}`}
            missing={c.missing}
            currency={c.currency}
            at={c.to}
          />
        ))}
      <SyncPill
        reading={newest}
        file={data.files.find((f) => f.id === newest.fileId)}
        name={account.name}
        domain={account.domain}
        onFile={onFile}
      />
    </>
  )
}
