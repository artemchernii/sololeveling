import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ChevronRight, Pencil, Trash2, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Busy } from '@/components/finances/bits'
import { Veiled } from '@/components/finances/Veil'
import { failureMessage } from '@/lib/convex-errors'
import { afterWords } from '@/lib/undoFile'
import { Cell } from './AccountFileBack'
import type { Taken } from './AccountFileBack'
import { fmt, short } from './AccountSheetRows'

/* Remove a balance typed by hand (11 Oct, mockup design/treasury-mockup/
   typed-balance.html): its "typed by you" line opens in place and says
   what the account is afterwards before the press — the strip of "take
   this file back" — then answers at once. Nothing to type. */

export function TypedBalance({
  snapshotId,
  onRemoved,
}: {
  snapshotId: Id<'stateSnapshots'>
  onRemoved: (t: Taken) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  /* Asked only once it is opened: a closed line reads nothing. */
  const p = useQuery(api.typedBalance.preview, open ? { snapshotId } : 'skip')
  const remove = useMutation(api.typedBalance.remove)
  const money = (v: number) => fmt(v, p?.currency)
  const same = p != null && p.after === p.now

  const press = () => {
    if (p == null) return
    setBusy(true)
    setFailed(null)
    const words = afterWords({
      account: p.account,
      now: money(p.now),
      after: p.after === null ? null : money(p.after),
    })
    /* "removing…" is shown before the write, not beside it: the balance
       leaves the sheet the moment the write lands, and a press that
       answers with nothing to read is no answer (every press answers). */
    new Promise((shown) => setTimeout(shown, 400))
      .then(() => remove({ snapshotId }))
      .then(() => onRemoved({ title: 'Removed.', words }))
      .catch((e: unknown) => {
        setBusy(false)
        setFailed(failureMessage(e))
      })
  }

  return (
    <div
      data-testid="typed-balance"
      className={`flex flex-col transition-opacity duration-500 ${busy ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        disabled={busy}
        className="motion-press flex items-center gap-2.5 rounded-[10px] bg-sink/30 px-2.5 py-2 text-left font-mono text-[10.5px] text-ink-400 hover:bg-sink/50"
      >
        <Pencil className="size-3.5 text-ink-300" />
        <span className="flex-1">typed</span>
        <span className="flex items-center gap-1 text-[10px] tracking-[0.12em] text-lav-300 uppercase">
          {open ? 'close' : 'remove'}
          <ChevronRight
            className={`size-2.5 transition-transform duration-300 ${open ? 'rotate-90' : ''}`}
          />
        </span>
      </button>
      {/* The box glides open once what it says is known. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open && p != null ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="flex flex-col gap-2.5 overflow-hidden">
          {p != null ? (
            <>
              <div className="flex flex-col gap-0.5 pt-2.5 text-[13.5px] leading-relaxed text-ink-200">
                <span>
                  The{' '}
                  <b className="font-medium text-foreground">
                    balance of {short(p.of)}
                  </b>{' '}
                  you typed goes.
                </span>
                {p.after === null ? (
                  <span className="text-[12.5px] text-ink-400">
                    It is the only balance {p.account} has. Its rows stay.
                  </span>
                ) : same && p.newer ? (
                  <span className="text-[12.5px] text-ink-400">
                    {p.account} stays <Veiled>{money(p.now)}</Veiled> — the
                    balance of {short(p.nowOf)} set that.
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 overflow-hidden rounded-[12px] bg-sink/25 ring-1 ring-lift/[0.06] ring-inset">
                <Cell
                  label={`${p.account} now`}
                  value={money(p.now)}
                  under={short(p.nowOf)}
                />
                <Cell
                  after
                  label="after"
                  value={p.after === null ? '—' : money(p.after)}
                  under={
                    p.after === null
                      ? 'no balance left'
                      : same
                        ? 'not changed'
                        : p.afterOf === null
                          ? ''
                          : `balance of ${short(p.afterOf)}`
                  }
                />
              </div>
              <div className="flex min-h-[34px] flex-wrap items-center gap-x-2.5 gap-y-1.5 pb-0.5">
                <button
                  type="button"
                  onClick={press}
                  disabled={busy}
                  className="motion-press inline-flex h-[34px] items-center gap-2 rounded-full bg-state-danger/10 px-4 text-[13px] text-foreground ring-1 ring-state-danger/45 transition-colors ring-inset hover:bg-state-danger/18 disabled:text-ink-300"
                >
                  <Busy on={busy} doing="removing…">
                    <Trash2 className="size-3.5 text-state-danger" />
                    remove this balance
                  </Busy>
                </button>
                {failed !== null ? (
                  <span
                    role="alert"
                    className="motion-land flex items-center gap-1.5 text-[12.5px] text-state-danger"
                  >
                    <X className="size-3.5" />
                    Not removed — nothing changed. {failed}
                  </span>
                ) : (
                  <span className="text-[12px] text-ink-500">
                    Type it again any time.
                  </span>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
