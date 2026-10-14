import { BuysAway } from '@/components/finances/BuysAway'
import { BuysSaved, useBuysLanded } from '@/components/finances/BuysCheck'
import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { AlertTriangle, Check, Loader2, Play } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { AccountsLanded } from '@/components/finances/Landed'
import { UndoSave, Undone } from '@/components/finances/LandedUndo'
import { AccountLogo } from '@/components/finances/Logo'
import type { BatchView } from '@/components/finances/BulkParts'
import { useDayStarts } from '@/components/track/useDayStarts'
import { addedWords } from '@/lib/addedWords'
import { failureMessage } from '@/lib/convex-errors'

/* Saving, a save that stopped, and what landed (10 Oct; the mockup is
   design/treasury-mockup/update.html). Artem: "Saving needs better UI
   and logo of banks" and "important info always need some attraction
   like icon, color or animation". A row per bank: lit while it is
   written, green and ticked once in, amber when the save stopped on it. */

/* A save moves every step. This long with no step and it has stopped:
   say so, rather than turn for ever. */
const STALL_MS = 10_000

type RowState = 'saved' | 'now' | 'stopped' | 'wait'

export function Applying({
  view,
  batchId,
  onClose,
}: {
  view: BatchView
  batchId: Id<'batches'>
  onClose: () => void
}) {
  const done = view.applied?.intakes ?? 0
  const rows = view.applied?.rows ?? 0
  const total = view.files.filter((f) => f.status !== 'failed').length
  const [stalled, setStalled] = useState(false)
  const [nudge, setNudge] = useState(0)
  useEffect(() => {
    setStalled(false)
    const t = setTimeout(() => setStalled(true), STALL_MS)
    return () => clearTimeout(t)
  }, [done, rows, nudge])
  return (
    <div className="flex flex-col gap-4">
      {stalled ? (
        <div className="flex flex-col items-center gap-3 pt-1 text-center">
          <span className="motion-pop grid size-14 place-items-center rounded-full bg-state-warn/12 text-state-warn ring-1 ring-state-warn/40">
            <AlertTriangle className="size-6" />
          </span>
          <span className="text-[22px] font-light">Saving stopped</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Loader2 className="size-5 animate-spin text-lav-300" />
            <span className="text-[34px] leading-none font-light tracking-tight">
              saving…
            </span>
            <span className="text-[13px] text-ink-400">
              {done} of {total} files
            </span>
          </div>
          <div className="relative h-1 overflow-hidden rounded-full bg-lift/[0.07]">
            <i
              className="block h-full rounded-full bg-gradient-to-r from-lav-400 to-lav-300 shadow-[0_0_12px_var(--color-lav-400)] transition-[width] duration-500"
              style={{ width: `${(done / Math.max(1, total)) * 100}%` }}
            />
            <i
              style={{ animation: 'sweep 1.6s linear infinite' }}
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-lav-300/60 to-transparent"
            />
          </div>
        </div>
      )}
      <BankRows view={view} stopped={stalled} />
      {stalled ? (
        <Resume
          batchId={batchId}
          onClose={onClose}
          onResumed={() => setNudge((n) => n + 1)}
        />
      ) : (
        <p className="border-t border-lav-400/10 pt-3 text-[12.5px] text-ink-400">
          Closing does not stop it. The save finishes either way.
        </p>
      )}
    </div>
  )
}

/* One row a bank. Its files are written oldest first, so the first bank
   with a file still waiting is the one being written. */
function BankRows({ view, stopped }: { view: BatchView; stopped: boolean }) {
  const accounts = useQuery(api.accounts.list, {})
  const groups: Array<{
    accountId: Id<'accounts'>
    files: BatchView['files']
  }> = []
  for (const f of view.files) {
    if (f.accountId === null || f.status === 'failed') continue
    const g = groups.find((x) => x.accountId === f.accountId)
    if (g) g.files.push(f)
    else groups.push({ accountId: f.accountId, files: [f] })
  }
  const current = groups.find((g) => g.files.some((f) => f.status !== 'done'))
  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((g) => {
        const a = accounts?.find((x) => x._id === g.accountId)
        const saved = g.files.every((f) => f.status === 'done')
        const state: RowState = saved
          ? 'saved'
          : g === current
            ? stopped
              ? 'stopped'
              : 'now'
            : 'wait'
        const inRows =
          view.applied?.byAccount?.find((x) => x.accountId === g.accountId)
            ?.rows ?? 0
        const filesDone = g.files.filter((f) => f.status === 'done').length
        return (
          <BankRow
            key={g.accountId}
            name={a?.name ?? ''}
            domain={a?.domain ?? null}
            state={state}
            what={`${g.files.length} ${g.files.length === 1 ? 'file' : 'files'}${inRows > 0 ? ` · ${inRows} rows in` : ''}`}
            share={saved ? 1 : filesDone / g.files.length}
          />
        )
      })}
    </div>
  )
}

