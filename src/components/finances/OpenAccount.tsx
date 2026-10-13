import { Fragment, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { Busy } from '@/components/finances/bits'
import { Sheet } from '@/components/finances/Sheet'
import { Veiled } from '@/components/finances/Veil'
import { SkeletonRows } from '@/components/Skeleton'
import { FileView } from './AccountFileView'
import { TakenStrip } from './AccountFileBack'
import type { Taken } from './AccountFileBack'
import { BalanceTick, SheetCheck, dayOf } from './AccountSheetCheck'
import { Divider, RowLine, fmt, short } from './AccountSheetRows'
import { TypedBalance } from './AccountTypedBalance'

/* An account, opened (A.4 — journey agreed 1 Oct, mock agreed 2 Oct:
   "build it"). Everything in it, newest first: each row, moves and trades
   included; each balance with the file it came from; and on top, whether
   the rows explain the balances (AccountSheetCheck). Before this, his
   moves and the files read into an account were stored and shown nowhere
   (27 Sep: "I can't see those movements anywhere which is very bad").
   aggregate.accountSheet computes every number; this only lays it out. */

type SheetData = NonNullable<
  FunctionReturnType<typeof api.aggregate.accountSheet>
>
type Row = SheetData['rows'][number]
type Check = SheetData['checks'][number]
type FileInfo = SheetData['files'][number]

/* The year only on a day that is not this year's. */
const dayLabel = (t: number) => {
  const d = new Date(t)
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === new Date().getFullYear()
      ? {}
      : { year: 'numeric' }),
  })
}
/* Rows the sheet opens on, and how many more each press brings. */
const FIRST_ROWS = 60
const MORE_ROWS = 120
const dayKey = (t: number) => new Date(t).toDateString()

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
  /* A file just taken back: the account says so until the sheet closes. */
  const [taken, setTaken] = useState<Taken | null>(null)
  const close = () => {
    setFile(null)
    setTaken(null)
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
        <FileView
          intakeId={file}
          onTaken={(t) => {
            setTaken(t)
            setFile(null)
          }}
        />
      ) : (
        <Ledger
          account={account}
          taken={taken}
          onRemoved={setTaken}
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
  taken,
  onRemoved,
  onFile,
  onUpdate,
}: {
  account: Doc<'accounts'>
  taken: Taken | null
  onRemoved: (t: Taken) => void
  total: number
  meta: string
  onFile: (id: Id<'intakes'>) => void
  onUpdate: () => void
}) {
  /* The balances, files and check are over every row; the rows themselves
     come a page at a time (12 Oct: Revolut's hundreds made the sheet lag). */
  const head = useQuery(api.aggregate.accountSheet, {
    accountId: account._id,
    head: true,
  })
  const [show, setShow] = useState(FIRST_ROWS)
  const asked = useQuery(api.sheetRows.page, { accountId: account._id, show })
  /* The rows already on screen stay while older ones are fetched. */
  const [page, setPage] = useState(asked)
  if (asked !== undefined && asked !== page) setPage(asked)
  const data =
    head === undefined || page === undefined
      ? undefined
      : head === null || page === null
        ? null
        : { ...head, rows: page.rows }
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
          <BalanceTick
            data={data}
            fallback={
              account.kinds.includes('broker')
                ? 'cash and shares'
                : `free cash · ${account.currencies.join(' · ')}`
            }
          />
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
          {taken ? <TakenStrip taken={taken} /> : null}
          <SheetCheck data={data} account={account} onUpdate={onUpdate} />
          <span className="label-caps">
            {data.total} {data.total === 1 ? 'row' : 'rows'} ·{' '}
            {data.files.length} {data.files.length === 1 ? 'file' : 'files'} ·
            newest first
          </span>
          <Timeline
            data={data}
            older={page?.older === true}
            loading={asked === undefined}
            onOlder={() => setShow((n) => n + MORE_ROWS)}
            onFile={onFile}
            onRemoved={onRemoved}
          />
        </>
      )}
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

/* Rows by day, newest first; a balance — and the file it came from — sits
   between the rows it closes and the ones after it. */
function Timeline({
  data,
  older,
  loading,
  onOlder,
  onFile,
  onRemoved,
}: {
  data: SheetData
  /** Older rows are saved and not on screen yet. */
  older: boolean
  loading: boolean
  onOlder: () => void
  onFile: (id: Id<'intakes'>) => void
  onRemoved: (t: Taken) => void
}) {
  const remove = useMutation(api.logs.remove)
  const removeSide = useMutation(api.logs.removeSide)
  const fileOf = (id: Id<'intakes'> | null) =>
    id === null ? undefined : data.files.find((f) => f.id === id)
  /* A balance or a file older than the last row on screen waits for its
     rows: it would otherwise sit under rows it does not close. */
  const since = older ? (data.rows.at(-1)?.at ?? 0) : -Infinity
  type Item =
    | { t: 'row'; at: number; row: Row }
    | { t: 'bal'; at: number; bal: SheetData['readings'][number] }
    | { t: 'file'; at: number; file: FileInfo }
  /* A balance read again with nothing moved is not said twice (13 Oct:
     the bank answers every day, and Revolut's $0.00 stood there once a
     day): the first reading of an amount stays, with its file. */
  const same = (bal: SheetData['readings'][number]) =>
    bal.fileId === null &&
    data.checks.some(
      (c) =>
        c.to === bal.at &&
        c.currency === bal.currency &&
        c.rows === 0 &&
        c.missing === 0 &&
        c.fromValue === bal.value,
    )
  const items: Array<Item> = [
    ...data.rows.map((row) => ({ t: 'row' as const, at: row.at, row })),
    ...data.readings
      .filter((bal) => bal.at >= since && !same(bal))
      .map((bal) => ({ t: 'bal' as const, at: bal.at, bal })),
    /* A file that set no balance (a broker's orders) still has a place:
       where its rows end. One that read rows the account already had,
       and nothing else, saved nothing and is not listed. */
    ...data.files
      .filter((f) => !data.readings.some((r) => r.fileId === f.id))
      .filter((f) => f.added > 0 || f.positions > 0)
      .map((file) => ({
        t: 'file' as const,
        at: file.to ?? file.readAt,
        file,
      }))
      .filter((f) => f.at >= since),
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
                  typed={
                    it.bal.source === 'typed' ? (
                      <TypedBalance
                        snapshotId={it.bal.id}
                        onRemoved={onRemoved}
                      />
                    ) : undefined
                  }
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
                  <span>no row</span>
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
                  ? () => removeSide({ logId: r.sideLogId as Id<'logs'> })
                  : undefined
              }
            />
          </Fragment>
        )
      })}
      {older ? (
        <button
          type="button"
          data-testid="older-rows"
          disabled={loading}
          onClick={onOlder}
          className="motion-press mt-3 self-center rounded-[10px] px-3.5 py-2 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase ring-1 ring-lav-400/35 ring-inset hover:bg-lav-400/10 disabled:opacity-70"
        >
          <Busy on={loading} doing="loading">
            older rows · {data.total - data.rows.length} more
          </Busy>
        </button>
      ) : first ? (
        <span className="px-0.5 pt-3 font-mono text-[10.5px] leading-relaxed text-ink-500">
          No rows before {short(first.at)}. An older statement adds them.
        </span>
      ) : (
        <span className="py-6 text-center text-[13.5px] text-ink-400">
          No rows yet. Add a statement or a screenshot.
        </span>
      )}
    </div>
  )
}
