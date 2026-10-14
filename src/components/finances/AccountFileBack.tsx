import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, TriangleAlert, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Busy, PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { failureMessage } from '@/lib/convex-errors'
import { afterWords } from '@/lib/undoFile'
import { fmt, short } from './AccountSheetRows'

/* Take this file back (11 Oct, mockup design/treasury-mockup/undo-
   file.html): one box in the opened file. It says what goes and what the
   account's cash is afterwards before the press — nothing to tick or
   type — then answers at once, and the sheet returns to the account. */

/** What the account says once a file is taken back. */
export type Taken = { words: string; title?: string }

export function TakeBack({
  intakeId,
  what,
  onTaken,
}: {
  intakeId: Id<'intakes'>
  /** What it is, on its button: "screenshot", "statement". */
  what: 'screenshot' | 'screenshots' | 'statement'
  onTaken: (t: Taken) => void
}) {
  const p = useQuery(api.undoFile.preview, { intakeId })
  const takeBack = useMutation(api.undoFile.takeBack)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  /* Opening a file is history, not an alarm (14 Oct: "every update
     will have this huge warning … small button to remove and only
     after you click you see these warnings"). */
  const [asking, setAsking] = useState(false)
  if (p === undefined || p === null) return null
  if (!asking)
    return (
      <button
        type="button"
        data-testid="take-back-open"
        onClick={() => setAsking(true)}
        className="motion-press inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-state-danger uppercase ring-1 ring-state-danger/40 ring-inset hover:bg-state-danger/10"
      >
        <X className="size-3.5" />
        remove {what}
      </button>
    )

  const cash = p.cash
  const g = {
    rows: p.rows,
    trades: p.trades,
    positions: p.positions,
    balanceDay: p.balanceOf === null ? null : short(p.balanceOf),
    cash: p.positions > 0 && p.balanceOf !== null,
  }
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

  /* What goes, as badges (14 Oct: "take this file back.... remove
     screenshot or remove statement with warning icon"). */
  const n = (count: number, one: string, many: string) =>
    `−${count} ${count === 1 ? one : many}`
  const badges = [
    ...(p.rows > 0 ? [n(p.rows, 'row', 'rows')] : []),
    ...(p.trades > p.sells ? [`−${p.trades - p.sells} buy`] : []),
    ...(p.sells > 0 ? [`−${p.sells} sell`] : []),
    ...(p.positions > 0 ? [n(p.positions, 'position', 'positions')] : []),
    ...(g.balanceDay !== null ? [`balance · ${g.balanceDay}`] : []),
  ]

  return (
    <div
      data-testid="take-back"
      className="motion-arrive flex flex-col gap-3 rounded-[14px] bg-state-warn/[0.05] px-3.5 py-3 ring-1 ring-state-warn/30 ring-inset"
    >
      <span className="flex items-center gap-2">
        <TriangleAlert className="motion-pulse size-4 shrink-0 text-state-warn" />
        <span className="label-caps text-state-warn">
          remove · these numbers go
        </span>
      </span>
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
                  ? cash.newer
                    ? 'kept · a newer file'
                    : 'not changed'
                  : cash.afterOf === null
                    ? ''
                    : `balance of ${short(cash.afterOf)}`
            }
          />
        </div>
      ) : null}

      {/* What goes, then the press, on one line (14 Oct: badges and the
          button sat stacked and ragged) — as the strip's file panel. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {badges.length === 0 ? (
          <span className="font-mono text-[11px] text-ink-400">
            nothing left from it
          </span>
        ) : (
          badges.map((b) => (
            <span
              key={b}
              className="rounded-full bg-state-danger/14 px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-state-danger uppercase"
            >
              {b}
            </span>
          ))
        )}
        {p.elsewhereRows > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-state-danger/14 py-0.5 pr-2.5 pl-1 font-mono text-[10px] tracking-[0.12em] text-state-danger uppercase">
            {there ? (
              <AccountLogo
                name={there.account}
                domain={there.domain}
                size={16}
              />
            ) : null}
            −{p.elsewhereRows} in {there?.account ?? 'other accounts'}
          </span>
        ) : null}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setAsking(false)}
          disabled={busy}
          className={PILL_QUIET}
        >
          keep
        </button>
        <button
          type="button"
          onClick={press}
          disabled={busy}
          className="motion-press inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-state-danger/15 px-3 font-mono text-[10.5px] tracking-[0.12em] text-foreground uppercase ring-1 ring-state-danger/45 transition-colors ring-inset hover:bg-state-danger/25 disabled:text-ink-300"
        >
          <Busy on={busy} doing="removing…">
            <X className="size-3.5 text-state-danger" />
            remove {what}
          </Busy>
        </button>
      </div>
      {failed !== null ? (
        <span
          role="alert"
          className="motion-land flex items-center gap-1.5 text-[12.5px] text-state-danger"
        >
          <X className="size-3.5" />
          Not removed. {failed}
        </span>
      ) : null}
    </div>
  )
}

export function Cell({
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
        <span>{taken.title ?? 'Removed.'}</span>
        <span className="text-[12px] text-ink-400">{taken.words}</span>
      </span>
    </div>
  )
}
