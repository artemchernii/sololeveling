import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check as Tick, Sigma } from 'lucide-react'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { Busy } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { failureMessage } from '@/lib/convex-errors'
import { fmt, short } from './AccountSheetRows'

/* Is the balance right (11 Oct, mockup design/treasury-mockup/sheet-
   check.html). Right: a tick under the amount, no card ("This green card
   is so awful"). Not right: the amount with no row and, when another of
   his accounts shows the same money, one question; else the day to add
   it on. No sums written out ("confusing slop") — aggregate.accountSheet
   has them, gapMatch.find names the transfer. */

type SheetData = NonNullable<
  FunctionReturnType<typeof api.aggregate.accountSheet>
>
type Check = SheetData['checks'][number]

const DAY_MS = 86_400_000
const noon = (t: number) => {
  const d = new Date(t)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime()
}
/* A balance is dated by the day it is for (aggregate.accountSheet). */
export const dayOf = (data: SheetData, at: number) =>
  data.readings.find((r) => r.at === at)?.asOf ?? at

const OPT =
  'motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-ink-200 ring-1 ring-inset transition-colors hover:bg-lav-400/10 hover:ring-lav-400/55 disabled:opacity-60'
const OPT_QUIET = `${OPT} bg-lift/[0.03] ring-lift/15`
const OPT_LOUD = `${OPT} bg-lav-400/15 ring-lav-400/50`

/** Under the amount: do the rows reach the balances? */
export function BalanceTick({
  data,
  fallback,
}: {
  data: SheetData | null | undefined
  /** What the line says while there is nothing to check. */
  fallback: string
}) {
  const gap = data?.checks.find((c) => c.missing !== 0)
  if (gap)
    return (
      <span className="font-mono text-[11px] text-state-warn">
        <Veiled>{fmt(Math.abs(gap.missing), gap.currency)}</Veiled> has no row
      </span>
    )
  if (data && data.checks.length > 0)
    return (
      /* A tick, no words (31 Oct: "row match do we need this text?"):
         the day it holds from is its title. */
      <span
        data-testid="rows-match"
        title={`rows match · since ${short(dayOf(data, Math.min(...data.checks.map((c) => c.from))), true)}`}
        className="grid size-5 place-items-center rounded-full bg-state-good/14 text-state-good"
      >
        <Tick className="motion-pop size-3" strokeWidth={3} />
      </span>
    )
  return <span className="font-mono text-[11px] text-ink-400">{fallback}</span>
}

type Added = {
  moveId: Id<'logs'>
  feeId: Id<'logs'> | null
  from: string
  fee: number
  currency: string
}

/** Above the rows: the first pair of balances the rows do not join, and
    what "same transfer" just wrote. Nothing when it all adds up. */
export function SheetCheck({
  data,
  account,
  onUpdate,
}: {
  data: SheetData
  account: Doc<'accounts'>
  onUpdate: () => void
}) {
  const gap = data.checks.find((c) => c.missing !== 0)
  const [added, setAdded] = useState<Added | null>(null)
  return (
    <>
      {added ? (
        <AddedStrip added={added} onGone={() => setAdded(null)} />
      ) : null}
      {gap ? (
        <GapBox
          key={`${gap.currency}-${gap.to}`}
          gap={gap}
          data={data}
          account={account}
          onUpdate={onUpdate}
          onAdded={setAdded}
        />
      ) : data.checks.length === 0 ? (
        <div className="flex gap-2.5 rounded-[14px] bg-lift/[0.035] px-3.5 py-3 text-[13.5px] text-ink-300 ring-1 ring-lift/10 ring-inset">
          <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-lift/[0.08] font-mono text-[12px] text-ink-400">
            ·
          </span>
          <span>
            {data.readings.length === 0
              ? 'No balance yet, nothing to check the rows against.'
              : 'One balance so far, nothing to check it against. The next balance is checked against the rows in between.'}
          </span>
        </div>
      ) : null}
    </>
  )
}

function AddedStrip({ added, onGone }: { added: Added; onGone: () => void }) {
  const undo = useMutation(api.gapMatch.undo)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const press = () => {
    setBusy(true)
    setError(null)
    undo({ moveId: added.moveId, feeId: added.feeId })
      .then(onGone)
      .catch((e: unknown) => {
        setBusy(false)
        setError(failureMessage(e))
      })
  }
  return (
    <div className="motion-arrive flex flex-wrap items-center gap-2.5 rounded-[14px] bg-state-good/[0.06] px-3.5 py-2.5 text-[13px] text-ink-200 ring-1 ring-state-good/30 ring-inset">
      <Tick className="motion-pop size-3.5 text-state-good" strokeWidth={3} />
      <span className="flex-1">
        Transfer from {added.from} added.
        {added.fee > 0 ? (
          <>
            {' '}
            Fee <Veiled>{fmt(added.fee, added.currency)}</Veiled>.
          </>
        ) : null}
        {error ? <span className="text-state-danger"> {error}</span> : null}
      </span>
      <button
        type="button"
        onClick={press}
        disabled={busy}
        className="font-mono text-[10.5px] tracking-[0.12em] text-lav-400 uppercase"
      >
        <Busy on={busy} doing="undoing…">
          undo
        </Busy>
      </button>
    </div>
  )
}

