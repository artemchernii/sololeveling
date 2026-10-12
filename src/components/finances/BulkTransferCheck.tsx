import { useState } from 'react'
import { useMutation } from 'convex/react'
import { ArrowLeftRight, ArrowRight, Check, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import type { Transfer } from '../../../convex/transferMatch'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { euros } from '@/lib/money'
import { DAY, Opt, signed } from '@/components/finances/BulkParts'

type Side = Transfer['sides'][number]
type Accounts = ReadonlyArray<Doc<'accounts'>>

/** A question of this account that is not answered: it is not saved. Of
    two rows of one drop, the arriving one asks. */
export const transferOpen = (t: Transfer) =>
  t.state === 'ask' && (t.sides.some((s) => s.stored) || t.amount > 0)

/** For the account's chips: transfers shown as one, and those of them
    the account already has (a chip of their own, not a row). */
export function transferCounts(transfers: ReadonlyArray<Transfer>) {
  const one = transfers.filter((t) => t.state === 'sure' || t.state === 'same')
  return {
    moved: one.length,
    here: one.filter((t) => t.sides.some((x) => x.id === t.chosen && x.here))
      .length,
  }
}

/* A transfer between two of his accounts, seen before apply (11 Oct,
   design/treasury-mockup/transfer-match.html): one line when the app is
   sure, both rows and the fee when it asks. Every number is the server's
   (convex/transferMatch.ts forDrop). */
export function TransferCheck({
  transfers,
  accounts,
  file,
  batchId,
}: {
  transfers: ReadonlyArray<Transfer>
  accounts: Accounts
  file: 'screenshot' | 'statement'
  batchId: Id<'batches'>
}) {
  const answer = useMutation(api.intake.batchAnswer)
  const [busy, setBusy] = useState(false)
  /* The row being answered stays as it was pressed until "saving…" ends. */
  const [pressed, setPressed] = useState<Transfer | null>(null)
  const say = (key: string, on = true) => {
    setPressed(transfers.find((t) => key.includes(`:${t.key}`)) ?? null)
    setBusy(true)
    /* "saving…" is always seen, however fast the answer is. */
    void Promise.all([
      answer({ batchId, answer: { kind: 'sum', key, on } }),
      new Promise((r) => setTimeout(r, 400)),
    ]).finally(() => setBusy(false))
  }
  if (transfers.length === 0) return null
  return (
    <div data-transfers className="flex flex-col gap-3">
      {transfers.map((now) => {
        const t = busy && pressed?.key === now.key ? pressed : now
        const chosen = t.sides.find((s) => s.id === t.chosen)
        if (t.state === 'sure' && chosen)
          return (
            <TransferLine
              key={t.key}
              t={t}
              side={chosen}
              accounts={accounts}
              file={file}
            />
          )
        if (t.state === 'same' && chosen)
          return (
            <Done
              key={t.key}
              busy={busy}
              onUndo={() => say(`same:${t.key}:${chosen.id}`, false)}
            >
              Same transfer — added once.
              {chosen.fee > 0 ? (
                <>
                  {' '}
                  Fee <Veiled>{euros(chosen.fee)}</Veiled> saved as spending.
                </>
              ) : null}
            </Done>
          )
        if (t.state === 'apart')
          return (
            <Done
              key={t.key}
              busy={busy}
              onUndo={() => say(`apart:${t.key}`, false)}
            >
              {t.sides.length > 1
                ? 'Not one of these.'
                : 'Not the same transfer.'}{' '}
              <Veiled>{euros(Math.abs(t.amount))}</Veiled> saved as money{' '}
              {t.amount > 0 ? 'in' : 'out'}.
            </Done>
          )
        return transferOpen(t) ? (
          <Question
            key={t.key}
            t={t}
            accounts={accounts}
            file={file}
            busy={busy}
            say={say}
          />
        ) : null
      })}
    </div>
  )
}

const named = (accounts: Accounts, id: Id<'accounts'>) =>
  accounts.find((a) => a._id === id)

function Logo({ accounts, id }: { accounts: Accounts; id: Id<'accounts'> }) {
  const a = named(accounts, id)
  return <AccountLogo name={a?.name ?? '?'} domain={a?.domain} size={24} />
}

/** One transfer, both banks, the amount, each day with its place. */
function TransferLine({
  t,
  side,
  accounts,
  file,
}: {
  t: Transfer
  side: Side
  accounts: Accounts
  file: string
}) {
  const leaves = t.amount < 0
  const other = side.here ? (side.otherAccountId ?? undefined) : side.accountId
  const from = leaves ? t.accountId : other
  const to = leaves ? other : t.accountId
  const name = (id: Id<'accounts'> | undefined) =>
    id ? (named(accounts, id)?.name ?? '') : ''
  return (
    <div
      data-transfer="sure"
      className="motion-land flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[12px] bg-lav-400/[0.06] px-3 py-[9px] ring-1 ring-lav-400/20 ring-inset"
    >
      <span className="flex items-center gap-1.5 text-lav-400">
        {from ? <Logo accounts={accounts} id={from} /> : null}
        <ArrowRight className="size-3.5" />
        {to ? <Logo accounts={accounts} id={to} /> : null}
      </span>
      <span className="flex min-w-[180px] flex-1 flex-col gap-0.5 text-[13px] max-sm:order-2 max-sm:basis-full">
        {from && to ? `${name(from)} → ${name(to)}` : t.merchant}
        <small className="font-mono text-[10.5px] text-ink-400">
          {side.stored
            ? `${DAY.format(side.occurredAt)} in the app · ${DAY.format(t.occurredAt)} in this ${file}`
            : `${DAY.format(side.occurredAt)} in ${name(side.accountId)} · ${DAY.format(t.occurredAt)} in ${name(t.accountId)}`}
        </small>
      </span>
      <span className="font-mono text-[13px] text-ink-200 max-sm:order-1 max-sm:ml-auto">
        <Veiled>{euros(Math.abs(side.here ? t.amount : side.amount))}</Veiled>
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-lav-400/12 px-2 py-[3px] font-mono text-[10px] tracking-[0.12em] whitespace-nowrap text-lav-300 uppercase max-sm:order-3">
        <Check className="size-3" strokeWidth={3} />
        {side.here ? 'already added' : 'one transfer'}
      </span>
    </div>
  )
}

function Question({
  t,
  accounts,
  file,
  busy,
  say,
}: {
  t: Transfer
  accounts: Accounts
  file: string
  busy: boolean
  say: (key: string) => void
}) {
  const [one] = t.sides
  const many = t.sides.length > 1
  const mine = (
    <Card
      accounts={accounts}
      accountId={t.accountId}
      at={t.occurredAt}
      text={t.merchant}
      amount={t.amount}
      tag={`new, in this ${file}`}
    />
  )
  const theirs = (s: Side, onPick?: () => void) => (
    <Card
      key={s.id}
      accounts={accounts}
      accountId={s.accountId}
      at={s.occurredAt}
      text={s.merchant}
      amount={s.amount}
      tag={s.stored ? 'already in the app' : 'new, in another file'}
      had
      onPick={onPick}
      disabled={busy}
    />
  )
  const sent = Math.abs(t.amount < 0 ? t.amount : one.amount)
  return (
    <div
      data-transfer="ask"
      className="motion-land flex flex-col gap-2.5 rounded-[14px] bg-state-warn/[0.06] p-3 ring-1 ring-state-warn/30 ring-inset"
    >
      <div className="flex items-start gap-2 text-[13.5px] leading-normal">
        <ArrowLeftRight className="mt-1 size-3.5 shrink-0 text-state-warn" />
        <div>
          <b className="font-medium">
            {many ? 'Which transfer is this?' : 'Is this the same transfer?'}
          </b>
          <small className="block text-[12px] text-ink-400">
            {many ? (
              `${t.sides.length} transfers that week.`
            ) : one.fee > 0 ? (
              <>
                <Veiled>{euros(one.fee)}</Veiled> less arrived,{' '}
                {daysApart(t.occurredAt, one.occurredAt)}.
              </>
            ) : (
              `Same amount, ${daysApart(t.occurredAt, one.occurredAt)}.`
            )}
          </small>
        </div>
      </div>
      {many ? (
        <div className="flex flex-col gap-2 sm:ml-[23px]">
          {mine}
          <div className="grid gap-2 sm:grid-cols-2">
            {t.sides.map((s) => theirs(s, () => say(`same:${t.key}:${s.id}`)))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid items-stretch gap-2 sm:ml-[23px] sm:grid-cols-[1fr_auto_1fr]">
            {t.amount > 0 ? theirs(one) : mine}
            <span className="flex items-center justify-center text-ink-500">
              <ArrowRight className="size-3.5 max-sm:rotate-90" />
            </span>
            {t.amount > 0 ? mine : theirs(one)}
          </div>
          {one.fee > 0 ? (
            <div className="grid grid-cols-3 overflow-hidden rounded-[12px] bg-sink/[0.22] ring-1 ring-lift/[0.06] ring-inset sm:ml-[23px]">
              <Sum label="sent" value={sent} />
              <Sum label="arrived" value={sent - one.fee} tone="in" />
              <Sum label="fee" value={one.fee} tone="fee" />
            </div>
          ) : null}
        </>
      )}
      <div className="relative sm:pl-[23px]">
        <div
          className={`flex flex-wrap items-center gap-1.5 ${busy ? 'invisible' : ''}`}
        >
          {many ? null : (
            <Opt loud onClick={() => say(`same:${t.key}:${one.id}`)}>
              <span className="pl-1.5">
                same transfer
                {one.fee > 0 ? (
                  <>
                    , <Veiled>{euros(one.fee)}</Veiled> fee
                  </>
                ) : null}
              </span>
            </Opt>
          )}
          <Opt onClick={() => say(`apart:${t.key}`)}>
            <span className="pl-1.5">
              {many ? 'not one of these' : 'not this one'}
            </span>
          </Opt>
        </div>
        {busy ? (
          <span className="absolute inset-0 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase sm:pl-[23px]">
            <Loader2 className="save-spinner size-3.5" />
            saving…
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Card({
  accounts,
  accountId,
  at,
  text,
  amount,
  tag,
  had = false,
  onPick,
  disabled,
}: {
  accounts: Accounts
  accountId: Id<'accounts'>
  at: number
  text: string
  amount: number
  tag: string
  had?: boolean
  onPick?: () => void
  disabled?: boolean
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-[13px]">
        <Logo accounts={accounts} id={accountId} />
        <span className="flex min-w-0 flex-col">
          {named(accounts, accountId)?.name}
          <small className="truncate font-mono text-[10.5px] text-ink-500">
            {DAY.format(at)} · {text}
          </small>
        </span>
      </span>
      <span className="font-mono text-[16px] text-foreground">
        <Veiled>{signed(amount)}</Veiled>
      </span>
      <span
        className={`self-start rounded-full px-2 py-[3px] font-mono text-[10px] tracking-[0.12em] whitespace-nowrap uppercase ${
          had
            ? 'bg-lav-400/12 text-lav-300'
            : 'bg-state-good/12 text-state-good'
        }`}
      >
        {tag}
      </span>
      {onPick ? (
        <span className="self-start rounded-full bg-lav-400/15 px-3 py-1 text-[12.5px] ring-1 ring-lav-400/45 ring-inset">
          same transfer
        </span>
      ) : null}
    </>
  )
  const look = `flex min-w-0 flex-col gap-2 rounded-[12px] px-3 py-[11px] text-left ${
    had ? 'ring-1 ring-lav-400/22 ring-inset' : 'bg-sink/[0.22]'
  }`
  return onPick ? (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className={`motion-press ${look} transition-shadow hover:ring-lav-400/60 disabled:opacity-50`}
    >
      {body}
    </button>
  ) : (
    <div className={look}>{body}</div>
  )
}

function Sum({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'in' | 'fee'
}) {
  return (
    <div className="flex min-w-0 flex-col gap-[3px] border-lift/[0.06] px-3 py-[9px] not-first:border-l max-sm:px-2.5">
      <span className="font-mono text-[9.5px] tracking-[0.14em] text-ink-500 uppercase">
        {label}
      </span>
      <b
        className={`text-[16px] font-light max-sm:text-[15px] ${
          tone === 'in'
            ? 'text-state-good'
            : tone === 'fee'
              ? 'text-state-warn'
              : 'text-ink-200'
        }`}
      >
        <Veiled>{euros(value)}</Veiled>
      </b>
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
    <div
      data-transfer="answered"
      className="motion-land flex items-center gap-2.5 rounded-[14px] bg-state-good/[0.06] px-3 py-2.5 text-[13px] text-ink-200 ring-1 ring-state-good/30 ring-inset"
    >
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
