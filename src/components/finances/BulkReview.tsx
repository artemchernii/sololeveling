import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ArrowRight, Check, Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { useDayStarts } from '@/components/track/useDayStarts'
import { failureMessage } from '@/lib/convex-errors'
import type { productById } from '@/lib/institutions'
import { searchProducts } from '@/lib/institutions'
import { euros } from '@/lib/money'
import {
  DAY,
  MONTH_YEAR,
  monthDate,
  Stat,
  Tag,
  Opt,
  Legend,
  Who,
} from '@/components/finances/BulkParts'
import type { Ask } from '@/components/finances/BulkParts'
import { AskCard } from '@/components/finances/BulkAskCard'
import { AccountBlock } from '@/components/finances/BulkAccountBlock'

export function BulkReview({
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

export function askKey(a: Ask): string {
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
export function Thumb({ intakeId }: { intakeId: Id<'intakes'> }) {
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
export function AnotherAccount({
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