const ROW: Record<RowState, string> = {
  saved: 'bg-state-good/[0.06] ring-state-good/30',
  now: 'bg-lift/[0.035] ring-lav-400/45 shadow-[0_0_26px_-12px_var(--color-lav-400)]',
  stopped: 'bg-state-warn/[0.06] ring-state-warn/40',
  wait: 'bg-lift/[0.035] ring-lift/[0.07] opacity-50',
}

function BankRow({
  name,
  domain,
  state,
  what,
  share,
}: {
  name: string
  domain: string | null
  state: RowState
  what: string
  share: number
}) {
  return (
    <div
      data-testid="bank-row"
      className={`grid min-h-[66px] grid-cols-[38px_1fr_auto] items-center gap-3 rounded-[16px] px-3.5 py-3 ring-1 transition-[background-color,box-shadow,opacity] duration-300 ring-inset ${ROW[state]}`}
    >
      <span data-testid="bank-logo">
        <AccountLogo name={name} domain={domain} size={38} />
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <b className="truncate text-[15px] font-medium">{name}</b>
        <span className="text-[12px] text-ink-400">{what}</span>
        <span className="relative h-[3px] overflow-hidden rounded-full bg-lift/[0.07]">
          <i
            className={`block h-full rounded-full transition-[width] duration-500 ${
              state === 'saved'
                ? 'bg-state-good'
                : state === 'stopped'
                  ? 'bg-state-warn'
                  : 'bg-lav-400'
            }`}
            style={{ width: `${share * 100}%` }}
          />
          {state === 'now' ? (
            <i
              style={{ animation: 'sweep 1.6s linear infinite' }}
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-lav-300/70 to-transparent"
            />
          ) : null}
        </span>
      </span>
      <span
        className={`inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.1em] whitespace-nowrap uppercase ${
          state === 'saved'
            ? 'text-state-good'
            : state === 'now'
              ? 'text-lav-300'
              : state === 'stopped'
                ? 'text-state-warn'
                : 'text-ink-500'
        }`}
      >
        {state === 'saved' ? (
          <>
            <Check className="motion-pop size-3.5" />
            saved
          </>
        ) : state === 'now' ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            saving
          </>
        ) : state === 'stopped' ? (
          <>
            <AlertTriangle className="size-3.5" />
            not finished
          </>
        ) : (
          'not saved yet'
        )}
      </span>
    </div>
  )
}

/* Finishing writes only what is missing — a step takes the next file
   still waiting. */
function Resume({
  batchId,
  onClose,
  onResumed,
}: {
  batchId: Id<'batches'>
  onClose: () => void
  onResumed: () => void
}) {
  const resume = useMutation(api.intake.resumeApply)
  const dayStart = useDayStarts(1).at(-1) as number
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-lav-400/12 pt-3.5">
      <span className="min-w-[200px] flex-1 text-[12.5px] text-ink-400">
        {error ? (
          <span className="text-state-danger">{error}</span>
        ) : (
          'Nothing is saved twice. Finish saves the rest.'
        )}
      </span>
      <button type="button" onClick={onClose} className={PILL_QUIET}>
        later
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError(null)
          resume({ batchId, dayStart })
            .then(onResumed)
            .catch((e: unknown) =>
              setError(failureMessage(e) ?? 'Not started — try again.'),
            )
            .finally(() => setBusy(false))
        }}
        className={`${PILL_LOUD} justify-center gap-2 px-6 py-2.5 disabled:opacity-70`}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Play className="size-3.5" />
        )}
        finish saving
      </button>
    </div>
  )
}

