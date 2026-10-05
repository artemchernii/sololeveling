import { Fragment, useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { Sheet } from '@/components/finances/Sheet'
import { Veiled } from '@/components/finances/Veil'
import { SkeletonRows } from '@/components/Skeleton'
import { failureMessage } from '@/lib/convex-errors'
import { FileView } from './AccountFileView'
import { Divider, RowLine, fmt, short } from './AccountSheetRows'

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
        <span className="flex flex-col items-end gap-1">
          <span className="text-[30px] leading-none font-light tracking-tight text-foreground">
            <Veiled>{fmt(total)}</Veiled>
          </span>
          <span className="font-mono text-[11px] text-ink-400">
            {account.kinds.includes('broker')
              ? 'cash and shares'
              : `free cash · ${account.currencies.join(' · ')}`}
          </span>
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
    return (
      <GapLine
        gap={gap}
        data={data}
        accountId={accountId}
        onUpdate={onUpdate}
      />
    )
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
        <Sum check={last} data={data} />
      </span>
    </div>
  )
}

/* Why a balance adds up although its rows alone do not: said, in grey,
   never asked (3 Oct: ActivoBank's 27 Sep screenshot already had the
   −€100 its statement books on the 28th; €505.20 pending on 3 Oct). */
function Said({ check: c }: { check: Check }) {
  return (
    <div className="my-2 flex items-start gap-2.5 rounded-[12px] bg-lift/[0.035] px-3 py-2.5 text-[12.5px] text-ink-300 ring-1 ring-lift/10 ring-inset">
      <span className="mt-px font-mono text-[11px] text-ink-500">i</span>
      <span>
        {c.bookedLater !== null ? (
          <>
            <Veiled>{fmt(c.bookedLater.amount, c.currency, true)}</Veiled> was
            already in this balance — the bank booked it on{' '}
            {short(c.bookedLater.at)}.
          </>
        ) : null}
        {c.pendingPart !== null ? (
          <>
            <Veiled>{fmt(c.pendingPart, c.currency, true)}</Veiled> was still
            pending here — the next statement itemises it.
          </>
        ) : null}
      </span>
    </div>
  )
}

/* A balance is dated by the day it is for (aggregate.accountSheet). */
const dayOf = (data: SheetData, at: number) =>
  data.readings.find((r) => r.at === at)?.asOf ?? at

function Sum({ check: c, data }: { check: Check; data: SheetData }) {
  return (
    <span className="font-mono text-[12px] text-ink-300">
      <Veiled>
        {short(dayOf(data, c.from))}{' '}
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
            · read {short(dayOf(data, c.to))}{' '}
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
  data,
  accountId,
  onUpdate,
}: {
  gap: Check
  data: SheetData
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
          between {short(dayOf(data, gap.from))} and{' '}
          {short(dayOf(data, gap.to))} — a row cut off a file?
        </span>
        <Sum check={gap} data={data} />
        <span className="font-mono text-[12px] text-ink-300">
          but {short(dayOf(data, gap.to))} read{' '}
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
  const removeSide = useMutation(api.logs.removeSide)
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
          const said =
            it.t === 'bal'
              ? data.checks.find(
                  (c) =>
                    c.to === it.bal.at &&
                    c.currency === it.bal.currency &&
                    (c.bookedLater !== null || c.pendingPart !== null),
                )
              : undefined
          return (
            <Fragment
              key={`${it.t}-${it.at}-${it.t === 'bal' ? it.bal.currency : it.file.id}`}
            >
              {it.t === 'bal' ? (
                <Divider
                  label={`balance · ${short(it.bal.asOf)}`}
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
              {said ? <Said check={said} /> : null}
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
              inside={r.inside === null ? null : dayOf(data, r.inside)}
              index={i++}
              onDelete={
                r.logId
                  ? () => remove({ logId: r.logId as Id<'logs'> })
                  : undefined
              }
              onNotHere={
                r.sideLogId
                  ? () => removeSide({ logId: r.sideLogId })
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
