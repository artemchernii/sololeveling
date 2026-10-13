import {
  CloudOff,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  RotateCw,
  Sigma,
} from 'lucide-react'
import type { MouseEvent } from 'react'

import { PILL_QUIET } from '@/components/finances/bits'
import { bankWhen } from '@/lib/bankLink'

const WARN =
  'motion-press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-state-warn/12 px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-state-warn uppercase ring-1 ring-state-warn/50 ring-inset'
const DAY = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' })

/** What the card needs to know of a bank link (bank.links). */
export type CardLink = {
  validUntil: number | null
  checkedAt: number | null
  /** The bank is being asked right now. */
  checking: boolean
  /** Rows that did not add up wait for an answer. */
  question: boolean
  /** Read from Trading 212 itself: no approval to end. */
  via: 't212' | null
  /** Its last check wrote nothing: the key, or no answer. */
  failed: 'refused' | 'down' | null
}

/* The card's last line: where the balance came from, and the one thing to
   do about it (11 Oct, bank-connected.html). One source for each number:
   a card the bank reports in full has no UPDATE; one that also holds
   investments keeps it for the broker's screenshot. An approval that ended
   keeps the last balance, says of when, and offers APPROVE. */
export function AccountFoot({
  label,
  stale,
  todo,
  link,
  connectable,
  broker,
  onUpdate,
  onConnect,
  onCheck,
  onRetry,
}: {
  /** freshness() of the account's pockets. */
  label: string
  stale: boolean
  todo: string | null
  /** The account's link when it is connected, else null. */
  link: CardLink | null
  /** A bank the app can reach, not connected yet. */
  connectable: boolean
  /** It holds investments too: those still come from a file. */
  broker: boolean
  onUpdate: () => void
  onConnect: () => void
  /** CHECK IT: the question the bank's rows left. */
  onCheck: () => void
  /** TRY AGAIN: ask Trading 212 once more. */
  onRetry: () => void
}) {
  const now = Date.now()
  const press = (run: () => void) => (e: MouseEvent) => {
    e.stopPropagation()
    run()
  }
  const update = (
    <button
      type="button"
      onClick={press(onUpdate)}
      className={stale ? WARN : PILL_QUIET}
    >
      update
    </button>
  )
  const t212 = link?.via === 't212'
  const who = t212 ? 'Trading 212' : 'the bank'
  const ended = link !== null && !t212 && (link.validUntil ?? 0) <= now
  const failed = link?.checking ? null : (link?.failed ?? null)
  return (
    <div className="mt-auto flex min-h-[41px] flex-wrap items-center justify-between gap-2 border-t border-lift/[0.08] pt-3">
      {link === null ? (
        <span
          title={todo ?? undefined}
          className={`min-w-[150px] flex-1 font-mono text-[11px] ${stale ? 'text-state-warn' : 'text-ink-400'}`}
        >
          {label}
        </span>
      ) : ended ? (
        <span className="motion-fade flex min-w-0 flex-col font-mono text-[11px] leading-[14px]">
          <span className="flex items-center gap-[7px] text-state-warn">
            <KeyRound className="size-3.5 shrink-0" />
            approval ended {DAY.format(link.validUntil ?? now)}
          </span>
          {link.checkedAt === null ? null : (
            <span className="pl-[21px] text-ink-500">
              balance of{' '}
              {bankWhen(link.checkedAt, now).replace('today ', 'today, ')}
            </span>
          )}
        </span>
      ) : failed ? (
        <span className="motion-fade flex min-w-0 flex-col font-mono text-[11px] leading-[14px]">
          <span className="flex items-center gap-[7px] text-state-warn">
            {failed === 'refused' ? (
              <KeyRound className="size-3.5 shrink-0" />
            ) : (
              <CloudOff className="size-3.5 shrink-0" />
            )}
            {failed === 'refused'
              ? `${who} rejected the key`
              : `${who} did not answer`}
          </span>
          {link.checkedAt === null ? null : (
            <span className="pl-[21px] text-ink-500">
              cash and positions of{' '}
              {bankWhen(link.checkedAt, now).replace('today ', 'today, ')}
            </span>
          )}
        </span>
      ) : link.question ? (
        <span className="motion-fade flex min-w-0 flex-col font-mono text-[11px] leading-[14px]">
          <span className="flex items-center gap-[7px] text-state-warn">
            <Sigma className="size-3.5 shrink-0" />
            not saved — 1 question open
          </span>
          {link.checkedAt === null ? null : (
            <span className="pl-[21px] text-ink-500">
              asked {bankWhen(link.checkedAt, now).replace('today ', 'today, ')}
            </span>
          )}
        </span>
      ) : link.checking ? (
        <span className="motion-fade flex min-w-0 items-center gap-[7px] font-mono text-[11px] text-lav-300">
          <Loader2 className="save-spinner size-3.5 shrink-0" />
          checking {who}…
          {link.checkedAt === null ? null : (
            <span className="text-ink-500">
              · last {bankWhen(link.checkedAt, now).replace('today ', '')}
            </span>
          )}
        </span>
      ) : (
        <span className="motion-fade flex min-w-0 items-center gap-[7px] font-mono text-[11px] text-ink-400">
          <Link2 className="motion-pulse size-3.5 shrink-0 text-state-good" />
          from {who}
          {link.checkedAt === null ? '' : ` · ${bankWhen(link.checkedAt, now)}`}
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {link === null ? (
          <>
            {connectable ? (
              <button
                type="button"
                onClick={press(onConnect)}
                className={PILL_QUIET}
              >
                <Link2 className="size-3" />
                connect
              </button>
            ) : null}
            {update}
          </>
        ) : ended ? (
          <button type="button" onClick={press(onConnect)} className={WARN}>
            <ExternalLink className="size-3" />
            approve
          </button>
        ) : failed ? (
          <button type="button" onClick={press(onRetry)} className={WARN}>
            <RotateCw className="size-3" />
            try again
          </button>
        ) : link.question ? (
          <button type="button" onClick={press(onCheck)} className={WARN}>
            {' '}
            open question
          </button>
        ) : broker && !t212 ? (
          /* Trading 212 reports cash and positions itself: nothing to
             update by hand (12 Oct, "we connected and should we see
             update? Seems weird"). Its history file goes through + ADD. */
          update
        ) : null}
      </span>
    </div>
  )
}
