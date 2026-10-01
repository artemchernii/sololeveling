import { Fragment, useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ArrowDown, ArrowLeftRight, ArrowUp } from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { Sheet } from '@/components/finances/Sheet'
import { Veiled } from '@/components/finances/Veil'
import { SkeletonRows } from '@/components/Skeleton'
import { failureMessage } from '@/lib/convex-errors'

/* An account, opened (A.4 — journey agreed 1 Oct, mock agreed 2 Oct:
   "build it"). Everything in it, newest first: each row, moves and trades
   included; each balance with the file it came from; and on top, whether
   the rows explain the balances — "€100 left that no row shows between 31
   Aug and 27 Sep", with one tap to add it on its day. Before this, his
   moves and the files read into an account were stored and shown nowhere
   (27 Sep: "I can't see those movements anywhere which is very bad").
   aggregate.accountSheet computes every number; this only lays it out. */

type SheetData = NonNullable<
  FunctionReturnType<typeof api.aggregate.accountSheet>
>
type Row = SheetData['rows'][number]
type Check = SheetData['checks'][number]
type FileInfo = SheetData['files'][number]

const DAY_MS = 86_400_000

const fmt = (v: number, currency = 'EUR', sign = false) => {
  const s = new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(v))
  return `${v < 0 ? '−' : sign && v > 0 ? '+' : ''}${s}`
}
const short = (t: number) =>
  new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const dayLabel = (t: number) =>
  new Date(t).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
const dayKey = (t: number) => new Date(t).toDateString()
const noon = (t: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime()
}

export function OpenAccount({
  account,
  total,
  meta,
  onClose,
  onUpdate,
}: {
  account: Doc<'accounts'> | null
  /** What the card shows it holds, in euros. */
  total: number
  /** The card's freshness line: "screenshot read 5d ago". */
  meta: string
  onClose: () => void
  /** Drop a file into this account (its card's update). */
  onUpdate: () => void
}) {
  const [file, setFile] = useState<Id<'intakes'> | null>(null)
  const close = () => {
    setFile(null)
    onClose()
  }
  return (
    <Sheet
      open={account !== null}
      title={account?.name ?? ''}
      onClose={close}
      onBack={file ? () => setFile(null) : undefined}
    >
      {account === null ? null : file ? (
        <FileView intakeId={file} />
      ) : (
        <Ledger
          account={account}
          total={total}
          meta={meta}
          onFile={setFile}
          onUpdate={() => {
            close()
            onUpdate()
          }}
        />
      )}
    </Sheet>
  )
}

function Ledger({
  account,
  total,
  meta,
  onFile,
  onUpdate,
}: {
  account: Doc<'accounts'>
  total: number
  meta: string
  onFile: (id: Id<'intakes'>) => void
  onUpdate: () => void
}) {
  const data = useQuery(api.aggregate.accountSheet, { accountId: account._id })
  const tails = account.ibanTails?.[0] ? ` · ••${account.ibanTails[0]}` : ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3.5">
        <AccountLogo name={account.name} domain={account.domain} size={44} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[17px] text-foreground">
            {account.name}
          </span>
          <span className="font-mono text-[11px] text-ink-400">
            {meta}
            {tails}
          </span>
        </span>
        <span className="text-right text-[30px] leading-none font-light tracking-tight text-foreground">
          <Veiled>{fmt(total)}</Veiled>
        </span>
      </div>

      {data === undefined ? (
        <SkeletonRows rows={6} />
      ) : data === null ? (
        <p className="py-6 text-center text-[13.5px] text-ink-400">
          This account is gone.
        </p>
      ) : (
        <>
          <CheckLine data={data} accountId={account._id} onUpdate={onUpdate} />
          <span className="label-caps">
            {data.rows.length} {data.rows.length === 1 ? 'row' : 'rows'} ·{' '}
            {data.files.length} {data.files.length === 1 ? 'file' : 'files'} ·
            newest first
          </span>
          <Timeline data={data} onFile={onFile} />
        </>
      )}
    </div>
  )
}

