import { useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Loader2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { FIELD, PILL_LOUD } from '@/components/finances/bits'
import { DropFiles } from '@/components/finances/Add'
import { IntakeFlow } from '@/components/finances/Intake'
import { Sheet } from '@/components/finances/Sheet'
import { useDayStarts } from '@/components/track/useDayStarts'
import { agoLabel } from '@/lib/format'
import { STALE_MS } from '@/lib/freshness'
import { failureMessage } from '@/lib/convex-errors'
import { SavedNote } from '@/components/finances/AccountParts'

/* Update: type each currency, or drop a statement or screenshot of this
   account — the same reader as +, told which account it is. A drop turns
   this sheet into the reading and its review, as + does (27 Sep: it used
   to close and leave him where he started, the read out of sight). */
export function UpdateSheet({
  account,
  onClose,
}: {
  account: Doc<'accounts'> | null
  onClose: () => void
}) {
  const [tab, setTab] = useState<'type' | 'file'>('type')
  const [intakeId, setIntakeId] = useState<Id<'intakes'> | null>(null)
  const close = () => {
    setIntakeId(null)
    onClose()
  }
  return (
    <Sheet
      open={account !== null}
      title={
        intakeId ? 'check it' : account ? `update · ${account.name}` : 'update'
      }
      onClose={close}
      onBack={intakeId ? () => setIntakeId(null) : undefined}
      wide={intakeId !== null || tab === 'file'}
    >
      {account && intakeId ? (
        <IntakeFlow
          intakeId={intakeId}
          onBack={() => setIntakeId(null)}
          onDone={close}
        />
      ) : account ? (
        <>
          <div className="flex gap-1 rounded-[12px] bg-lift/[0.04] p-1">
            {(['type', 'file'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-[9px] py-2 font-mono text-[11px] tracking-[0.12em] uppercase ${tab === t ? 'bg-lav-400/16 text-foreground ring-1 ring-lav-400/40 ring-inset' : 'text-ink-400'}`}
              >
                {t === 'type' ? 'type it' : 'statement or screenshot'}
              </button>
            ))}
          </div>
          {tab === 'type' ? (
            <TypeBalances key={account._id} account={account} onDone={close} />
          ) : (
            <DropFiles accountId={account._id} onStarted={setIntakeId} />
          )}
        </>
      ) : null}
    </Sheet>
  )
}

function TypeBalances({
  account,
  onDone,
}: {
  account: Doc<'accounts'>
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
  useEffect(() => {
    if (!saved) return
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
      <span className="text-[12.5px] text-ink-400">
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