export function Applied({
  view,
  batchId,
  onClose,
  onMore,
}: {
  view: BatchView
  batchId: Id<'batches'>
  onClose: () => void
  onMore: () => void
}) {
  const [undone, setUndone] = useState(false)
  const landed = useBuysLanded(batchId)
  const waiting = view.files.filter((f) => f.status !== 'done').length
  /* One line an account (5 Oct), the same screen a single file lands
     on. A batch applied before per-account counts were kept falls back
     to its files' rows. */
  const filesOf = (accountId: Id<'accounts'>) =>
    view.files.flatMap((f) =>
      f.accountId === accountId && f.status === 'done' ? [f.intakeId] : [],
    )
  const accounts =
    view.applied?.byAccount?.map((x) => ({
      accountId: x.accountId,
      added: x.rows,
      what: addedWords(x),
      files: filesOf(x.accountId),
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
  if (undone) return <Undone onClose={onClose} />
  /* Opened for one thing (ADD BUYS): the save is said of that thing,
     not of the whole account. */
  const done = (
    <button
      type="button"
      onClick={onClose}
      className={`${PILL_LOUD} justify-center px-8 py-2.5`}
    >
      done
    </button>
  )
  if (landed) {
    const where = landed.where
    /* Counted from where the trades sit; nothing said before that. */
    if (where === undefined) return <div className="min-h-[220px]" />
    const name = landed.thing.name
    const warn = where.away.length > 0
    const count = where.here
    /* What this thing had before this save: saved now, less what it added. */
    const before = Math.max(0, landed.thing.saved.length - count)
    return (
      <div className="flex flex-col items-center gap-4 py-5">
        {warn ? (
          <span className="motion-pop grid size-14 place-items-center rounded-full bg-state-warn/16 text-state-warn shadow-[0_0_36px_-6px_var(--color-state-warn)] ring-1 ring-state-warn/45">
            <AlertTriangle className="motion-pulse size-7" strokeWidth={2.5} />
          </span>
        ) : (
          <span className="motion-pop grid size-14 place-items-center rounded-full bg-state-good/16 text-state-good shadow-[0_0_36px_-6px_var(--color-state-good)] ring-1 ring-state-good/45">
            <Check className="size-7" strokeWidth={2.5} />
          </span>
        )}
        {warn ? (
          <span className="motion-land text-center text-[24px] font-light text-foreground">
            {count > 0
              ? `${count} of ${where.all} buys on ${name}`
              : `Not saved on ${name}`}
          </span>
        ) : (
          /* His words (14 Oct): "0 NEW · 9 SAVED BEFORE" — counts as
             badges, the thing's name on the card below. */
          <span
            data-testid="buys-counts"
            className="motion-land flex flex-wrap justify-center gap-2 font-mono text-[13px] tracking-[0.14em] uppercase"
          >
            <span
              className={`rounded-full px-3.5 py-1.5 ${count > 0 ? 'bg-state-good/14 text-state-good' : 'bg-lift/[0.06] text-ink-300'}`}
            >
              {count} new
            </span>
            {before > 0 ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 ${count > 0 ? 'bg-lift/[0.06] text-ink-300' : 'bg-state-good/14 text-state-good'}`}
              >
                {count > 0 ? null : <Check className="size-3.5" />}
                {before} saved before
              </span>
            ) : null}
          </span>
        )}
        {warn ? (
          <div className="w-full max-w-xl">
            <BuysAway
              away={where.away}
              batchId={batchId}
              onRemoved={() => setUndone(true)}
            />
          </div>
        ) : null}
        <BuysSaved thing={landed.thing} check={landed.check} warn={warn} />
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {warn || count === 0 ? null : (
            <UndoSave batchId={batchId} onUndone={() => setUndone(true)} />
          )}
          {done}
        </div>
      </div>
    )
  }
  return (
    <AccountsLanded accounts={accounts}>
      <UndoSave batchId={batchId} onUndone={() => setUndone(true)} />
      {waiting > 0 ? (
        <button type="button" onClick={onMore} className={PILL_QUIET}>
          {waiting} {waiting === 1 ? 'file' : 'files'} not saved yet
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
