import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  ArrowRight,
  Check,
  CircleHelp,
  Files,
  ImageIcon,
  Layers,
  Plus,
  RefreshCw,
  Repeat2,
  Sigma,
  Upload,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { IntakeFlow } from '@/components/finances/Intake'
import { AccountLogo } from '@/components/finances/Logo'
import { Sheet } from '@/components/finances/Sheet'
import { Veiled } from '@/components/finances/Veil'
import { useDayStarts } from '@/components/track/useDayStarts'
import { failureMessage } from '@/lib/convex-errors'
import { MAX_BATCH_FILES, readableFile } from '@/lib/intake'
import { productById } from '@/lib/institutions'
import { euros } from '@/lib/money'

/* UPDATE ALL (3 Oct). Artem: "When I simply drag and drop multiple
   csv/pdf files, you read and analyze which bank, what to update, I can
   review it and update state of finances." Beside ADD, not instead of it
   — one statement still goes in the way it always did. Journey and spec:
   docs/specs/2026-10-03-bulk-update*.md; the mockup it is built to:
   design/treasury-mockup/bulk.html. */

type Review = NonNullable<
  ReturnType<typeof useQuery<typeof api.intake.batchReview>>
>
type Ask = Review['asks'][number]
type BatchView = NonNullable<
  ReturnType<typeof useQuery<typeof api.intake.batch>>
>
type Worth = { total: number; cash: number; invested: number }

const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})
const DAY_YEAR = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const MONTH_LONG = new Intl.DateTimeFormat(undefined, { month: 'long' })
const MONTH_NARROW = new Intl.DateTimeFormat(undefined, { month: 'narrow' })
const MONTH_YEAR = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
})

function monthDate(key: string): Date {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1)
}
const signed = (n: number) => `${n < 0 ? '−' : '+'}${euros(Math.abs(n))}`

