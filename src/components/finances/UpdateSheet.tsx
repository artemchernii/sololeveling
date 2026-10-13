import { useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Link2, Loader2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { FIELD, PILL_LOUD } from '@/components/finances/bits'
import { AddDrop } from '@/components/finances/AddDrop'
import { BulkUpdate, GUARD } from '@/components/finances/Bulk'
import type { Flight } from '@/components/finances/Bulk'
import { StepStrip } from '@/components/finances/StepStrip'
import { Sheet } from '@/components/finances/Sheet'
import { useDayStarts } from '@/components/track/useDayStarts'
import { bankWhen } from '@/lib/bankLink'
import { agoLabel } from '@/lib/format'
import { money } from '@/lib/currency'
import { STALE_MS } from '@/lib/freshness'
import { failureMessage } from '@/lib/convex-errors'
import { SavedNote } from '@/components/finances/AccountParts'

/* UPDATE on one account (11 Oct; docs/specs/2026-10-10-one-update.md,
   piece 3b; design/treasury-mockup/update-account.html). The window ADD
   opens, named for the account: its drop area on top, what is in it now
   under it — no tabs. A file runs as an update, the same engine and the
   same check as ADD. Cash has no statement, so no drop area; a connected
   bank sends its free cash, so nothing to type. */
export function UpdateSheet({
  account,
  onClose,
  title,
  fileOnly = false,
}: {
  account: Doc<'accounts'> | null
  onClose: () => void
  /** The window's own name, where it is not "update · the account". */
  title?: string
  /** Only the drop area: nothing to type, nothing from the bank (ADD
      BUYS on a position's page, 13 Oct). */
  fileOnly?: boolean
}) {
  const waiting = useQuery(api.intake.openBatch, account ? {} : 'skip')
  const links = useQuery(api.bank.links, account ? {} : 'skip')
  const [flight, setFlight] = useState<Flight | null>(null)
  const [step, setStep] = useState<number | null>(null)
  /* A typed number landed: the tick alone, then it closes. */
  const [typed, setTyped] = useState(false)
  useEffect(() => setTyped(false), [account?._id])
  const noFile = account?.kinds.every((k) => k === 'cash') ?? false
  const link = links?.find(
    (l) =>
      l.accountId === account?._id &&
      l.status === 'linked' &&
      (l.validUntil ?? 0) > Date.now(),
  )
  return (
    <Sheet
      open={account !== null}
      title={title ?? (account ? `update · ${account.name}` : 'update')}
      onClose={onClose}
      wide={!noFile}
      glide
      header={step ? <StepStrip step={step} /> : null}
      guard={flight ? GUARD[flight] : null}
    >
      {account ? (
        <BulkUpdate
          waiting={waiting ?? null}
          onClose={onClose}
          onFlight={setFlight}
          onStep={setStep}
          forAccount={account._id}
          dropArea={(onStarted, onBusy) => (
            <>
              {noFile || typed ? null : (
                <AddDrop
                  accountId={account._id}
                  onStarted={onStarted}
                  onBusy={onBusy}
                />
              )}
              {fileOnly ? null : link ? (
                <FromBank account={account} checkedAt={link.checkedAt} />
              ) : (
                <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3">
                  {noFile || typed ? null : (
                    <span className="label-caps flex items-center gap-2.5 before:h-px before:flex-1 before:bg-lift/[0.07] after:h-px after:flex-1 after:bg-lift/[0.07]">
                      or type what is in it now
                    </span>
                  )}
                  <TypeBalances
                    key={account._id}
                    account={account}
                    onSaved={() => setTyped(true)}
                    onDone={onClose}
                  />
                </div>
              )}
            </>
          )}
        />
      ) : null}
    </Sheet>
  )
}

/* A connected bank's free cash: the bank's number, not his to type. */
function FromBank({
  account,
  checkedAt,
}: {
  account: Doc<'accounts'>
  checkedAt: number | null
}) {
  const data = useQuery(api.aggregate.balances, {})
  const pockets =
    data?.accounts.find((a) => a.accountId === account._id)?.pockets ?? []
  return (
    <div
      data-testid="from-bank"
      className="mx-auto flex w-full max-w-[520px] flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] bg-state-good/[0.05] px-3.5 py-3 ring-1 ring-state-good/28 ring-inset"
    >
      <span className="label-caps">free cash</span>
      <span className="min-w-[120px] flex-1 text-[17px] font-light">
        {pockets
          .filter((p) => p.value !== null)
          .map((p) => money(p.value as number, p.currency))
          .join(' · ')}
      </span>
      <span className="inline-flex items-center gap-[7px] font-mono text-[11px] text-ink-300">
        <Link2 className="motion-pulse size-3.5 text-state-good" />
        from the bank
        {checkedAt === null
          ? ''
          : ` · ${bankWhen(checkedAt, Date.now()).replace('today ', 'today, ')}`}
      </span>
    </div>
  )
}

function TypeBalances({
  account,
  onSaved,
  onDone,
}: {
  account: Doc<'accounts'>
  /** The moment it landed: what is around the fields steps aside. */
  onSaved: () => void
  onDone: () => void
}) {
  const today = useDayStarts(1).at(-1) as number
  const data = useQuery(api.aggregate.balances, {})
  const setBalance = useMutation(api.accounts.setBalance)
  const pockets =
    data?.accounts.find((a) => a.accountId === account._id)?.pockets ?? []
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [same, setSame] = useState<Set<string>>(new Set())
  /* What is being written right now — the press is answered at once. */
  const [busy, setBusy] = useState<string | null>(null)
  /* A save is seen to land (5 Oct: "I click still the same and NO
     animation, no confirmation"): a tick, the words, then it closes. */
  const [saved, setSaved] = useState(false)
  const close = useRef(onDone)
  close.current = onDone
  const landed = useRef(onSaved)
  landed.current = onSaved
  useEffect(() => {
    if (!saved) return
    landed.current()
    const t = setTimeout(() => close.current(), 1400)
    return () => clearTimeout(t)
  }, [saved])

  /* "Still the same" (5 Oct): the number it shows, recorded as today in
     one press — the window closes once nothing is left to say. */
  /* Only a pocket that needs it asks (5 Oct: "should appear only when
     need update. Not always") — more than a week old, like check-in. */
  const now = Date.now()
  const isOld = (c: string) => {
    const at = pockets.find((x) => x.currency === c)?.recordedAt
    return !at || now - at > STALE_MS
  }
  async function keepSame(c: string, value: number) {
    setError(null)
    setBusy(c)
    try {
      await setBalance({
        accountId: account._id,
        currency: c,
        value,
        dayStart: today,
      })
      const next = new Set(same).add(c)
      setSame(next)
      /* Nothing old left: the green tick shows a moment, then the sheet
         says it is up to date and closes. */
      if (account.currencies.every((x) => next.has(x) || !isOld(x)))
        setTimeout(() => setSaved(true), 650)
    } catch (e) {
      setError(
        failureMessage(e) ?? (e instanceof Error ? e.message : 'Not saved'),
      )
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    setError(null)
    setBusy('all')
    try {
      for (const c of account.currencies) {
        /* An untouched field still saves what it shows: "still 5000" is a
           reading too, and it clears "8d ago" (5 Oct — Save did nothing). */
        const shown = pockets.find((x) => x.currency === c)?.value
        const raw = values[c] ?? (shown == null ? '' : String(shown))
        if (raw.trim() === '') continue
        const n = Number(raw.replace(/\s/g, '').replace(',', '.'))
        if (!Number.isFinite(n)) throw new Error(`${c}: not a number`)
        await setBalance({
          accountId: account._id,
          currency: c,
          value: n,
          dayStart: today,
        })
      }
      setSaved(true)
    } catch (e) {
      setError(
        failureMessage(e) ?? (e instanceof Error ? e.message : 'Not saved'),
      )
    } finally {
      setBusy(null)
    }
  }

  if (saved) return <SavedNote name={account.name} />

  return (
    <>
      <span className="text-center text-[12.5px] text-ink-400">
        Free cash in it now, without its investments.
      </span>
      {account.currencies.map((c) => {
        const p = pockets.find((x) => x.currency === c)
        return (
          <label key={c} className={`${FIELD} flex items-center gap-2`}>
            <span className="rounded-[4px] bg-lift/[0.06] px-1.5 font-mono text-[10.5px] text-ink-300">
              {c}
            </span>
            <input
              inputMode="decimal"
              value={
                values[c] ??
                (p?.value === null || p?.value === undefined
                  ? ''
                  : String(p.value))
              }
              onChange={(e) => setValues({ ...values, [c]: e.target.value })}
              placeholder="0"
              aria-label={`${account.name} ${c}`}
              className="w-full bg-transparent text-[18px] focus:outline-none"
            />
            {same.has(c) ? (
              <span className="shrink-0 font-mono text-[10.5px] text-state-good">
                today
              </span>
            ) : p?.recordedAt ? (
              <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
                {agoLabel(p.recordedAt)}
              </span>
            ) : null}
            {typeof p?.value === 'number' &&
            !(c in values) &&
            (isOld(c) || same.has(c)) ? (
              <button
                type="button"
                key={same.has(c) ? 'saved' : 'ask'}
                disabled={same.has(c) || busy !== null}
                onClick={() => void keepSame(c, p.value as number)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.08em] whitespace-nowrap uppercase ring-1 ring-inset ${same.has(c) ? 'motion-pop bg-state-good text-background ring-state-good' : 'motion-press bg-state-good/10 text-state-good ring-state-good/40'}`}
              >
                {busy === c ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    saving
                  </>
                ) : same.has(c) ? (
                  '✓ saved'
                ) : (
                  '✓ still the same'
                )}
              </button>
            ) : null}
          </label>
        )
      })}
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void save()}
        className={`${PILL_LOUD} justify-center gap-2 py-3 disabled:opacity-70`}
      >
        {busy === 'all' ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            saving
          </>
        ) : (
          'save'
        )}
      </button>
    </>
  )
}