/* On top: does it add up? The first pair that does not, said where and by
   how much, with the row to add; else the latest pair, explained. */
function CheckLine({
  data,
  accountId,
  onUpdate,
}: {
  data: SheetData
  accountId: Id<'accounts'>
  onUpdate: () => void
}) {
  const gap = data.checks.find((c) => c.missing !== 0)
  const last = data.checks.at(-1)
  if (gap)
    return <GapLine gap={gap} accountId={accountId} onUpdate={onUpdate} />
  if (!last)
    return (
      <div className="flex gap-2.5 rounded-[14px] bg-lift/[0.035] px-3.5 py-3 text-[13.5px] text-ink-300 ring-1 ring-lift/10 ring-inset">
        <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-lift/[0.08] font-mono text-[12px] text-ink-400">
          ·
        </span>
        <span>
          {data.readings.length === 0
            ? 'No balance yet, nothing to check the rows against.'
            : 'One balance so far, nothing to check it against. The next balance is checked against the rows in between.'}
        </span>
      </div>
    )
  return (
    <div className="motion-arrive flex gap-2.5 rounded-[14px] bg-state-good/[0.09] px-3.5 py-3 text-[13.5px] ring-1 ring-state-good/30 ring-inset">
      <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-state-good/20 font-mono text-[12px] text-state-good">
        ✓
      </span>
      <span className="flex flex-col gap-1">
        <span>
          It adds up. Every balance is explained by the rows before it.
        </span>
        <Sum check={last} />
      </span>
    </div>
  )
}

function Sum({ check: c }: { check: Check }) {
  return (
    <span className="font-mono text-[12px] text-ink-300">
      <Veiled>
        {short(c.from)}{' '}
        <b className="font-medium text-foreground">
          {fmt(c.fromValue, c.currency)}
        </b>{' '}
        {c.sum < 0 ? '−' : '+'} {c.rows} {c.rows === 1 ? 'row' : 'rows'}{' '}
        <b className="font-medium text-foreground">
          {fmt(Math.abs(c.sum), c.currency)}
        </b>{' '}
        ={' '}
        <b className="font-medium text-foreground">
          {fmt(c.expected, c.currency)}
        </b>
        {c.missing === 0 ? (
          <>
            {' '}
            · read {short(c.to)}{' '}
            <b className="font-medium text-foreground">
              {fmt(c.read, c.currency)}
            </b>
          </>
        ) : null}
      </Veiled>
    </span>
  )
}

/* "€100 left that no row shows": the row to add, on a day he picks with
   one tap — the day before the later balance unless he says otherwise.
   The app cannot know the day; it never asks him to type one. */
