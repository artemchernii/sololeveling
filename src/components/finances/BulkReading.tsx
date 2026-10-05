import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  Check,
  CircleHelp,
  FileText,
  ImageIcon,
  Layers,
  Loader2,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { AccountsLanded } from '@/components/finances/Landed'
import { AccountLogo } from '@/components/finances/Logo'
import { productById } from '@/lib/institutions'
import { Tag } from '@/components/finances/BulkParts'
import type { BatchView } from '@/components/finances/BulkParts'

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

export function BulkReading({ view }: { view: BatchView }) {
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

export function Applying({ view }: { view: BatchView }) {
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

export function Applied({
  view,
  onClose,
  onMore,
}: {
  view: BatchView
  onClose: () => void
  onMore: () => void
}) {
  const waiting = view.files.filter((f) => f.status !== 'done').length
  /* One line an account (5 Oct), the same screen a single file lands
     on. A batch applied before per-account counts were kept falls back
     to its files' rows. */
  const accounts =
    view.applied?.byAccount?.map((x) => ({
      accountId: x.accountId,
      added: x.rows,
    })) ??
    [
      ...new Set(
        view.files.flatMap((f) =>
          f.status === 'done' && f.accountId ? [f.accountId] : [],
        ),
      ),
    ].map((accountId) => ({
      accountId,
      added: view.files
        .filter((f) => f.accountId === accountId && f.status === 'done')
        .reduce((t, f) => t + f.rows, 0),
    }))
  return (
    <AccountsLanded accounts={accounts}>
      {waiting > 0 ? (
        <button type="button" onClick={onMore} className={PILL_QUIET}>
          {waiting} {waiting === 1 ? 'file' : 'files'} still waiting
        </button>
      ) : null}
      <button
        type="button"
        onClick={onClose}
        className={`${PILL_LOUD} justify-center px-8 py-2.5`}
      >
        done
      </button>
    </AccountsLanded>
  )
}