function GapBox({
  gap,
  data,
  account,
  onUpdate,
  onAdded,
}: {
  gap: Check
  data: SheetData
  account: Doc<'accounts'>
  onUpdate: () => void
  onAdded: (a: Added) => void
}) {
  const ask = {
    accountId: account._id,
    currency: gap.currency,
    from: gap.from,
    to: gap.to,
    missing: gap.missing,
  }
  const found = useQuery(api.gapMatch.find, ask)
  const same = useMutation(api.gapMatch.sameTransfer)
  const [refused, setRefused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const came = gap.missing > 0

  const yes = (m: NonNullable<typeof found>) => {
    setBusy(true)
    setError(null)
    same({ ...ask, logId: m.logId })
      .then((ids) =>
        onAdded({
          ...ids,
          from: m.account.name,
          fee: m.fee,
          currency: gap.currency,
        }),
      )
      .catch((e: unknown) => {
        setBusy(false)
        setError(failureMessage(e))
      })
  }

  return (
    <div className="motion-arrive flex flex-col gap-2.5 rounded-[14px] bg-state-warn/[0.06] px-3.5 py-3 ring-1 ring-state-warn/30 ring-inset">
      <div className="flex items-start gap-2.5">
        <Sigma className="mt-[3px] size-3.5 shrink-0 text-state-warn" />
        <span className="flex flex-col text-[13.5px]">
          <b className="font-medium">
            <Veiled>{fmt(Math.abs(gap.missing), gap.currency)}</Veiled>{' '}
            {came ? 'came in' : 'left'} with no row
          </b>
          <span className="text-[12px] text-ink-400">
            {short(dayOf(data, gap.from))} – {short(dayOf(data, gap.to))}
          </span>
        </span>
      </div>
      {found === undefined ? (
        <span className="pl-6 text-[12.5px] text-ink-400">
          <Busy on doing="searching other accounts…">
            {null}
          </Busy>
        </span>
      ) : found !== null && !refused ? (
        <>
          <b className="pl-6 text-[13px] font-medium">Is it this transfer?</b>
          <div className="grid grid-cols-[48px_1fr_auto] items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[12.5px] text-ink-300 ring-1 ring-lav-400/22 ring-inset sm:ml-6">
            <span className="font-mono text-[10.5px] text-ink-500">
              {short(found.at)}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-start gap-1.5">
                <AccountLogo
                  name={found.account.name}
                  domain={found.account.domain}
                  size={18}
                />
                <span>
                  {came
                    ? `${found.account.name} → ${account.name}`
                    : `${account.name} → ${found.account.name}`}
                </span>
              </span>
              {found.fee > 0 ? (
                <span className="text-[11.5px] text-ink-400">
                  <Veiled>{fmt(found.fee, gap.currency)}</Veiled> less arrived —
                  a fee
                </span>
              ) : null}
            </span>
            <span className="font-mono">
              <Veiled>{fmt(found.amount, gap.currency)}</Veiled>
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:pl-6">
            <button
              type="button"
              onClick={() => yes(found)}
              disabled={busy}
              className={OPT_LOUD}
            >
              <Busy on={busy} doing="saving…">
                same transfer
                {found.fee > 0 ? `, ${fmt(found.fee, gap.currency)} fee` : ''}
              </Busy>
            </button>
            {busy ? null : (
              <button
                type="button"
                onClick={() => setRefused(true)}
                className={OPT_QUIET}
              >
                not this one
              </button>
            )}
          </div>
        </>
      ) : (
        <AddOnDay gap={gap} accountId={account._id} onUpdate={onUpdate} />
      )}
      {error ? (
        <span className="pl-6 text-[12.5px] text-state-danger">{error}</span>
      ) : null}
    </div>
  )
}

/* No account shows it: the row to add, on a day he picks with one tap —
   the day before the later balance unless he says otherwise. The app
   cannot know the day; it never asks him to type one. */
function AddOnDay({
  gap,
  accountId,
  onUpdate,
}: {
  gap: Check
  accountId: Id<'accounts'>
  onUpdate: () => void
}) {
  const record = useMutation(api.money.record)
  const days = useMemo(() => {
    const out: Array<number> = []
    for (let t = noon(gap.from + DAY_MS); t <= noon(gap.to); t += DAY_MS)
      out.push(noon(t))
    return out
  }, [gap.from, gap.to])
  const [day, setDay] = useState(() => days.at(-2) ?? days.at(-1) ?? gap.to)
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shown = all ? days : days.slice(-10)

  const add = () => {
    setBusy(true)
    setError(null)
    void record({
      lines: [
        {
          kind: gap.missing < 0 ? 'out' : 'in',
          accountId,
          amount: Math.abs(gap.missing),
          currency: gap.currency,
          category: 'other',
          note: 'Missing from the file',
          occurredAt: day,
        },
      ],
    }).catch((e: unknown) => {
      setBusy(false)
      setError(failureMessage(e))
    })
  }

  return (
    <>
      <div className="flex flex-wrap gap-1.5 sm:pl-6">
        {!all && days.length > shown.length ? (
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-full px-2.5 py-1 font-mono text-[10.5px] text-ink-400 ring-1 ring-lift/15 ring-inset hover:text-foreground"
          >
            earlier…
          </button>
        ) : null}
        {shown.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            aria-pressed={d === day}
            className={`rounded-full px-2.5 py-1 font-mono text-[10.5px] ring-1 ring-inset ${
              d === day
                ? 'bg-state-warn/10 text-state-warn ring-state-warn/50'
                : 'text-ink-300 ring-lift/15 hover:text-foreground'
            }`}
          >
            {short(d)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 sm:pl-6">
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className={OPT_LOUD}
        >
          <Busy on={busy} doing="saving…">
            add {fmt(gap.missing, gap.currency, true)} on {short(day)}
          </Busy>
        </button>
        {busy ? null : (
          <button type="button" onClick={onUpdate} className={OPT_QUIET}>
            drop a file
          </button>
        )}
      </div>
      {error ? (
        <span className="text-[12.5px] text-state-danger sm:pl-6">{error}</span>
      ) : null}
    </>
  )
}
