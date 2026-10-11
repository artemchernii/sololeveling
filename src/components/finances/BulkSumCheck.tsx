import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Check, Clock, Loader2, Sigma } from 'lucide-react'
import type { ReactNode } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Veiled } from '@/components/finances/Veil'
import { euros } from '@/lib/money'
import { DAY, Opt, signed } from '@/components/finances/BulkParts'
import type { Review } from '@/components/finances/BulkParts'

type Block = Review['accounts'][number]

/* Does it add up, before apply (11 Oct, design/treasury-mockup/
   check-sum.html): was · out · in · now, the same four numbers as the
   landed card. When they do not reach the balance the file prints, the
   account is not saved until he answers. Every number is the server's
   (convex/rowBalance.ts accountCheck). */
export function SumCheck({
  block,
  name,
  batchId,
}: {
  block: Block
  name: string
  batchId: Id<'batches'>
}) {
  const answer = useMutation(api.intake.batchAnswer)
  const [busy, setBusy] = useState(false)
  const c = block.check
  if (!c) return null
  const file = block.files.every((f) => f.image) ? 'screenshot' : 'statement'
  const say = (key: string, on = true) => {
    setBusy(true)
    void answer({ batchId, answer: { kind: 'sum', key, on } }).finally(() =>
      setBusy(false),
    )
  }
  const leaveOut = () => {
    if (block.accountId === null) return
    setBusy(true)
    void answer({
      batchId,
      answer: { kind: 'leaveOut', accountId: block.accountId, out: true },
    }).finally(() => setBusy(false))
  }
  const off = c.state === 'ask' || c.state === 'off'
  const noRow = (
    <>
      <Veiled>{euros(Math.abs(c.gap))}</Veiled>{' '}
      {c.gap < 0 ? 'went out' : 'came in'} with no row
    </>
  )
  const opts = (children: ReactNode) => (
    <div className="flex min-h-[30px] flex-wrap items-center gap-1.5 sm:pl-[23px]">
      {busy ? (
        <span className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase">
          <Loader2 className="save-spinner size-3.5" />
          saving…
        </span>
      ) : (
        children
      )}
    </div>
  )

  return (
    <div
      data-sum={block.held ? 'held' : c.state}
      className="flex flex-col gap-3"
    >
      <div className="grid grid-cols-2 overflow-hidden rounded-[12px] bg-sink/[0.22] ring-1 ring-lift/[0.06] ring-inset sm:grid-cols-4">
        <Cell label={`was · ${DAY.format(c.wasAt)}`} value={euros(c.was)} />
        <Cell label="out" value={euros(c.out)} tone="out" />
        <Cell label="in" value={euros(c.in)} tone={c.in > 0 ? 'in' : 'none'} />
        <Cell
          label="now"
          value={euros(
            off && !block.held && c.printed !== null ? c.printed : c.now,
          )}
          tone="now"
          under={
            c.state === 'bare' ? (
              <span>no balance in the file</span>
            ) : c.state === 'ok' ? (
              <span className="flex items-center gap-1 text-state-good">
                <Check className="motion-pop size-3" strokeWidth={3} />
                as the {file} shows
              </span>
            ) : block.held ? (
              <span className="text-state-warn">
                {file} shows <Veiled>{euros(c.printed ?? 0)}</Veiled>
              </span>
            ) : (
              <span className="text-state-warn">{noRow}</span>
            )
          }
        />
      </div>

      {c.pending.map((r) => (
        <div
          key={r.key}
          className="flex items-start gap-2 text-[12.5px] leading-normal text-ink-300"
        >
          <Clock className="mt-0.5 size-3.5 shrink-0 text-lav-400" />
          <span>
            <span className="text-foreground">
              {r.merchant} <Veiled>{signed(r.amount)}</Veiled>
            </span>{' '}
            was pending on {DAY.format(c.wasAt)}. The{' '}
            <Veiled>{euros(c.was)}</Veiled> already had it taken off.
          </span>
        </div>
      ))}

      {block.held ? (
        <div className="motion-land flex flex-col gap-2.5 rounded-[14px] bg-state-warn/[0.06] p-3 ring-1 ring-state-warn/30 ring-inset">
          <div className="flex items-start gap-2 text-[13.5px] leading-normal">
            <Sigma className="mt-1 size-3.5 shrink-0 text-state-warn" />
            <div>
              <b className="font-medium">
                {c.twin ? 'Is this the same payment?' : <>{noRow}.</>}
              </b>
              <small className="block text-[12px] text-ink-400">
                {c.twin ? (
                  <>
                    Same amount,{' '}
                    {daysApart(c.twin.occurredAt, c.twin.mine.occurredAt)}. As
                    two payments the balance would be{' '}
                    <Veiled>{euros(c.now)}</Veiled>.
                  </>
                ) : c.gap < 0 ? (
                  `A payment may be cut off the ${file}.`
                ) : (
                  `A payment in may be cut off the ${file}.`
                )}
              </small>
            </div>
          </div>
          {c.twin ? (
            <>
              <Line
                at={c.twin.occurredAt}
                text={c.twin.merchant}
                note="new"
                amount={c.twin.amount}
              />
              <Line
                at={c.twin.mine.occurredAt}
                text={c.twin.mine.merchant}
                note="already added"
                amount={c.twin.amount}
                mine
              />
            </>
          ) : null}
          {c.twin
            ? opts(
                <>
                  <Opt loud onClick={() => say(`skip:${c.twin?.key}`)}>
                    <span className="pl-1.5">same payment</span>
                  </Opt>
                  <Opt onClick={() => say(`two:${c.twin?.key}`)}>
                    <span className="pl-1.5">two payments</span>
                  </Opt>
                </>,
              )
            : opts(
                <>
                  <Opt loud onClick={() => say(`sum:${block.accountId}`)}>
                    <span className="pl-1.5">
                      save with balance <Veiled>{euros(c.printed ?? 0)}</Veiled>
                    </span>
                  </Opt>
                  <Opt onClick={leaveOut}>
                    <span className="pl-1.5">skip {name}</span>
                  </Opt>
                </>,
              )}
        </div>
      ) : null}

      {c.skipped.map((r) => (
        <Done
          key={r.key}
          busy={busy}
          onUndo={() => say(`skip:${r.key}`, false)}
        >
          Same payment — added once.
        </Done>
      ))}
      {c.kept.map((r) => (
        <Done key={r.key} busy={busy} onUndo={() => say(`two:${r.key}`, false)}>
          Two payments.
        </Done>
      ))}
      {c.accepted && off ? (
        <Done busy={busy} onUndo={() => say(`sum:${block.accountId}`, false)}>
          Balance <Veiled>{euros(c.printed ?? 0)}</Veiled>, as the {file} shows.
        </Done>
      ) : null}
    </div>
  )
}