function GapLine({
  gap,
  accountId,
  onUpdate,
}: {
  gap: Check
  accountId: Id<'accounts'>
  onUpdate: () => void
}) {
  const record = useMutation(api.money.record)
  const days = useMemo(() => {
    const out: Array<number> = []
    for (let t = noon(gap.from + DAY_MS); t <= noon(gap.to); t += DAY_MS)
      out.push(noon(t))
    return out
  }, [gap.from, gap.to])
  const [day, setDay] = useState(() => days.at(-2) ?? days.at(-1) ?? gap.to)
  const [all, setAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shown = all ? days : days.slice(-10)

  const add = () => {
    setError(null)
    void record({
      lines: [
        {
          kind: gap.missing < 0 ? 'out' : 'in',
          accountId,
          amount: Math.abs(gap.missing),
          currency: gap.currency,
          category: 'other',
          note: 'Missing from the file',
          occurredAt: day,
        },
      ],
    }).catch((e: unknown) => setError(failureMessage(e)))
  }

  return (
    <div className="motion-arrive flex gap-2.5 rounded-[14px] bg-state-warn/[0.09] px-3.5 py-3 text-[13.5px] ring-1 ring-state-warn/40 ring-inset">
      <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-state-warn/20 font-mono text-[12px] text-state-warn">
        !
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span>
          <b className="font-medium">
            <Veiled>{fmt(Math.abs(gap.missing), gap.currency)}</Veiled>{' '}
            {gap.missing < 0 ? 'left' : 'came in'} that no row shows
          </b>{' '}
          between {short(gap.from)} and {short(gap.to)} — a row cut off a file?
        </span>
        <Sum check={gap} />
        <span className="font-mono text-[12px] text-ink-300">
          but {short(gap.to)} read{' '}
          <b className="font-medium text-foreground">
            <Veiled>{fmt(gap.read, gap.currency)}</Veiled>
          </b>
        </span>
        <span className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={add}
            className="motion-press rounded-full bg-state-warn/15 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-state-warn uppercase ring-1 ring-state-warn/50 ring-inset"
          >
            add {fmt(gap.missing, gap.currency, true)} on {short(day)}
          </button>
          <button type="button" onClick={onUpdate} className={PILL_QUIET}>
            drop a file
          </button>
        </span>
        <span className="label-caps mt-2">which day?</span>
        <span className="flex flex-wrap gap-1">
          {shown.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              className={`rounded-[8px] px-2 py-1 font-mono text-[11px] ring-1 ring-inset ${
                d === day
                  ? 'bg-state-warn/15 text-foreground ring-state-warn/55'
                  : 'text-ink-300 ring-lift/12 hover:text-foreground'
              }`}
            >
              {short(d)}
            </button>
          ))}
          {!all && days.length > shown.length ? (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="rounded-[8px] px-2 py-1 font-mono text-[11px] text-ink-400 ring-1 ring-lift/12 ring-inset hover:text-foreground"
            >
              earlier…
            </button>
          ) : null}
        </span>
        {error ? (
          <span className="text-[12.5px] text-state-danger">{error}</span>
        ) : null}
      </span>
    </div>
  )
}

/* Rows by day, newest first; a balance — and the file it came from — sits
   between the rows it closes and the ones after it. */
