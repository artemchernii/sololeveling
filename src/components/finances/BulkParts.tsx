import { useState } from 'react'
import type { ReactNode } from 'react'
import { useMutation } from 'convex/react'
import type { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { MAX_BATCH_FILES, readableFile } from '@/lib/intake'
import { euros } from '@/lib/money'

export type Review = NonNullable<
  ReturnType<typeof useQuery<typeof api.intake.batchReview>>
>

export type Ask = Review['asks'][number]

export type BatchView = NonNullable<
  ReturnType<typeof useQuery<typeof api.intake.batch>>
>

export const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

export const DAY_YEAR = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export const MONTH_LONG = new Intl.DateTimeFormat(undefined, { month: 'long' })

export const MONTH_NARROW = new Intl.DateTimeFormat(undefined, {
  month: 'narrow',
})

export const MONTH_YEAR = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
})

export function monthDate(key: string): Date {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

export const signed = (n: number) => `${n < 0 ? '−' : '+'}${euros(Math.abs(n))}`

export function Stat({
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

export function Tag({
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

export function Opt({
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

export function Legend({
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

export function Who({ account }: { account: Doc<'accounts'> | undefined }) {
  if (!account) return <span />
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <AccountLogo name={account.name} domain={account.domain} size={18} />
      <span className="truncate">{account.name}</span>
    </span>
  )
}

export function useBatchUpload() {
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