function daysApart(a: number, b: number): string {
  const n = Math.round(Math.abs(a - b) / 86_400_000)
  return n === 0
    ? 'the same day'
    : n === 1
      ? 'one day apart'
      : `${n} days apart`
}

function Cell({
  label,
  value,
  tone,
  under,
}: {
  label: string
  value: string
  tone?: 'out' | 'in' | 'none' | 'now'
  under?: ReactNode
}) {
  return (
    <div
      className={`flex min-w-0 flex-col gap-[3px] border-lift/[0.06] px-3 py-[9px] not-first:border-l max-sm:nth-[3]:border-l-0 max-sm:nth-[n+3]:border-t ${
        tone === 'now' ? 'bg-lav-400/[0.07]' : ''
      }`}
    >
      <span className="truncate font-mono text-[9.5px] tracking-[0.14em] text-ink-500 uppercase">
        {label}
      </span>
      <b
        className={`text-[16px] ${
          tone === 'out'
            ? 'font-light text-state-danger'
            : tone === 'in'
              ? 'font-light text-state-good'
              : tone === 'none'
                ? 'font-light text-ink-500'
                : tone === 'now'
                  ? 'font-normal text-foreground'
                  : 'font-light text-ink-200'
        }`}
      >
        <Veiled>{value}</Veiled>
      </b>
      <em className="flex min-h-3 items-center font-mono text-[9.5px] text-ink-500 not-italic">
        {under}
      </em>
    </div>
  )
}

function Line({
  at,
  text,
  note,
  amount,
  mine = false,
}: {
  at: number
  text: string
  note: string
  amount: number
  mine?: boolean
}) {
  return (
    <div
      className={`grid grid-cols-[52px_1fr_auto] items-center gap-2.5 rounded-[10px] px-2.5 py-[7px] text-[12.5px] sm:ml-[23px] ${
        mine
          ? 'text-ink-300 ring-1 ring-lav-400/22 ring-inset'
          : 'bg-sink/[0.22] text-ink-200'
      }`}
    >
      <span className="font-mono text-[10.5px] text-ink-500">
        {DAY.format(at)}
      </span>
      <span className="min-w-0">
        <span className="block truncate">{text}</span>
        <small className="block text-[11.5px] text-ink-400">{note}</small>
      </span>
      <span className="font-mono">
        <Veiled>{signed(amount)}</Veiled>
      </span>
    </div>
  )
}

function Done({
  busy,
  onUndo,
  children,
}: {
  busy: boolean
  onUndo: () => void
  children: ReactNode
}) {
  return (
    <div className="motion-land flex items-center gap-2.5 rounded-[14px] bg-state-good/[0.06] px-3 py-2.5 text-[13px] text-ink-200 ring-1 ring-state-good/30 ring-inset">
      <Check className="motion-pop size-4 shrink-0 text-state-good" />
      <span className="flex-1">{children}</span>
      <button
        type="button"
        disabled={busy}
        onClick={onUndo}
        className="font-mono text-[10.5px] tracking-[0.12em] text-lav-400 uppercase disabled:opacity-50"
      >
        undo
      </button>
    </div>
  )
}
