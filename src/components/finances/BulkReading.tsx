import { useEffect, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  AlertTriangle,
  Check,
  FileText,
  ImageIcon,
  Loader2,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { AccountLogo } from '@/components/finances/Logo'
import { productById } from '@/lib/institutions'
import { DAY, Tag } from '@/components/finances/BulkParts'
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

/* Reading (rebuilt 10 Oct to design/treasury-mockup/update.html): one
   line per file — waiting, reading, read and whose it is, or why not.
   Every line is one height whatever it says, so nothing shifts while
   files are read (Artem: "on every bank read modal jumps"). */
export function BulkReading({ view }: { view: BatchView }) {
  const accounts = useQuery(api.accounts.list, {})
  const files = view.files
  const read = files.filter((f) => f.status !== 'reading').length
  const started = files.flatMap((f) =>
    f.readingSince === null ? [] : [f.readingSince],
  )
  const elapsed = useElapsed(started.length ? Math.min(...started) : null)
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
      <div className="flex flex-col gap-1.5">
        {files.map((f) => {
          const doc = accounts?.find((a) => a._id === f.accountId)
          const product = f.suggest ? productById(f.suggest.product) : undefined
          return (
            <FileLine
              key={f.intakeId}
              file={f}
              whose={
                doc
                  ? { name: doc.name, domain: doc.domain ?? null, isNew: false }
                  : product
                    ? {
                        name: product.name,
                        domain: product.domain ?? null,
                        isNew: true,
                      }
                    : null
              }
            />
          )
        })}
      </div>
      <p className="border-t border-lav-400/10 pt-3 text-[12.5px] text-ink-400">
        You can close this. Reading goes on and waits for you on ADD.
      </p>
    </div>
  )
}

function FileLine({
  file: f,
  whose,
}: {
  file: BatchView['files'][number]
  whose: { name: string; domain: string | null; isNew: boolean } | null
}) {
  const reading = f.status === 'reading'
  const failed = f.status === 'failed'
  const noun =
    f.kind === 'holdings'
      ? 'positions'
      : f.kind === 'trades'
        ? 'trades'
        : 'rows'
  const sub = reading
    ? `${STAGE[f.stage ?? 'opening']}${f.rows > 0 ? ` · ${f.rows}` : ''}`
    : failed
      ? (f.error ?? 'It could not be read.')
      : `${f.rows} ${noun}${f.from !== null && f.to !== null ? ` · ${DAY.format(f.from)} to ${DAY.format(f.to)}` : ''}`
  return (
    <div
      data-testid="file-line"
      className={`relative grid h-[58px] grid-cols-[20px_1fr_auto] items-center gap-3 overflow-hidden rounded-[13px] px-3.5 ring-1 transition-[background-color,box-shadow] duration-300 ring-inset ${
        reading
          ? 'bg-lift/[0.035] shadow-[0_0_22px_-12px_var(--color-lav-400)] ring-lav-400/40'
          : failed
            ? 'bg-state-danger/[0.05] ring-state-danger/35'
            : 'bg-lift/[0.035] ring-lift/[0.07]'
      }`}
    >
      {reading ? (
        <i
          aria-hidden
          style={{ animation: 'sweep 1.6s linear infinite' }}
          className="pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-lav-400/10 to-transparent"
        />
      ) : null}
      {reading ? (
        <Loader2 className="size-4 animate-spin text-lav-300" />
      ) : failed ? (
        <AlertTriangle className="size-4 text-state-danger" />
      ) : (
        <Check className="motion-pop size-4 text-state-good" />
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[12px] text-foreground">
          {f.image ? (
            <ImageIcon className="size-3.5 shrink-0 text-ink-500" />
          ) : (
            <FileText className="size-3.5 shrink-0 text-ink-500" />
          )}
          <span className="truncate">{f.name}</span>
        </span>
        <span
          className={`truncate text-[12px] ${
            reading
              ? 'text-lav-300'
              : failed
                ? 'text-state-danger'
                : 'text-ink-400'
          }`}
        >
          {sub}
        </span>
      </span>
      {whose ? (
        <span className="inline-flex min-w-0 items-center gap-2 text-[12.5px] text-ink-200">
          <AccountLogo name={whose.name} domain={whose.domain} size={20} />
          <span className="max-w-[140px] truncate">{whose.name}</span>
          {whose.isNew ? <Tag tone="new">new</Tag> : null}
        </span>
      ) : (
        <span className="font-mono text-[10.5px] text-ink-500">
          {reading ? 'finding whose' : failed ? 'not read' : ''}
        </span>
      )}
    </div>
  )
}