function Timeline({
  data,
  onFile,
}: {
  data: SheetData
  onFile: (id: Id<'intakes'>) => void
}) {
  const remove = useMutation(api.logs.remove)
  const fileOf = (id: Id<'intakes'> | null) =>
    id === null ? undefined : data.files.find((f) => f.id === id)
  type Item =
    | { t: 'row'; at: number; row: Row }
    | { t: 'bal'; at: number; bal: SheetData['readings'][number] }
    | { t: 'file'; at: number; file: FileInfo }
  const items: Array<Item> = [
    ...data.rows.map((row) => ({ t: 'row' as const, at: row.at, row })),
    ...data.readings.map((bal) => ({ t: 'bal' as const, at: bal.at, bal })),
    /* A file that set no balance (a broker's orders) still has a place:
       where its rows end. */
    ...data.files
      .filter((f) => !data.readings.some((r) => r.fileId === f.id))
      .map((file) => ({
        t: 'file' as const,
        at: file.to ?? file.readAt,
        file,
      })),
  ]
  /* Newest first; on a tie a balance sits above the rows it closes. */
  items.sort((a, b) => b.at - a.at || (a.t === 'row' ? 1 : -1))
  const gaps = data.checks.filter((c) => c.missing !== 0)

  let day = ''
  let i = 0
  const first = data.rows.at(-1)

  return (
    <div className="flex flex-col">
      {items.map((it) => {
        if (it.t !== 'row') {
          day = ''
          const gap =
            it.t === 'bal'
              ? gaps.find(
                  (g) => g.to === it.bal.at && g.currency === it.bal.currency,
                )
              : undefined
          return (
            <Fragment
              key={`${it.t}-${it.at}-${it.t === 'bal' ? it.bal.currency : it.file.id}`}
            >
              {it.t === 'bal' ? (
                <Divider
                  label={`balance · ${short(it.at)}`}
                  value={fmt(it.bal.value, it.bal.currency)}
                  file={fileOf(it.bal.fileId)}
                  typed={it.bal.source === 'typed'}
                  onFile={onFile}
                />
              ) : (
                <Divider
                  label={`read · ${short(it.file.readAt)}`}
                  file={it.file}
                  onFile={onFile}
                />
              )}
              {gap ? (
                <div className="my-2 flex items-center gap-2.5 rounded-[12px] border border-dashed border-state-warn/55 bg-state-warn/[0.06] px-3 py-2.5 text-[13px] text-ink-200">
                  Somewhere below this balance: a row the files do not show
                  <b className="ml-auto font-mono font-medium whitespace-nowrap text-state-warn">
                    <Veiled>{fmt(gap.missing, gap.currency, true)}</Veiled>
                  </b>
                </div>
              ) : null}
            </Fragment>
          )
        }
        const r = it.row
        const head = dayKey(r.at) !== day
        day = dayKey(r.at)
        return (
          <Fragment key={r.id}>
            {head ? (
              <span className="px-0.5 pt-3 pb-1 font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase">
                {dayLabel(r.at)}
              </span>
            ) : null}
            <RowLine
              row={r}
              index={i++}
              onDelete={
                r.logId
                  ? () => void remove({ logId: r.logId as Id<'logs'> })
                  : undefined
              }
            />
          </Fragment>
        )
      })}
      {first ? (
        <span className="px-0.5 pt-3 font-mono text-[10.5px] leading-relaxed text-ink-500">
          That is the start: nothing before {short(first.at)} has been read.
          Drop an older statement to go further back.
        </span>
      ) : (
        <span className="py-6 text-center text-[13.5px] text-ink-400">
          No rows yet. Drop a statement or a screenshot and its rows land here.
        </span>
      )}
    </div>
  )
}

function Divider({
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

function RowLine({
  row: r,
  index,
  onDelete,
}: {
  row: Row
  index: number
  onDelete?: () => void
}) {
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
          {r.inside !== null ? (
            <span className="rounded-[5px] px-1.5 text-[9.5px] tracking-[0.08em] text-state-warn uppercase ring-1 ring-state-warn/40 ring-inset">
              inside the {short(r.inside)} balance — it changed no balance
            </span>
          ) : null}
        </span>
      </span>
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
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

/* A confirmed file, opened again: what it read, as it read it, and which
   rows landed. */
function FileView({ intakeId }: { intakeId: Id<'intakes'> }) {
  const f = useQuery(api.intake.fileRows, { intakeId })
  if (f === undefined) return <SkeletonRows rows={6} />
  const landed = f.rows.filter((r) => r.landed).length
  return (
    <div className="flex flex-col gap-3">
      <span className="flex flex-col gap-1">
        <span className="text-[15px] text-foreground">{f.title}</span>
        <span className="font-mono text-[11px] text-ink-400">
          {f.names.join(' · ')} · read {short(f.readAt)} · {f.rows.length} rows
          read, {landed} landed
        </span>
      </span>
      <div className="flex flex-col">
        {f.rows.map((r, i) => (
          <div
            key={`${r.at}-${i}`}
            className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2"
          >
            <span className="w-14 shrink-0 font-mono text-[11px] text-ink-500">
              {short(r.at)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">
              {r.text}
            </span>
            <span className="font-mono text-[10px] tracking-[0.1em] text-ink-500 uppercase">
              {r.pending ? 'pending' : r.landed ? '' : 'left out'}
            </span>
            <span
              className={`font-mono text-[13px] whitespace-nowrap ${r.landed ? (r.amount > 0 ? 'text-state-good' : 'text-foreground') : 'text-ink-500 line-through'}`}
            >
              <Veiled>{fmt(r.amount, r.currency, true)}</Veiled>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
