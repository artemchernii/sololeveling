import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  ArrowRight,
  Check,
  CircleHelp,
  FileText,
  Files,
  ImageIcon,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Repeat2,
  Sigma,
  TrendingDown,
  TrendingUp,
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
import { productById, searchProducts } from '@/lib/institutions'
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

const STAGE: Record<string, string> = {
  opening: 'finding the bank',
  columns: 'reading the columns',
  rows: 'reading rows',
  tickers: 'matching tickers',
}

/* Seconds since the drop began reading — so a long read is seen moving. */
function useElapsed(since: number | null): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (since === null) return ''
  const s = Math.max(0, Math.round((now - since) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function BulkReading({ view }: { view: BatchView }) {
  const accounts = useQuery(api.accounts.list, {})
  const files = view.files
  const read = files.filter((f) => f.status !== 'reading').length
  const started = files.flatMap((f) =>
    f.readingSince === null ? [] : [f.readingSince],
  )
  const elapsed = useElapsed(started.length ? Math.min(...started) : null)
  type Bin = {
    key: string
    name: string
    domain: string | null
    isNew: boolean
    files: typeof files
  }
  const bins: Array<Bin> = []
  const opening: typeof files = []
  for (const f of files) {
    const doc = accounts?.find((a) => a._id === f.accountId)
    const product = f.suggest ? productById(f.suggest.product) : undefined
    const key = doc ? doc._id : product ? `new:${product.id}` : null
    if (key === null) {
      opening.push(f)
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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline gap-2.5">
          <span
            key={read}
            className="motion-pop text-[34px] leading-none font-light tracking-tight"
          >
            {read}
          </span>
          <span className="text-[13px] text-ink-400">
            of {files.length} files read
          </span>
          <span className="ml-auto font-mono text-[11px] text-ink-500">
            {elapsed}
          </span>
        </div>
        <div className="relative h-1 overflow-hidden rounded-full bg-lift/[0.07]">
          <i
            className="block h-full rounded-full bg-gradient-to-r from-lav-400 to-lav-300 shadow-[0_0_12px_var(--color-lav-400)] transition-[width] duration-500"
            style={{ width: `${(read / Math.max(1, files.length)) * 100}%` }}
          />
          {read < files.length ? (
            /* The sweep keyframes, looping while anything is still read. */
            <i
              style={{ animation: 'sweep 1.6s linear infinite' }}
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-lav-300/60 to-transparent"
            />
          ) : null}
        </div>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {bins.map((b) => (
          <ReadingBin
            key={b.key}
            title={b.name}
            logo={<AccountLogo name={b.name} domain={b.domain} size={26} />}
            tag={b.isNew ? <Tag tone="new">new</Tag> : null}
            files={b.files}
          />
        ))}
        {opening.length > 0 ? (
          <ReadingBin
            title="Finding whose"
            logo={
              <span className="grid size-[26px] place-items-center rounded-[8px] bg-lav-400/12 text-lav-300">
                <CircleHelp className="size-4" />
              </span>
            }
            tag={null}
            files={opening}
          />
        ) : null}
      </div>
      <p className="border-t border-lav-400/10 pt-3 text-[12.5px] text-ink-400">
        You can close this — reading goes on, and the review waits under UPDATE
        ALL.
      </p>
    </div>
  )
}

function ReadingBin({
  title,
  logo,
  tag,
  files,
}: {
  title: string
  logo: ReactNode
  tag: ReactNode
  files: BatchView['files']
}) {
  const live = files.some((f) => f.status === 'reading')
  const done = files.filter((f) => f.status !== 'reading').length
  return (
    <div
      className={`motion-land flex flex-col gap-2 rounded-[16px] bg-lift/[0.035] p-3 ring-1 ring-inset ${
        live ? 'ring-lav-400/40' : 'ring-lift/[0.07]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        {logo}
        <b className="flex-1 truncate font-medium">{title}</b>
        {tag}
        <span className="font-mono text-[12px] text-ink-300">
          {done}/{files.length}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {files.map((f) => (
          <div
            key={f.intakeId}
            className="flex items-center gap-2 text-[12px] text-ink-300"
          >
            {f.image ? (
              <ImageIcon className="size-3.5 shrink-0 text-ink-500" />
            ) : (
              <FileText className="size-3.5 shrink-0 text-ink-500" />
            )}
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            {f.status === 'reading' ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[10.5px] text-lav-300">
                <Loader2 className="size-3 animate-spin" />
                {STAGE[f.stage ?? 'opening']}
                {f.stage === 'rows' && f.rows > 0 ? ` · ${f.rows}` : ''}
              </span>
            ) : f.status === 'failed' ? (
              <span className="shrink-0 font-mono text-[10.5px] text-state-danger">
                not read
              </span>
            ) : (
              <span className="motion-land inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] text-state-good">
                <Check className="size-3" />
                {f.rows} {f.kind === 'holdings' ? 'positions' : 'rows'}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
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
  const balances = useQuery(api.aggregate.balances, {})
  const apply = useMutation(api.intake.applyBatch)
  const discard = useMutation(api.intake.discardBatch)
  const dayStart = useDayStarts(1).at(-1) as number
  const [solved, setSolved] = useState<Array<{ key: string; text: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sure, setSure] = useState(false)
  if (review === undefined || accounts === undefined)
    return <div className="min-h-[320px]" />

  const doc = (id: Id<'accounts'>) => accounts.find((a) => a._id === id)
  const placed = review.accounts.filter(
    (a) => a.accountId !== null && !a.leftOut,
  )
  const waitingNew = review.accounts.filter((a) => a.accountId === null)
  const fresh = review.accounts
    .filter((a) => !a.leftOut)
    .reduce((t, a) => t + a.fresh + a.trades, 0)
  const months = review.months
  const asks = review.asks.filter(
    (a) => !solved.some((s) => s.key === askKey(a)),
  )
  const range =
    months.length > 0
      ? `${MONTH_YEAR.format(monthDate(months[0]))} – ${MONTH_YEAR.format(monthDate(months[months.length - 1]))}`
      : ''
  const solve = (key: string) => (text: string) =>
    setSolved((s) => [...s, { key, text }])

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
              onSolved={solve(askKey(a))}
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
        const d = a.accountId ? doc(a.accountId) : undefined
        /* Only an account with a balance already has a "now" — a new
           one's first statement is not a gain. */
        const held = a.accountId
          ? balances?.accounts.find((x) => x.accountId === a.accountId)
          : undefined
        const now = held?.pockets.some((p) => p.recordedAt !== null)
          ? held.cashEur
          : undefined
        return (
          <AccountBlock
            key={a.accountId ?? `new:${a.product?.id}`}
            block={a}
            account={d ?? null}
            accounts={accounts}
            months={months}
            index={i}
            batchId={batchId}
            nowEur={now ?? null}
            onCheck={onCheck}
            holes={review.asks.some(
              (x) => x.kind === 'hole' && x.accountId === a.accountId,
            )}
          />
        )
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
              paired — each written once, never as income or spending
            </span>
          </div>
          {review.moves.map((m) => (
            <div
              key={`${m.fromAccountId}${m.toAccountId}${m.occurredAt}${m.amount}`}
              className="grid grid-cols-[48px_auto_16px_auto_1fr_auto] items-center gap-2 text-[12.5px] text-ink-200"
            >
              <span className="font-mono text-[10.5px] text-ink-500">
                {DAY.format(m.occurredAt)}
              </span>
              <Who account={doc(m.fromAccountId)} />
              <ArrowRight className="size-3.5 text-lav-400" />
              <Who account={doc(m.toAccountId)} />
              <span className="text-right font-mono">
                <Veiled>{euros(m.amount)}</Veiled>
              </span>
              <span className="hidden sm:inline">
                {m.had ? (
                  <Tag>other side already in the app</Tag>
                ) : m.days > 0 ? (
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
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-lav-400/12 pt-3.5">
        <span className="min-w-[200px] flex-1 text-[12.5px] text-ink-400">
          {error ? (
            <span className="text-state-danger">{error}</span>
          ) : (
            [
              asks.length > 0
                ? `${asks.length === 1 ? 'One question' : `${asks.length} questions`} left — they wait here.`
                : null,
              waitingNew.length > 0
                ? `${waitingNew.map((a) => a.product?.name).join(', ')} ${waitingNew.length === 1 ? 'waits' : 'wait'} until you add ${waitingNew.length === 1 ? 'it' : 'them'}.`
                : null,
              asks.length === 0 && waitingNew.length === 0
                ? 'Oldest statement first, so every balance lands on its day. Nothing is saved until you press it.'
                : null,
            ]
              .filter(Boolean)
              .join(' ')
          )}
        </span>
        {sure ? (
          <button
            type="button"
            onClick={() => void discard({ batchId }).then(onClose)}
            className={`${PILL_QUIET} text-state-danger`}
          >
            throw all {review.files} files away
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSure(true)}
            className={PILL_QUIET}
          >
            start over
          </button>
        )}
        <button type="button" onClick={onClose} className={PILL_QUIET}>
          later
        </button>
        <button
          type="button"
          disabled={busy || placed.length === 0}
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
          apply {placed.length} account{placed.length === 1 ? '' : 's'}
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
    case 'hole':
      return `hole:${a.accountId}:${a.month}`
    case 'oneSide':
      return `oneSide:${a.intakeId}:${a.index}`
    case 'gap':
      return a.key
  }
}

/* The screenshot itself, small — "whose is it?" is answered by looking. */
function Thumb({ intakeId }: { intakeId: Id<'intakes'> }) {
  const url = useQuery(api.intake.preview, { intakeId })
  const [big, setBig] = useState(false)
  if (!url) return null
  return (
    <button
      type="button"
      onClick={() => setBig((b) => !b)}
      className={`shrink-0 overflow-hidden rounded-[10px] ring-1 ring-lift/15 transition-[width] ${
        big ? 'w-56' : 'w-14'
      }`}
      title={big ? 'smaller' : 'bigger'}
    >
      <img src={url} alt="" className="block w-full" />
    </button>
  )
}

/* "+ another": a bank or broker the app knows that he has not added —
   a tap makes it (logo, kind, currencies from the list). */
function AnotherAccount({
  want,
  accounts,
  busy,
  onPick,
}: {
  want: 'bank' | 'broker' | null
  accounts: ReadonlyArray<Doc<'accounts'>>
  busy: boolean
  onPick: (p: NonNullable<ReturnType<typeof productById>>) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const owned = new Set(accounts.map((a) => a.institution).filter(Boolean))
  const list = searchProducts(q)
    .filter(
      (p) =>
        !owned.has(p.institution) && (want === null || p.kinds.includes(want)),
    )
    .slice(0, 8)
  if (!open)
    return (
      <Opt disabled={busy} onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        another…
      </Opt>
    )
  return (
    <div className="flex w-full flex-col gap-1.5">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="bank or broker"
        className="w-full max-w-xs rounded-full bg-lift/[0.05] px-3 py-1.5 text-[12.5px] text-foreground ring-1 ring-lift/14 outline-none ring-inset placeholder:text-ink-500 focus:ring-lav-400/50"
      />
      <div className="flex flex-wrap gap-1.5">
        {list.map((p) => (
          <Opt key={p.id} disabled={busy} onClick={() => onPick(p)}>
            <AccountLogo name={p.name} domain={p.domain} size={18} />
            {p.name}
          </Opt>
        ))}
      </div>
    </div>
  )
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
  const readAgain = useMutation(api.intake.readAgain)
  const discard = useMutation(api.intake.discard)
  const { send, sent } = useBatchUpload()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
  /* Into one of his accounts — and, for a screenshot, read again with the
     account named, so the reader knows whose screen it is. */
  const placeInto = (
    intakeId: Id<'intakes'>,
    accountId: Id<'accounts'>,
    again: boolean,
  ) =>
    answer({
      batchId,
      answer: { kind: 'place', intakeIds: [intakeId], accountId },
    }).then(() => (again ? readAgain({ intakeId }) : null))
  const makeAccount = (p: NonNullable<ReturnType<typeof productById>>) =>
    create({
      name: p.name,
      kinds: p.kinds,
      currencies: p.currencies,
      domain: p.domain,
      product: p.id,
    })
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
  const fits = (want: 'bank' | 'broker' | null) =>
    accounts.filter(
      (a) =>
        (want === null || a.kinds.includes(want)) &&
        (a.kinds.includes('bank') || a.kinds.includes('broker')),
    )

  let icon: ReactNode = <CircleHelp className="size-4" />
  let thumb: ReactNode = null
  let q: ReactNode = null
  let sub: ReactNode = null
  let opts: ReactNode = null
  switch (ask.kind) {
    case 'whose': {
      icon = <ImageIcon className="size-4" />
      thumb = ask.image ? <Thumb intakeId={ask.intakeId} /> : null
      const want = ask.what === 'transactions' ? null : 'broker'
      q =
        ask.what === 'holdings' ? (
          <>
            <b className="font-medium">{ask.name}</b> is a broker screen:{' '}
            {ask.rows} {ask.rows === 1 ? 'position' : 'positions'}
            {ask.investedEur ? (
              <>
                {' '}
                worth <Veiled>{euros(ask.investedEur)}</Veiled>
              </>
            ) : null}
            {ask.cashEur !== null ? (
              <>
                , cash <Veiled>{euros(ask.cashEur)}</Veiled>
              </>
            ) : null}
            . Which broker is it?
          </>
        ) : (
          <>
            <b className="font-medium">{ask.name}</b>: {ask.rows} rows
            {ask.from !== null && ask.to !== null
              ? `, ${DAY.format(ask.from)}–${DAY.format(ask.to)}`
              : ''}
            . Whose account is it?
          </>
        )
      sub = ask.seen
        ? `Nothing on it names the bank — the top reads "${ask.seen}".`
        : 'Nothing on it names the bank or broker.'
      opts = (
        <>
          {chips(fits(want), (a) =>
            act(
              () => placeInto(ask.intakeId, a._id, ask.image),
              ask.image
                ? `${ask.name} → ${a.name}, read again with that.`
                : `${ask.name} → ${a.name}.`,
            ),
          )}
          <AnotherAccount
            want={want}
            accounts={accounts}
            busy={busy}
            onPick={(p) =>
              act(async () => {
                const id = await makeAccount(p)
                await placeInto(ask.intakeId, id, ask.image)
              }, `${p.name} added — ${ask.name} is read again as its screen.`)
            }
          />
        </>
      )
      break
    }
    case 'hole': {
      const month = MONTH_LONG.format(monthDate(ask.month))
      q = (
        <>
          <b className="font-medium">{name(ask.accountId)}</b> has no rows in{' '}
          {month} — a statement is missing?
        </>
      )
      sub = `The months either side of ${month} have rows in this drop.`
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
          {into ? 'into' : 'out of'} {name(ask.accountId)} on{' '}
          {DAY.format(ask.occurredAt)} — "{ask.merchant}".
        </>
      )
      sub = into
        ? 'Your own money arriving — but no account in this drop sent it. Which one did it leave?'
        : 'Your own money leaving — but no account in this drop received it. Where did it go?'
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
          <b className="font-medium">{name(ask.accountId)}</b>: the balances say{' '}
          <Veiled>{euros(Math.abs(ask.gap))}</Veiled>{' '}
          {short ? 'more left' : 'more arrived'} between {DAY.format(ask.from)}{' '}
          and {DAY.format(ask.to)} than the rows show.
        </>
      )
      sub = short
        ? 'A row cut off a statement or a screenshot?'
        : 'A deposit missing from the rows?'
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
            add the missing row on {DAY.format(ask.to)}
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
      thumb = <Thumb intakeId={ask.intakeId} />
      q = (
        <>
          <b className="font-medium">{name(ask.accountId)}</b>: {ask.missing} of{' '}
          {ask.positions} positions on {ask.name} have no share count or ticker
          the app could find.
        </>
      )
      sub =
        'Read it again with the account named, or fill them in on the check screen.'
      opts = (
        <>
          <Opt
            disabled={busy}
            onClick={() =>
              act(
                () => readAgain({ intakeId: ask.intakeId }),
                `${ask.name} is being read again.`,
              )
            }
          >
            <RefreshCw className="size-3.5" />
            read again
          </Opt>
          <Opt loud onClick={() => onCheck(ask.intakeId)}>
            check it
          </Opt>
        </>
      )
      break
    }
    case 'failed': {
      thumb = ask.image ? <Thumb intakeId={ask.intakeId} /> : null
      q = (
        <>
          <b className="font-medium">{ask.name}</b> could not be used.
        </>
      )
      sub = ask.error
      opts = (
        <>
          <Opt
            disabled={busy}
            onClick={() =>
              act(
                () => readAgain({ intakeId: ask.intakeId }),
                `${ask.name} is being read again.`,
              )
            }
          >
            <RefreshCw className="size-3.5" />
            read again
          </Opt>
          {ask.image ? (
            <>
              {chips(fits(null), (a) =>
                act(
                  () => placeInto(ask.intakeId, a._id, true),
                  `${ask.name} is read again as ${a.name}'s.`,
                ),
              )}
              <AnotherAccount
                want={null}
                accounts={accounts}
                busy={busy}
                onPick={(p) =>
                  act(async () => {
                    const id = await makeAccount(p)
                    await placeInto(ask.intakeId, id, true)
                  }, `${p.name} added — ${ask.name} is read again as its screen.`)
                }
              />
            </>
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
      <div className="flex items-start gap-3 text-[13.5px] leading-snug text-ink-100">
        {thumb ?? <span className="mt-0.5 text-state-warn">{icon}</span>}
        <div className="flex min-w-0 flex-col gap-1">
          <span>{q}</span>
          {sub ? <span className="text-[12px] text-ink-400">{sub}</span> : null}
          {error ? (
            <span className="text-[12px] text-state-danger">{error}</span>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-7">{opts}</div>
    </div>
  )
}

function AccountBlock({
  block,
  account,
  accounts,
  months,
  index,
  batchId,
  nowEur,
  holes,
  onCheck,
}: {
  block: Review['accounts'][number]
  account: Doc<'accounts'> | null
  accounts: ReadonlyArray<Doc<'accounts'>>
  months: ReadonlyArray<string>
  index: number
  batchId: Id<'batches'>
  /* What the app shows for it now — the change this drop makes. */
  nowEur: number | null
  holes: boolean
  onCheck: (id: Id<'intakes'>) => void
}) {
  const answer = useMutation(api.intake.batchAnswer)
  const create = useMutation(api.accounts.create)
  const readAgain = useMutation(api.intake.readAgain)
  const [rows, setRows] = useState(false)
  const [mine, setMine] = useState(false)
  const [busy, setBusy] = useState(false)
  const product = block.product ? productById(block.product.id) : undefined
  const title = account?.name ?? block.product?.name ?? ''
  const domain = account?.domain ?? product?.domain ?? null
  const kinds = account?.kinds ?? product?.kinds ?? []
  const { first, last, holdings } = block
  const twoReadings =
    first !== null && last !== null && first.asOf !== last.asOf
  const change =
    last !== null && nowEur !== null
      ? Math.round((last.value - nowEur) * 100) / 100
      : null
  const intakeIds = block.files.map((f) => f.intakeId)

  async function keep(into?: Id<'accounts'>) {
    if (!product && !into) return
    setBusy(true)
    try {
      const accountId =
        into ??
        (await create({
          name: product?.name ?? title,
          kinds: product?.kinds ?? ['bank'],
          currencies: product?.currencies ?? ['EUR'],
          domain: product?.domain,
          product: product?.id,
          ibanTails: block.product?.accountTail
            ? [block.product.accountTail]
            : undefined,
        }))
      await answer({
        batchId,
        answer: { kind: 'place', intakeIds, accountId },
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{ animationDelay: `${120 + index * 80}ms` }}
      className={`motion-land flex flex-col gap-3 rounded-[18px] p-3.5 ring-1 transition-opacity ring-inset ${
        account === null
          ? 'bg-lav-400/[0.05] ring-lav-400/30'
          : 'bg-lift/[0.035] ring-lift/[0.07]'
      } ${block.leftOut ? 'opacity-40' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <AccountLogo name={title} domain={domain} size={30} />
        <div className="flex min-w-[140px] flex-1 flex-col gap-0.5">
          <b className="flex items-center gap-2 text-[15px] font-medium">
            {title}
            {account === null ? <Tag tone="new">new</Tag> : null}
          </b>
          <span className="font-mono text-[10.5px] text-ink-500">
            {kinds.join(' · ')} · {block.files.length}{' '}
            {block.files.length === 1 ? 'file' : 'files'}
          </span>
        </div>
        {last !== null ? (
          <div className="flex flex-wrap items-center justify-end gap-2 font-mono text-[13px] text-ink-300">
            {nowEur !== null && change !== null && change !== 0 ? (
              <>
                <small className="text-[10px] text-ink-500">now</small>
                <Veiled>{euros(nowEur)}</Veiled>
                <span className="text-ink-600">→</span>
              </>
            ) : twoReadings ? (
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
            {change !== null && change !== 0 ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${
                  change > 0
                    ? 'bg-state-good/12 text-state-good'
                    : 'bg-state-danger/12 text-state-danger'
                }`}
              >
                {change > 0 ? (
                  <TrendingUp className="size-3.5" />
                ) : (
                  <TrendingDown className="size-3.5" />
                )}
                <Veiled>{signed(change)}</Veiled>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {account === null && block.product ? (
        <div className="flex flex-col gap-2 rounded-[12px] bg-lift/[0.03] px-3 py-2.5 text-[12.5px] text-ink-300">
          <span>
            A {kinds[0] ?? 'bank'} you haven't added yet — found on{' '}
            {block.files.map((f) => f.name).join(', ')}
            {block.product.accountTail
              ? `, account ending …${block.product.accountTail}`
              : ''}
            {block.product.holder
              ? `, in the name of ${block.product.holder}`
              : ''}
            . Its rows and balance go in once you add it.
          </span>
          <div className="flex flex-wrap gap-1.5">
            {mine ? (
              accounts
                .filter((a) => kinds.some((k) => a.kinds.includes(k)))
                .map((a) => (
                  <Opt
                    key={a._id}
                    disabled={busy}
                    onClick={() => void keep(a._id)}
                  >
                    <AccountLogo name={a.name} domain={a.domain} size={18} />
                    {a.name}
                  </Opt>
                ))
            ) : (
              <>
                <Opt loud disabled={busy} onClick={() => void keep()}>
                  <Plus className="size-3.5" />
                  add {title}
                </Opt>
                <Opt disabled={busy} onClick={() => setMine(true)}>
                  it's one I have…
                </Opt>
              </>
            )}
          </div>
        </div>
      ) : null}

      {months.length > 0 && holdings === null ? (
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

      {holdings !== null ? (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12.5px] text-ink-400">
          <span>
            <b className="font-normal text-foreground">{holdings.positions}</b>{' '}
            positions ·{' '}
            <b className="font-normal text-foreground">
              <Veiled>{euros(holdings.investedEur)}</Veiled>
            </b>{' '}
            invested
          </span>
          {holdings.cashEur !== null ? (
            <span>
              cash{' '}
              <b className="font-normal text-foreground">
                <Veiled>{euros(holdings.cashEur)}</Veiled>
              </b>
            </span>
          ) : null}
          {holdings.complete ? (
            <Tag tone="good">
              <Check className="size-3" />
              every position known
            </Tag>
          ) : (
            <button
              type="button"
              onClick={() => onCheck(block.files[0].intakeId)}
              className="font-mono text-[10.5px] tracking-[0.12em] text-state-warn uppercase"
            >
              check positions
            </button>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-400">
        {block.fresh > 0 || block.had > 0 || holdings === null ? (
          <span>
            <b className="font-normal text-foreground">{block.fresh}</b> new
            rows
          </span>
        ) : null}
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
        {block.pending !== 0 ? (
          <Tag>
            <Veiled>{euros(Math.abs(block.pending))}</Veiled> pending
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
        {account !== null ? (
          <button
            type="button"
            onClick={() =>
              void answer({
                batchId,
                answer: {
                  kind: 'leaveOut',
                  accountId: account._id,
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
        ) : null}
      </div>

      {rows ? (
        <div className="flex flex-col border-t border-lift/[0.06] pt-2">
          <div className="flex flex-wrap gap-1.5 pb-2">
            {block.files.map((f) => (
              <span
                key={f.intakeId}
                className="inline-flex items-center gap-1.5 rounded-full bg-lift/[0.04] py-0.5 pr-1 pl-2.5 text-[11.5px] text-ink-300"
              >
                {f.image ? (
                  <ImageIcon className="size-3" />
                ) : (
                  <FileText className="size-3" />
                )}
                {f.name}
                <button
                  type="button"
                  title="read it again"
                  onClick={() => void readAgain({ intakeId: f.intakeId })}
                  className="grid size-5 place-items-center rounded-full text-ink-500 hover:bg-lav-400/15 hover:text-lav-300"
                >
                  <RefreshCw className="size-3" />
                </button>
              </span>
            ))}
          </div>
          {block.rows.map((r, j) => (
            <div
              key={`${r.occurredAt}${r.merchant}${j}`}
              className={`grid grid-cols-[52px_1fr_auto] items-center gap-2.5 py-1.5 text-[12.5px] text-ink-200 sm:grid-cols-[52px_1fr_auto_auto] ${
                r.had || r.pending ? 'opacity-45' : ''
              }`}
            >
              <span className="font-mono text-[10.5px] text-ink-500">
                {DAY.format(r.occurredAt)}
              </span>
              <span className="truncate">{r.merchant}</span>
              <span className="hidden sm:inline">
                <Tag>
                  {r.pending
                    ? 'pending'
                    : r.had
                      ? 'already had'
                      : (r.category ?? r.kind)}
                </Tag>
              </span>
              <span
                className={`font-mono ${r.kind === 'income' ? 'text-state-good' : ''}`}
              >
                <Veiled>{signed(r.amount)}</Veiled>
              </span>
            </div>
          ))}
          {block.rows.length >= 300 ? (
            <span className="label-caps pt-1 pl-[62px]">first 300 shown</span>
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