/** The hero's second button, beside ADD. */
export function UpdateAllButton() {
  const waiting = useQuery(api.intake.openBatch, {})
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${PILL_QUIET} relative`}
      >
        <Layers className="size-3.5" />
        update all
        {waiting ? (
          <span
            aria-label="an update is waiting"
            className="motion-pulse absolute -top-0.5 -right-0.5 size-2 rounded-full bg-lav-400 shadow-[0_0_8px_var(--color-lav-400)]"
          />
        ) : null}
      </button>
      <Sheet open={open} title="update all" wide onClose={() => setOpen(false)}>
        {open ? (
          <BulkUpdate
            waiting={waiting ?? null}
            onClose={() => setOpen(false)}
          />
        ) : null}
      </Sheet>
    </>
  )
}

function BulkUpdate({
  waiting,
  onClose,
}: {
  waiting: Id<'batches'> | null
  onClose: () => void
}) {
  const [mine, setMine] = useState<Id<'batches'> | null>(null)
  const batchId = mine ?? waiting
  const view = useQuery(api.intake.batch, batchId ? { batchId } : 'skip')
  const worth = useQuery(api.aggregate.worth, {})
  const [checking, setChecking] = useState<Id<'intakes'> | null>(null)
  /* What the money looked like when he pressed APPLY, and whether this
     sheet saw the apply through — the applied screen's before and after. */
  const [before, setBefore] = useState<Worth | null>(null)
  const [pressed, setPressed] = useState(false)

  if (checking) {
    return (
      <IntakeFlow
        intakeId={checking}
        onBack={() => setChecking(null)}
        onDone={() => setChecking(null)}
      />
    )
  }
  if (batchId === null) return <BulkDrop onStarted={setMine} />
  if (view === undefined) return <div className="min-h-[320px]" />

  const reading = view.files.some((f) => f.status === 'reading')
  if (view.status === 'applying') return <Applying view={view} />
  if (pressed && (view.status === 'done' || view.applied !== null)) {
    return (
      <Applied
        view={view}
        before={before}
        now={worth ? worthOf(worth) : null}
        onClose={onClose}
        onMore={() => setPressed(false)}
      />
    )
  }
  if (view.status === 'done') return <BulkDrop onStarted={setMine} />
  if (reading) return <BulkReading view={view} />
  return (
    <BulkReview
      batchId={batchId}
      onCheck={setChecking}
      onClose={onClose}
      onApplied={() => {
        setBefore(worth ? worthOf(worth) : null)
        setPressed(true)
        /* Once applied it is no longer the one waiting — hold on to it
           here, so its applied screen still has it. */
        setMine(batchId)
      }}
    />
  )
}

function worthOf(w: {
  total: number
  cash: { total: number }
  invested: { total: number }
}): Worth {
  return { total: w.total, cash: w.cash.total, invested: w.invested.total }
}

/* ---- Drop ------------------------------------------------------------ */

function useBatchUpload() {
  const uploadUrl = useMutation(api.attachments.generateUploadUrl)
  const start = useMutation(api.intake.startBatch)
  const [sent, setSent] = useState<{ done: number; of: number } | null>(null)
  async function send(
    files: Array<File>,
    batchId?: Id<'batches'>,
  ): Promise<Id<'batches'>> {
    if (files.length > MAX_BATCH_FILES)
      throw new Error(`At most ${MAX_BATCH_FILES} files in one update.`)
    const bad = files.find((f) => readableFile(f.type, f.name) === null)
    if (bad) throw new Error(`${bad.name} is not a PDF, a CSV or a screenshot.`)
    const stored = []
    setSent({ done: 0, of: files.length })
    try {
      for (const file of files) {
        const url = await uploadUrl({})
        const type =
          file.type ||
          (file.name.toLowerCase().endsWith('.csv')
            ? 'text/csv'
            : 'application/octet-stream')
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': type },
          body: file,
        })
        if (!res.ok) throw new Error('It did not upload — try again.')
        const { storageId } = (await res.json()) as {
          storageId: Id<'_storage'>
        }
        stored.push({
          storageId,
          contentType: type,
          name: file.name,
          size: file.size,
        })
        setSent({ done: stored.length, of: files.length })
      }
      const r = await start({ files: stored, batchId })
      if (!r.ok) throw new Error(r.error)
      return r.batchId
    } finally {
      setSent(null)
    }
  }
  return { send, sent }
}

function BulkDrop({ onStarted }: { onStarted: (id: Id<'batches'>) => void }) {
  const { send, sent } = useBatchUpload()
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const accounts = useQuery(api.accounts.list, {})
  /* Notes have no statement to drop. */
  const readable = (accounts ?? []).filter(
    (a) => a.kinds.includes('bank') || a.kinds.includes('broker'),
  )

  async function take(files: Array<File>) {
    if (files.length === 0) return
    setError(null)
    try {
      onStarted(await send(files))
    } catch (e) {
      setError(
        failureMessage(e) ??
          (e instanceof Error ? e.message : 'It did not upload.'),
      )
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') input.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void take([...e.dataTransfer.files])
        }}
        className={`relative flex cursor-pointer flex-col items-center gap-4 overflow-hidden rounded-[18px] px-5 py-8 text-center transition-colors ${
          over ? 'bg-lav-400/15' : 'bg-lav-400/[0.04]'
        }`}
      >
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 rounded-[18px] border-[1.5px] ${
            over
              ? 'border-solid border-lav-400 shadow-[inset_0_0_40px_-10px_var(--color-lav-400)]'
              : 'motion-pulse border-dashed border-lav-400/40'
          }`}
        />
        <span
          className={`grid size-11 place-items-center rounded-[12px] bg-lav-400/10 text-lav-300 ring-1 ring-lav-400/35 transition-transform ring-inset ${
            over ? '-translate-y-1 scale-110' : ''
          }`}
        >
          <Files className="size-5" />
        </span>
        <span className="flex flex-col gap-1">
          <span className="text-[16px] text-foreground">
            {sent
              ? `uploading ${sent.done} of ${sent.of}…`
              : 'Drop every statement at once'}
          </span>
          <span className="font-mono text-[10.5px] text-ink-500">
            any bank, any month · PDF, CSV, screenshots · up to{' '}
            {MAX_BATCH_FILES}
          </span>
        </span>
        <span className="flex flex-wrap justify-center gap-1.5 font-mono text-[10.5px] tracking-[0.12em] text-ink-400 uppercase">
          {['drop', 'sorted per account', 'you check', 'one apply'].map(
            (s, i) => (
              <span
                key={s}
                style={{ animationDelay: `${60 + i * 90}ms` }}
                className="motion-land rounded-full bg-lift/[0.04] px-2.5 py-1"
              >
                {s}
              </span>
            ),
          )}
        </span>
        {readable.length > 0 ? (
          <span className="flex flex-wrap justify-center gap-2">
            {readable.map((a, i) => (
              <span
                key={a._id}
                style={{ animationDelay: `${360 + i * 70}ms` }}
                className="motion-land inline-flex items-center gap-2 rounded-full bg-lift/[0.04] py-1 pr-3 pl-1 text-[12.5px] text-ink-200 ring-1 ring-lift/8 ring-inset"
              >
                <AccountLogo name={a.name} domain={a.domain} size={22} />
                {a.name}
              </span>
            ))}
          </span>
        ) : null}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept="application/pdf,text/csv,.csv,image/png,image/jpeg,image/webp"
          onChange={(e) => {
            void take([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </div>
      {error ? (
        <p className="text-center text-[12.5px] text-state-danger">{error}</p>
      ) : (
        <p className="text-center text-[12.5px] text-ink-400">
          A new bank in the drop becomes its account. Nothing is saved until you
          press apply.
        </p>
      )}
    </div>
  )
}

/* ---- Reading --------------------------------------------------------- */

function BulkReading({ view }: { view: BatchView }) {
  const accounts = useQuery(api.accounts.list, {})
  const files = view.files
  const read = files.filter((f) => f.status !== 'reading').length
  const now = files.find((f) => f.status === 'reading')
  type Bin = {
    key: string
    name: string
    domain: string | null
    isNew: boolean
    files: typeof files
  }
  const bins: Array<Bin> = []
  const unplaced: typeof files = []
  for (const f of files) {
    const doc = accounts?.find((a) => a._id === f.accountId)
    const product = f.suggest ? productById(f.suggest.product) : undefined
    const key = doc ? doc._id : product ? `new:${product.id}` : null
    if (key === null) {
      if (f.status !== 'reading') unplaced.push(f)
      continue
    }
    const bin = bins.find((b) => b.key === key)
    if (bin) bin.files.push(f)
    else
      bins.push({
        key,
        name: doc?.name ?? product?.name ?? '',
        domain: doc?.domain ?? product?.domain ?? null,
        isNew: !doc,
        files: [f],
      })
  }
  const waiting = files.filter(
    (f) => f.status === 'reading' && f.accountId === null && !f.suggest,
  ).length
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[34px] leading-none font-light tracking-tight">
            {read}
          </span>
          <span className="text-[13px] text-ink-400">
            of {files.length} files read
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-lift/[0.07]">
          <i
            className="block h-full rounded-full bg-gradient-to-r from-lav-400 to-lav-300 shadow-[0_0_12px_var(--color-lav-400)] transition-[width] duration-500"
            style={{ width: `${(read / Math.max(1, files.length)) * 100}%` }}
          />
        </div>
        <div className="flex min-h-4 items-center gap-2 font-mono text-[11px] text-ink-400">
          {now ? (
            <>
              <span className="motion-pulse size-1.5 rounded-full bg-lav-400" />
              <span className="truncate">{now.name}</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {bins.map((b) => {
          const done = b.files.filter((f) => f.status !== 'reading').length
          const live = b.files.some((f) => f.status === 'reading')
          return (
            <div
              key={b.key}
              className={`motion-land flex flex-col gap-2.5 rounded-[16px] bg-lift/[0.035] p-3 ring-1 ring-inset ${
                live ? 'ring-lav-400/40' : 'ring-lift/[0.07]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <AccountLogo name={b.name} domain={b.domain} size={28} />
                <b className="flex-1 font-medium">{b.name}</b>
                {b.isNew ? <Tag tone="new">new</Tag> : null}
                <span className="font-mono text-[12px] text-ink-300">
                  {done}/{b.files.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {b.files.map((f) => (
                  <span
                    key={f.intakeId}
                    title={f.name}
                    className={`relative h-[18px] w-3.5 overflow-hidden rounded-[4px] ${
                      f.status === 'reading'
                        ? 'bg-lift/[0.06]'
                        : f.status === 'failed'
                          ? 'bg-state-danger/50'
                          : 'motion-pop bg-lav-400/55'
                    }`}
                  />
                ))}
              </div>
              <span className="font-mono text-[10.5px] text-ink-500">
                {spanOf(b.files)}
              </span>
            </div>
          )
        })}
        {unplaced.length > 0 ? (
          <div className="motion-land flex flex-col gap-2 rounded-[16px] bg-lift/[0.035] p-3 ring-1 ring-state-warn/35 ring-inset">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-[9px] bg-state-warn/15 text-state-warn">
                <CircleHelp className="size-4" />
              </span>
              <b className="flex-1 font-medium">Not placed yet</b>
              <span className="font-mono text-[12px] text-ink-300">
                {unplaced.length}
              </span>
            </div>
            <span className="font-mono text-[10.5px] text-ink-500">
              {unplaced.map((f) => f.name).join(' · ')} — you'll be asked.
            </span>
          </div>
        ) : null}
      </div>
      <p className="border-t border-lav-400/10 pt-3 text-[12.5px] text-ink-400">
        {waiting > 0 ? `${waiting} still opening. ` : ''}You can close this —
        reading goes on, and the review waits under UPDATE ALL.
      </p>
    </div>
  )
}

function spanOf(files: BatchView['files']): string {
  const from = files.flatMap((f) => (f.from === null ? [] : [f.from]))
  const to = files.flatMap((f) => (f.to === null ? [] : [f.to]))
  if (from.length === 0) return 'reading…'
  const a = MONTH_YEAR.format(Math.min(...from))
  const b = MONTH_YEAR.format(Math.max(...to))
  return a === b ? a : `${a} – ${b}`
}

/* ---- Review ---------------------------------------------------------- */

function BulkReview({
  batchId,
  onCheck,
  onClose,
  onApplied,
}: {
  batchId: Id<'batches'>
  onCheck: (id: Id<'intakes'>) => void
  onClose: () => void
  onApplied: () => void
}) {
  const review = useQuery(api.intake.batchReview, { batchId })
  const accounts = useQuery(api.accounts.list, {})
  const apply = useMutation(api.intake.applyBatch)
  const dayStart = useDayStarts(1).at(-1) as number
  const [solved, setSolved] = useState<Array<{ key: string; text: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (review === undefined || accounts === undefined)
    return <div className="min-h-[320px]" />

  const doc = (id: Id<'accounts'>) => accounts.find((a) => a._id === id)
  const live = review.accounts.filter((a) => !a.leftOut)
  const fresh = live.reduce((t, a) => t + a.fresh + a.trades, 0)
  const months = review.months
  const asks = review.asks.filter(
    (a) => !solved.some((s) => s.key === askKey(a)),
  )
  const range =
    months.length > 0
      ? `${MONTH_YEAR.format(monthDate(months[0]))} – ${MONTH_YEAR.format(monthDate(months[months.length - 1]))}`
      : ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <Stat n={review.files} label="files" />
        <Stat n={review.accounts.length} label="accounts" />
        <Stat n={fresh} label="new rows" />
        <Stat n={review.moves.length} label="moves paired" />
        {asks.length > 0 || solved.length > 0 ? (
          <Stat
            n={asks.length}
            label="only you know"
            className={asks.length ? 'text-state-warn' : 'text-state-good'}
          />
        ) : null}
      </div>

      {asks.length > 0 || solved.length > 0 ? (
        <div className="flex flex-col gap-2">
          {asks.map((a, i) => (
            <AskCard
              key={askKey(a)}
              ask={a}
              index={i}
              batchId={batchId}
              accounts={accounts}
              onCheck={onCheck}
              onSolved={(text) =>
                setSolved((s) => [...s, { key: askKey(a), text }])
              }
            />
          ))}
          {solved.map((s) => (
            <div
              key={s.key}
              className="motion-land flex items-center gap-2.5 rounded-[16px] bg-state-good/[0.06] px-3.5 py-3 text-[13px] text-ink-200 ring-1 ring-state-good/30 ring-inset"
            >
              <Check className="size-4 text-state-good" />
              {s.text}
            </div>
          ))}
        </div>
      ) : null}

      {months.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.06em] text-ink-500">
          <Legend className="bg-lav-400/25">already had</Legend>
          <Legend className="bg-lav-400">this drop</Legend>
          <Legend className="hatch-warn">missing</Legend>
          <span className="ml-auto">{range}</span>
        </div>
      ) : null}

      {review.accounts.map((a, i) => {
        const d = doc(a.accountId)
        return d ? (
          <AccountBlock
            key={a.accountId}
            block={a}
            account={d}
            months={months}
            index={i}
            batchId={batchId}
            holes={review.asks.some(
              (x) => x.kind === 'hole' && x.accountId === a.accountId,
            )}
          />
        ) : null
      })}

      {review.moves.length > 0 ? (
        <div
          style={{ animationDelay: `${120 + review.accounts.length * 80}ms` }}
          className="motion-land flex flex-col gap-2.5 rounded-[18px] bg-lav-400/[0.05] p-3.5 ring-1 ring-lav-400/20 ring-inset"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-400">
            <span className="label-caps text-lav-400">
              between your accounts
            </span>
            <span>
              <b className="font-normal text-foreground">
                {review.moves.length}
              </b>{' '}
              paired · both sides found in this drop
            </span>
          </div>
          {review.moves.map((m) => {
            const from = doc(m.fromAccountId)
            const to = doc(m.toAccountId)
            return (
              <div
                key={`${m.fromAccountId}${m.toAccountId}${m.occurredAt}${m.amount}`}
                className="grid grid-cols-[48px_auto_16px_auto_1fr_auto] items-center gap-2 text-[12.5px] text-ink-200"
              >
                <span className="font-mono text-[10.5px] text-ink-500">
                  {DAY.format(m.occurredAt)}
                </span>
                <Who account={from} />
                <ArrowRight className="size-3.5 text-lav-400" />
                <Who account={to} />
                <span className="text-right font-mono">
                  <Veiled>{euros(m.amount)}</Veiled>
                </span>
                <span className="hidden sm:inline">
                  {m.days > 0 ? (
                    <Tag>
                      {m.days === 1 ? '1 day apart' : `${m.days} days apart`}
                    </Tag>
                  ) : (
                    <Tag tone="good">
                      <Check className="size-3" />
                      pair
                    </Tag>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-lav-400/12 pt-3.5">
        <span className="min-w-[200px] flex-1 text-[12.5px] text-ink-400">
          {error ? (
            <span className="text-state-danger">{error}</span>
          ) : asks.length > 0 ? (
            `${asks.length === 1 ? 'One question' : `${asks.length} questions`} left — apply saves the rest; ${asks.length === 1 ? 'it waits' : 'they wait'} here.`
          ) : (
            'Oldest statement first, so every balance lands on its day. Nothing is saved until you press it.'
          )}
        </span>
        <button type="button" onClick={onClose} className={PILL_QUIET}>
          later
        </button>
        <button
          type="button"
          disabled={busy || live.length === 0}
          onClick={() => {
            setBusy(true)
            setError(null)
            apply({ batchId, dayStart })
              .then(onApplied)
              .catch((e: unknown) =>
                setError(failureMessage(e) ?? 'It did not apply — try again.'),
              )
              .finally(() => setBusy(false))
          }}
          className="motion-press inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-lav-300 to-lav-400 px-5 py-2.5 font-mono text-[12px] tracking-[0.14em] text-background uppercase shadow-[0_0_26px_-6px_var(--color-lav-400)] disabled:opacity-50"
        >
          <Check className="size-4" />
          apply {live.length} account{live.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  )
}

function askKey(a: Ask): string {
  switch (a.kind) {
    case 'whose':
    case 'holdings':
    case 'failed':
      return `${a.kind}:${a.intakeId}`
    case 'new':
      return `new:${a.product}`
    case 'hole':
      return `hole:${a.accountId}:${a.month}`
    case 'oneSide':
      return `oneSide:${a.intakeId}:${a.index}`
    case 'gap':
      return a.key
  }
}

function AskCard({
  ask,
  index,
  batchId,
  accounts,
  onCheck,
  onSolved,
}: {
  ask: Ask
  index: number
  batchId: Id<'batches'>
  accounts: ReadonlyArray<Doc<'accounts'>>
  onCheck: (id: Id<'intakes'>) => void
  onSolved: (text: string) => void
}) {
  const answer = useMutation(api.intake.batchAnswer)
  const create = useMutation(api.accounts.create)
  const retry = useMutation(api.intake.retry)
  const discard = useMutation(api.intake.discard)
  const { send, sent } = useBatchUpload()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mine, setMine] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const name = (id: Id<'accounts'>) =>
    accounts.find((a) => a._id === id)?.name ?? 'that account'

  function act(run: () => Promise<unknown>, text: string) {
    setBusy(true)
    setError(null)
    run()
      .then(() => onSolved(text))
      .catch((e: unknown) =>
        setError(failureMessage(e) ?? 'That did not save.'),
      )
      .finally(() => setBusy(false))
  }
  const place = (intakeIds: Array<Id<'intakes'>>, a: Doc<'accounts'>) =>
    act(
      () =>
        answer({
          batchId,
          answer: { kind: 'place', intakeIds, accountId: a._id },
        }),
      `Placed in ${a.name}.`,
    )
  const chips = (
    list: ReadonlyArray<Doc<'accounts'>>,
    pick: (a: Doc<'accounts'>) => void,
  ) =>
    list.map((a) => (
      <Opt key={a._id} disabled={busy} onClick={() => pick(a)}>
        <AccountLogo name={a.name} domain={a.domain} size={18} />
        {a.name}
      </Opt>
    ))

  let icon: ReactNode = <CircleHelp className="size-4" />
  let q: ReactNode = null
  let sub: ReactNode = null
  let opts: ReactNode = null
  switch (ask.kind) {
    case 'whose': {
      icon = <ImageIcon className="size-4" />
      q = (
        <>
          <b className="font-medium">{ask.name}</b> — {ask.rows} rows
          {ask.from !== null && ask.to !== null
            ? `, ${DAY.format(ask.from)}–${DAY.format(ask.to)}`
            : ''}
          , no bank name on it. Whose is it?
        </>
      )
      opts = chips(accounts, (a) => place([ask.intakeId], a))
      break
    }
    case 'new': {
      icon = <Plus className="size-4" />
      const product = productById(ask.product)
      q = (
        <>
          New account: <b className="font-medium">{ask.name}</b>
          {product ? ` · ${product.kinds.join(' · ')}` : ''}
        </>
      )
      sub = `Found from ${ask.accountTail ? `the ending …${ask.accountTail} it prints` : 'the bank named on it'}. ${ask.intakeIds.length} ${ask.intakeIds.length === 1 ? 'file' : 'files'} · ${ask.rows} rows.`
      opts = mine ? (
        chips(accounts, (a) => place(ask.intakeIds, a))
      ) : (
        <>
          <Opt
            loud
            disabled={busy || !product}
            onClick={() => {
              if (!product) return
              act(async () => {
                const accountId = await create({
                  name: product.name,
                  kinds: product.kinds,
                  currencies: product.currencies,
                  domain: product.domain,
                  product: product.id,
                  ibanTails: ask.accountTail ? [ask.accountTail] : undefined,
                })
                await answer({
                  batchId,
                  answer: {
                    kind: 'place',
                    intakeIds: ask.intakeIds,
                    accountId,
                  },
                })
              }, `${ask.name} added, with its files.`)
            }}
          >
            {product ? (
              <AccountLogo
                name={product.name}
                domain={product.domain}
                size={18}
              />
            ) : null}
            keep it
          </Opt>
          {accounts.length > 0 ? (
            <Opt disabled={busy} onClick={() => setMine(true)}>
              it's one I have…
            </Opt>
          ) : null}
        </>
      )
      break
    }
    case 'hole': {
      const month = MONTH_LONG.format(monthDate(ask.month))
      q = (
        <>
          <b className="font-medium">{name(ask.accountId)}</b>: nothing in{' '}
          {month} — a statement is missing.
        </>
      )
      sub = 'The months either side have rows; this one has none.'
      opts = (
        <>
          <Opt disabled={busy} onClick={() => file.current?.click()}>
            <Upload className="size-3.5" />
            {sent ? `uploading ${sent.done}/${sent.of}…` : `drop ${month}`}
          </Opt>
          <Opt
            disabled={busy}
            onClick={() =>
              act(
                () =>
                  answer({
                    batchId,
                    answer: {
                      kind: 'quiet',
                      accountId: ask.accountId,
                      month: ask.month,
                    },
                  }),
                `${month}: nothing that month.`,
              )
            }
          >
            there was nothing that month
          </Opt>
          <input
            ref={file}
            type="file"
            multiple
            hidden
            accept="application/pdf,text/csv,.csv,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ''
              if (files.length)
                act(() => send(files, batchId), `${month} is being read.`)
            }}
          />
        </>
      )
      break
    }
    case 'oneSide': {
      icon = <Repeat2 className="size-4" />
      const into = ask.amount > 0
      q = (
        <>
          <b className="font-medium">
            <Veiled>{signed(ask.amount)}</Veiled>
          </b>{' '}
          {into ? 'into' : 'out of'} {name(ask.accountId)},{' '}
          {DAY.format(ask.occurredAt)} — "{ask.merchant}". Your own money, but
          no account in this drop {into ? 'sent' : 'received'} it.
        </>
      )
      sub = `Not ${into ? 'income' : 'spending'}. Which account did it ${into ? 'leave' : 'reach'}?`
      const pick = (otherAccountId: Id<'accounts'> | null, text: string) =>
        act(
          () =>
            answer({
              batchId,
              answer: {
                kind: 'move',
                intakeId: ask.intakeId,
                index: ask.index,
                otherAccountId,
              },
            }),
          text,
        )
      opts = (
        <>
          {chips(
            accounts.filter((a) => a._id !== ask.accountId),
            (a) => pick(a._id, `${signed(ask.amount)}: ${a.name}.`),
          )}
          <Opt
            disabled={busy}
            onClick={() =>
              pick(null, `${signed(ask.amount)}: an account outside the app.`)
            }
          >
            an account outside the app
          </Opt>
        </>
      )
      break
    }
    case 'gap': {
      icon = <Sigma className="size-4" />
      const short = ask.gap < 0
      q = (
        <>
          <b className="font-medium">{name(ask.accountId)}</b>:{' '}
          <Veiled>{euros(Math.abs(ask.gap))}</Veiled>{' '}
          {short ? 'missing' : 'more'} between {DAY.format(ask.from)} and{' '}
          {DAY.format(ask.to)}.
        </>
      )
      sub = short
        ? 'The balances say more left than the rows show — a row cut off a statement?'
        : 'The balances say more arrived than the rows show.'
      opts = (
        <>
          <Opt
            disabled={busy}
            onClick={() =>
              act(
                () =>
                  answer({
                    batchId,
                    answer: {
                      kind: 'extra',
                      key: ask.key,
                      accountId: ask.accountId,
                      occurredAt: ask.to,
                      amount: ask.gap,
                    },
                  }),
                `${signed(ask.gap)} added on ${DAY.format(ask.to)}.`,
              )
            }
          >
            add {euros(Math.abs(ask.gap))} on {DAY.format(ask.to)}
          </Opt>
          <Opt
            disabled={busy}
            onClick={() =>
              act(
                () =>
                  answer({
                    batchId,
                    answer: { kind: 'dismiss', key: ask.key },
                  }),
                'Left as it is.',
              )
            }
          >
            leave it
          </Opt>
        </>
      )
      break
    }
    case 'holdings': {
      icon = <ImageIcon className="size-4" />
      q = (
        <>
          <b className="font-medium">{ask.name}</b> is a broker screen — check
          its positions on their own.
        </>
      )
      opts = (
        <Opt loud onClick={() => onCheck(ask.intakeId)}>
          check it
        </Opt>
      )
      break
    }
    case 'failed': {
      q = (
        <>
          <b className="font-medium">{ask.name}</b> didn't go in.
        </>
      )
      sub = ask.error
      opts = (
        <>
          {ask.retryable ? (
            <Opt
              disabled={busy}
              onClick={() =>
                act(
                  () => retry({ intakeId: ask.intakeId }),
                  'Reading it again.',
                )
              }
            >
              <RefreshCw className="size-3.5" />
              try again
            </Opt>
          ) : null}
          <Opt
            disabled={busy}
            onClick={() =>
              act(() => discard({ intakeId: ask.intakeId }), 'Thrown away.')
            }
          >
            throw it away
          </Opt>
        </>
      )
      break
    }
  }

  return (
    <div
      style={{ animationDelay: `${index * 70}ms` }}
      className="motion-land flex flex-col gap-2.5 rounded-[16px] bg-state-warn/[0.06] px-3.5 py-3 ring-1 ring-state-warn/30 ring-inset"
    >
      <div className="flex items-start gap-2.5 text-[13.5px] leading-snug text-ink-100">
        <span className="mt-0.5 text-state-warn">{icon}</span>
        <div className="flex flex-col gap-1">
          <span>{q}</span>
          {sub ? <span className="text-[12px] text-ink-400">{sub}</span> : null}
          {error ? (
            <span className="text-[12px] text-state-danger">{error}</span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-6">{opts}</div>
    </div>
  )
}

function AccountBlock({
  block,
  account,
  months,
  index,
  batchId,
  holes,
}: {
  block: Review['accounts'][number]
  account: Doc<'accounts'>
  months: ReadonlyArray<string>
  index: number
  batchId: Id<'batches'>
  holes: boolean
}) {
  const answer = useMutation(api.intake.batchAnswer)
  const [rows, setRows] = useState(false)
  const { first, last } = block
  const twoReadings =
    first !== null && last !== null && first.asOf !== last.asOf
  return (
    <div
      style={{ animationDelay: `${120 + index * 80}ms` }}
      className={`motion-land flex flex-col gap-3 rounded-[18px] bg-lift/[0.035] p-3.5 ring-1 ring-lift/[0.07] transition-opacity ring-inset ${
        block.leftOut ? 'opacity-40' : ''
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <AccountLogo name={account.name} domain={account.domain} size={30} />
        <div className="flex min-w-[140px] flex-1 flex-col gap-0.5">
          <b className="text-[15px] font-medium">{account.name}</b>
          <span className="font-mono text-[10.5px] text-ink-500">
            {account.kinds.join(' · ')} · {block.files.length}{' '}
            {block.files.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        {last !== null ? (
          <div className="flex flex-wrap items-center justify-end gap-2 font-mono text-[13px] text-ink-300">
            {twoReadings ? (
              <>
                <small className="text-[10px] text-ink-500">
                  {DAY_YEAR.format(first.asOf)}
                </small>
                <Veiled>{euros(first.value)}</Veiled>
                <span className="text-ink-600">→</span>
              </>
            ) : null}
            <span className="text-[15px] text-foreground">
              <Veiled>{euros(last.value)}</Veiled>
            </span>
            <small className="text-[10px] text-ink-500">
              {DAY.format(last.asOf)}
            </small>
          </div>
        ) : null}
      </div>
      {months.length > 0 ? (
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}
        >
          {months.map((m, j) => {
            const state = block.months[j]
            return (
              <div
                key={m}
                className="flex flex-col gap-1"
                title={MONTH_YEAR.format(monthDate(m))}
              >
                <i
                  style={{ animationDelay: `${200 + j * 35}ms` }}
                  className={`block h-2.5 rounded-[4px] ${
                    state === 'add'
                      ? 'motion-land bg-lav-400 shadow-[0_0_10px_-2px_var(--color-lav-400)]'
                      : state === 'had'
                        ? 'bg-lav-400/25'
                        : state === 'hole'
                          ? 'hatch-warn ring-1 ring-state-warn/50 ring-inset'
                          : 'bg-lift/[0.05]'
                  }`}
                />
                <span className="text-center font-mono text-[9px] text-ink-600">
                  {MONTH_NARROW.format(monthDate(m))}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-400">
        <span>
          <b className="font-normal text-foreground">{block.fresh}</b> new rows
        </span>
        {block.trades > 0 ? (
          <span>
            <b className="font-normal text-foreground">{block.trades}</b> trades
          </span>
        ) : null}
        {block.had > 0 ? (
          <span>
            <b className="font-normal text-foreground">{block.had}</b> already
            had
          </span>
        ) : null}
        {block.gaps > 0 ? (
          <Tag tone="warn">doesn't add up</Tag>
        ) : twoReadings ? (
          <Tag tone="good">
            <Check className="size-3" />
            adds up
          </Tag>
        ) : null}
        {holes ? <Tag tone="warn">a month missing</Tag> : null}
        <span className="flex-1" />
        {block.rows.length > 0 ? (
          <button
            type="button"
            onClick={() => setRows((r) => !r)}
            className="font-mono text-[10.5px] tracking-[0.12em] text-lav-400 uppercase hover:[text-shadow:0_0_10px_var(--color-lav-400)]"
          >
            {rows ? 'hide rows' : 'rows'}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            void answer({
              batchId,
              answer: {
                kind: 'leaveOut',
                accountId: block.accountId,
                out: !block.leftOut,
              },
            })
          }
          className={`rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase ring-1 ring-inset ${
            block.leftOut
              ? 'text-lav-300 ring-lav-400/40'
              : 'text-ink-500 ring-lift/10 hover:text-ink-300'
          }`}
        >
          {block.leftOut ? 'left out · undo' : 'leave out'}
        </button>
      </div>
      {rows ? (
        <div className="flex flex-col border-t border-lift/[0.06] pt-2">
          {block.rows.map((r, j) => (
            <div
              key={`${r.occurredAt}${r.merchant}${j}`}
              className={`grid grid-cols-[52px_1fr_auto] items-center gap-2.5 py-1.5 text-[12.5px] text-ink-200 sm:grid-cols-[52px_1fr_auto_auto] ${
                r.had ? 'opacity-45' : ''
              }`}
            >
              <span className="font-mono text-[10.5px] text-ink-500">
                {DAY.format(r.occurredAt)}
              </span>
              <span className="truncate">{r.merchant}</span>
              <span className="hidden sm:inline">
                <Tag>{r.had ? 'already had' : (r.category ?? r.kind)}</Tag>
              </span>
              <span
                className={`font-mono ${r.kind === 'income' ? 'text-state-good' : ''}`}
              >
                <Veiled>{signed(r.amount)}</Veiled>
              </span>
            </div>
          ))}
          {block.fresh + block.had > block.rows.length ? (
            <span className="label-caps pt-1 pl-[62px]">
              … and {block.fresh + block.had - block.rows.length} more
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/* ---- Applying, applied ----------------------------------------------- */

function Applying({ view }: { view: BatchView }) {
  const done = view.applied?.intakes ?? 0
  const total = view.files.filter((f) => f.status !== 'failed').length
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center">
      <span className="motion-pulse grid size-12 place-items-center rounded-full bg-lav-400/12 text-lav-300">
        <Layers className="size-5" />
      </span>
      <span className="text-[15px]">
        Writing {done} of {total} files…
      </span>
      <div className="h-1 w-60 overflow-hidden rounded-full bg-lift/[0.07]">
        <i
          className="block h-full rounded-full bg-lav-400 transition-[width] duration-300"
          style={{ width: `${(done / Math.max(1, total)) * 100}%` }}
        />
      </div>
      <span className="font-mono text-[10.5px] text-ink-500">
        oldest statement first
      </span>
    </div>
  )
}

function Applied({
  view,
  before,
  now,
  onClose,
  onMore,
}: {
  view: BatchView
  before: Worth | null
  now: Worth | null
  onClose: () => void
  onMore: () => void
}) {
  const a = view.applied
  const waiting = view.files.filter((f) => f.status !== 'done').length
  const [shownNow, setShownNow] = useState(now)
  useEffect(() => setShownNow(now), [now])
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <span className="motion-stamp grid size-14 place-items-center rounded-full bg-state-good/12 text-state-good">
        <Check className="size-6" />
      </span>
      <h2 className="text-[21px] font-light">
        {a?.accounts ?? 0} accounts updated · {a?.rows ?? 0} new rows
      </h2>
      {before && shownNow ? (
        <div className="grid w-full gap-2.5 sm:grid-cols-3">
          {(
            [
              ['total', before.total, shownNow.total],
              ['free cash', before.cash, shownNow.cash],
              ['invested', before.invested, shownNow.invested],
            ] as const
          ).map(([k, was, is], i) => (
            <div
              key={k}
              style={{ animationDelay: `${120 + i * 80}ms` }}
              className="motion-land flex flex-col gap-1.5 rounded-[16px] bg-lift/[0.035] p-3 text-left ring-1 ring-lift/[0.07] ring-inset"
            >
              <span className="label-caps">{k}</span>
              <span className="font-mono text-[12px] text-ink-500 line-through">
                <Veiled>{euros(was)}</Veiled>
              </span>
              <span key={is} className="motion-pop text-[22px] font-light">
                <Veiled>{euros(is)}</Veiled>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="max-w-md text-[12.5px] text-ink-500">
        Not money made — what the app now sees: rows and balances from the files
        you dropped, counted for the first time.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {waiting > 0 ? (
          <button type="button" onClick={onMore} className={PILL_QUIET}>
            {waiting} {waiting === 1 ? 'file' : 'files'} still waiting
          </button>
        ) : null}
        <button type="button" onClick={onClose} className={PILL_LOUD}>
          <ArrowRight className="size-3.5" />
          see it on overview
        </button>
      </div>
    </div>
  )
}

/* ---- Small pieces ---------------------------------------------------- */

function Stat({
  n,
  label,
  className = '',
}: {
  n: number
  label: string
  className?: string
}) {
  return (
    <span className="whitespace-nowrap">
      <span
        key={n}
        className={`motion-pop text-[26px] font-light tracking-tight ${className}`}
      >
        {n}
      </span>
      <span className="ml-1.5 font-mono text-[10px] tracking-[0.14em] text-ink-500 uppercase">
        {label}
      </span>
    </span>
  )
}

function Tag({
  tone,
  children,
}: {
  tone?: 'good' | 'warn' | 'new'
  children: ReactNode
}) {
  const color =
    tone === 'good'
      ? 'bg-state-good/12 text-state-good'
      : tone === 'warn'
        ? 'bg-state-warn/12 text-state-warn'
        : tone === 'new'
          ? 'bg-lav-400/14 text-lav-300 ring-1 ring-lav-400/35 ring-inset'
          : 'bg-lift/[0.05] text-ink-400'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] whitespace-nowrap uppercase ${color}`}
    >
      {children}
    </span>
  )
}

function Opt({
  loud = false,
  disabled = false,
  onClick,
  children,
}: {
  loud?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`motion-press inline-flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1.5 text-[12.5px] ring-1 transition-colors ring-inset disabled:opacity-50 ${
        loud
          ? 'bg-lav-400/15 text-foreground ring-lav-400/45 hover:bg-lav-400/25'
          : 'bg-lift/[0.03] text-ink-200 ring-lift/14 hover:bg-lav-400/10 hover:ring-lav-400/50'
      }`}
    >
      {children}
    </button>
  )
}

function Legend({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i className={`inline-block h-2 w-3.5 rounded-[3px] ${className}`} />
      {children}
    </span>
  )
}

function Who({ account }: { account: Doc<'accounts'> | undefined }) {
  if (!account) return <span />
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <AccountLogo name={account.name} domain={account.domain} size={18} />
      <span className="truncate">{account.name}</span>
    </span>
  )
}
