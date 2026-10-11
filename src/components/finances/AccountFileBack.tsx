import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, Undo2, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Busy } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { failureMessage } from '@/lib/convex-errors'
import { afterWords, goesParts, goesVerb } from '@/lib/undoFile'
import { fmt, short } from './AccountSheetRows'

/* Take this file back (11 Oct, mockup design/treasury-mockup/undo-
   file.html): one box in the opened file. It says what goes and what the
   account's cash is afterwards before the press — nothing to tick or
   type — then answers at once, and the sheet returns to the account. */

/** What the account says once a file is taken back. */
export type Taken = { words: string }

export function TakeBack({
  intakeId,
  onTaken,
}: {
  intakeId: Id<'intakes'>
  onTaken: (t: Taken) => void
}) {
  const p = useQuery(api.undoFile.preview, { intakeId })
  const takeBack = useMutation(api.undoFile.takeBack)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  if (p === undefined || p === null) return null

  const cash = p.cash
  const g = {
    rows: p.rows,
    trades: p.trades,
    positions: p.positions,
    balanceDay: p.balanceOf === null ? null : short(p.balanceOf),
    cash: p.positions > 0 && p.balanceOf !== null,
  }
  const parts = goesParts(g)
  const name = p.account ?? 'The account'
  const money = (v: number) => fmt(v, cash?.currency)
  const same = cash !== null && cash.after === cash.now
  const there = p.elsewhere.at(0)

  const press = () => {
    setBusy(true)
    setFailed(null)
    takeBack({ intakeId })
      .then(() =>
        onTaken({
          words: afterWords({
            account: name,
            now: cash === null ? null : money(cash.now),
            after:
              cash === null || cash.after === null ? null : money(cash.after),
          }),
        }),
      )
      .catch((e: unknown) => {
        setBusy(false)
        setFailed(failureMessage(e))
      })
  }

  return (
    <div
      data-testid="take-back"
      className="motion-arrive flex flex-col gap-3 rounded-[14px] bg-lift/[0.035] px-3.5 py-3 ring-1 ring-lift/10 ring-inset"
    >
      <div className="flex flex-col gap-0.5 text-[13.5px] leading-relaxed text-ink-200">
        <span>
          {parts.length === 0 ? (
            'This file added nothing that is still here.'
          ) : (
            <>
              {parts.map((part, i) => (
                <span key={part}>
                  {i === 0 ? '' : i === parts.length - 1 ? ' and ' : ', '}
                  <b className="font-medium text-foreground">{part}</b>
                </span>
              ))}{' '}
              {goesVerb(g)}.
            </>
          )}
        </span>
        {p.elsewhereRows === 1 && there ? (
          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-400">
            <AccountLogo name={there.account} domain={there.domain} size={16} />
            <span>
              The <Veiled>{fmt(there.amount, there.currency)}</Veiled> it added
              in {there.account} on {short(there.at)} goes too.
            </span>
          </span>
        ) : p.elsewhereRows > 1 ? (
          <span className="text-[12.5px] text-ink-400">
            {p.elsewhereRows} rows it added in other accounts go too.
          </span>
        ) : null}
        {same && cash.newer ? (
          <span className="text-[12.5px] text-ink-400">
            {name} stays <Veiled>{money(cash.now)}</Veiled> — a newer file set
            that.
          </span>
        ) : null}
        {p.trades > 0 ? (
          <span className="text-[12.5px] text-ink-400">
            Shares stay as the last screen showed them. What was paid for them
            is no longer known.
          </span>
        ) : null}
      </div>

      {cash !== null ? (
        <div className="grid grid-cols-2 overflow-hidden rounded-[12px] bg-sink/25 ring-1 ring-lift/[0.06] ring-inset">
          <Cell
            label={`${name}${g.cash ? ' cash' : ''} now`}
            value={money(cash.now)}
            under={g.balanceDay ?? ''}
          />
          <Cell
            after
            label="after"
            value={cash.after === null ? '—' : money(cash.after)}
            under={
              cash.after === null
                ? 'no balance left'
                : same
                  ? 'not changed'
                  : cash.afterOf === null
                    ? ''
                    : `balance of ${short(cash.afterOf)}`
            }
          />
        </div>
      ) : null}

      <div className="flex min-h-[34px] flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <button
          type="button"
          onClick={press}
          disabled={busy}
          className="motion-press inline-flex h-[34px] items-center gap-2 rounded-full bg-state-danger/10 px-4 text-[13px] text-foreground ring-1 ring-state-danger/45 transition-colors ring-inset hover:bg-state-danger/18 disabled:text-ink-300"
        >
          <Busy on={busy} doing="taking it back…">
            <Undo2 className="size-3.5 text-state-danger" />
            take this file back
          </Busy>
        </button>
        {failed !== null ? (
          <span
            role="alert"
            className="motion-land flex items-center gap-1.5 text-[12.5px] text-state-danger"
          >
            <X className="size-3.5" />
            Not taken back — nothing changed. {failed}
          </span>
        ) : (
          <span className="text-[12px] text-ink-500">
            Drop it again any time to add it back.
          </span>
        )}
      </div>
    </div>
  )
}

function Cell({
  label,
  value,
  under,
  after = false,
}: {
  label: string
  value: string
  under: string
  after?: boolean
}) {
  return (
    <span
      className={`flex min-w-0 flex-col gap-0.5 px-3 py-2.5 ${after ? 'border-l border-lift/[0.06] bg-lav-400/[0.07]' : ''}`}
    >
      <span className="truncate font-mono text-[9.5px] tracking-[0.14em] text-ink-500 uppercase">
        {label}
      </span>
      <span
        className={`text-[16px] ${after ? 'text-foreground' : 'font-light text-ink-300'}`}
      >
        <Veiled>{value}</Veiled>
      </span>
      <span className="min-h-[14px] font-mono text-[9.5px] text-ink-500">
        {under}
      </span>
    </span>
  )
}

/* The account, right after: a tick and what it holds now. */
export function TakenStrip({ taken }: { taken: Taken }) {
  return (
    <div
      role="status"
      className="motion-arrive flex items-center gap-2.5 rounded-[14px] bg-state-good/[0.06] px-3.5 py-2.5 text-[13px] text-ink-200 ring-1 ring-state-good/30 ring-inset"
    >
      <Check className="motion-pop size-3.5 text-state-good" strokeWidth={3} />
      <span className="flex flex-col">
        <span>Taken back.</span>
        <span className="text-[12px] text-ink-400">{taken.words}</span>
      </span>
    </div>
  )
}
