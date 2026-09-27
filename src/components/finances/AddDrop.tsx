import { useRef, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  ArrowDownToLine,
  ImageIcon,
  Check,
  FileUp,
  Landmark,
  Loader2,
  ScanSearch,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { useIntakeUpload } from '@/components/finances/Add'
import { FIELD, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { agoLabel } from '@/lib/format'
import { freshness } from '@/lib/freshness'
import type { PocketTime } from '@/lib/freshness'
import { MAX_INTAKE_FILES } from '@/lib/intake'

/* The + sheet as it opens (27 Sep; design/treasury-mockup/add-empty.html,
   approved). Artem found it bare. It is filled with what is true about his
   setup, not with instructions: how a file goes (one line), his accounts
   and how each was last filled, and the last file read — or, when an
   account is a week behind, that one, in amber, one tap from its picker.
   After a drop the reading screen takes over, as before. */

const STEPS: ReadonlyArray<[LucideIcon, string]> = [
  [ArrowDownToLine, 'drop'],
  [ScanSearch, 'read'],
  [Check, 'you check'],
  [Landmark, 'lands on the account'],
]

/* Day one has no accounts to name, so it names the files instead. */
const KINDS_OF_FILE = [
  ['bank statement', 'csv · pdf'],
  ['broker screenshot', 'png · jpg'],
  ['trades export', 'csv'],
] as const

const SOURCE: Record<NonNullable<PocketTime['source']>, string> = {
  typed: 'typed',
  statement: 'statement',
  screenshot: 'screenshot',
  sync: 'synced',
}

const DAY = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short' })

/** How and when an account was last filled, from its freshest pocket.
    Balances saved before sources were kept have none: those say "read". */
function filledBy(pockets: ReadonlyArray<PocketTime>): string {
  const last = pockets
    .filter((p) => p.recordedAt !== null)
    .reduce<PocketTime | null>(
      (a, b) =>
        a === null || (b.recordedAt ?? 0) > (a.recordedAt ?? 0) ? b : a,
      null,
    )
  if (last?.recordedAt == null) return 'nothing yet'
  const word = last.source ? SOURCE[last.source] : 'read'
  return `${word} · ${agoLabel(last.writtenAt ?? last.recordedAt)}`
}

export function AddDrop({
  onStarted,
}: {
  onStarted: (intakeId: Id<'intakes'>) => void
}) {
  const data = useQuery(api.aggregate.balances, {})
  const last = useQuery(api.intake.lastRead, {})
  const upload = useIntakeUpload()
  const input = useRef<HTMLInputElement>(null)
  /* The account a picker was opened for — a tap on a behind account. */
  const forAccount = useRef<Id<'accounts'> | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /* Screenshots wait for a line from him first (27 Sep: a Trade Republic
     screen said only "Wealth", and the reader could not tell whose). The
     line is optional — read it without one and nothing changes. */
  const [waiting, setWaiting] = useState<Array<File> | null>(null)
  const [hint, setHint] = useState('')

  const now = Date.now()
  const accounts = (data?.accounts ?? []).map((a) => ({
    ...a,
    fresh: freshness(a.pockets, now),
  }))
  /* Cash is counted, not read — a wallet is never "behind" on a file. */
  const behind = accounts.find(
    (a) => a.fresh.stale && a.fresh.asOf !== null && !a.kinds.includes('cash'),
  )

  function pick(accountId?: Id<'accounts'>) {
    forAccount.current = accountId
    input.current?.click()
  }

  function send(files: Array<File>) {
    if (files.length === 0) return
    /* A tapped account already says whose it is. */
    if (
      forAccount.current === undefined &&
      files.some((f) => f.type.startsWith('image/'))
    ) {
      setError(null)
      setHint('')
      setWaiting(files)
      return
    }
    void read(files)
  }

  async function read(files: Array<File>, words?: string) {
    setBusy(true)
    setError(null)
    try {
      for (const id of await upload(files, {
        accountId: forAccount.current,
        hint: words,
      }))
        onStarted(id)
      setWaiting(null)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'It did not upload — try again.',
      )
    } finally {
      forAccount.current = undefined
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setOver(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          if (waiting) return
          forAccount.current = undefined
          send([...e.dataTransfer.files])
        }}
        className={`flex flex-col items-center gap-4 rounded-[18px] border-[1.5px] px-4 pt-5 pb-4 transition-[background-color,border-color,box-shadow] duration-300 ${
          over
            ? 'border-solid border-lav-400 bg-lav-400/15 shadow-[inset_0_0_40px_-10px_var(--system-shine),0_0_30px_-10px_var(--system-shine)]'
            : 'drop-breathe border-dashed bg-[radial-gradient(420px_140px_at_50%_0%,color-mix(in_oklch,var(--color-lav-400)_7%,transparent),transparent_70%)]'
        }`}
      >
        {waiting ? (
          <NoteStep
            files={waiting}
            hint={hint}
            busy={busy}
            onHint={setHint}
            onBack={() => setWaiting(null)}
            onRead={() => void read(waiting, hint)}
          />
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => pick()}
              className="motion-press flex items-center gap-3 text-left"
            >
              <span
                className={`grid size-10 place-items-center rounded-[12px] ring-1 ring-lav-400/35 transition-transform duration-300 ring-inset ${
                  over
                    ? '-translate-y-1 scale-110 bg-lav-400/25 text-foreground'
                    : 'bg-lav-400/10 text-lav-300'
                }`}
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <FileUp className="size-5" />
                )}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[15.5px] text-foreground">
                  {busy ? 'Uploading…' : 'Drop statements or screenshots'}
                </span>
                <span className="font-mono text-[10.5px] text-ink-500">
                  or click to pick · up to {MAX_INTAKE_FILES} at once
                </span>
              </span>
            </button>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {STEPS.map(([Icon, label], i) => (
                <span key={label} className="contents">
                  {i > 0 ? (
                    <span
                      className="motion-land hidden font-mono text-[11px] text-ink-600 sm:inline"
                      style={{ animationDelay: `${80 + i * 90}ms` }}
                    >
                      →
                    </span>
                  ) : null}
                  <span
                    className="motion-land inline-flex items-center gap-1.5 rounded-full bg-lift/[0.035] px-2.5 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-ink-400 uppercase"
                    style={{ animationDelay: `${60 + i * 90}ms` }}
                  >
                    <Icon className="size-3.5 text-ink-300" />
                    {label}
                  </span>
                </span>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {data === undefined
                ? null
                : accounts.length === 0
                  ? KINDS_OF_FILE.map(([name, how], i) => (
                      <span
                        key={name}
                        className="motion-land inline-flex items-center gap-2 rounded-full bg-lift/[0.04] px-3 py-1.5 text-[12.5px] text-ink-200 ring-1 ring-lift/8 ring-inset"
                        style={{ animationDelay: `${360 + i * 70}ms` }}
                      >
                        {name}
                        <span className="font-mono text-[9.5px] tracking-[0.12em] text-ink-500 uppercase">
                          {how}
                        </span>
                      </span>
                    ))
                  : accounts.map((a, i) => {
                      const late = a.accountId === behind?.accountId
                      return (
                        <button
                          key={a.accountId}
                          type="button"
                          disabled={busy}
                          onClick={() => pick(a.accountId)}
                          title={`Drop a file for ${a.name}`}
                          className={`motion-land motion-press inline-flex items-center gap-2 rounded-full bg-lift/[0.04] py-1 pr-3 pl-1 text-[12.5px] text-ink-200 ring-1 ring-inset hover:text-foreground ${
                            late
                              ? 'ring-state-warn/40 hover:ring-state-warn/70'
                              : 'ring-lift/8 hover:ring-lav-400/45'
                          }`}
                          style={{ animationDelay: `${360 + i * 70}ms` }}
                        >
                          <AccountLogo
                            name={a.name}
                            domain={a.domain}
                            size={24}
                          />
                          {a.name}
                          <span
                            className={`font-mono text-[9.5px] tracking-[0.12em] uppercase ${late ? 'text-state-warn' : 'text-ink-500'}`}
                          >
                            {late && a.fresh.asOf !== null
                              ? `balance of ${DAY.format(a.fresh.asOf)}`
                              : filledBy(a.pockets)}
                          </span>
                        </button>
                      )
                    })}
            </div>
          </>
        )}
      </div>

      <LastLine
        behind={
          behind && behind.fresh.asOf !== null
            ? { name: behind.name, asOf: behind.fresh.asOf }
            : null
        }
        last={last}
        onDrop={() => pick(behind?.accountId)}
      />
      {error ? (
        <span className="text-center font-mono text-[11px] text-state-warn">
          {error}
        </span>
      ) : null}
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="application/pdf,text/csv,.csv,image/png,image/jpeg,image/webp"
        onChange={(e) => {
          send([...(e.target.files ?? [])])
          e.target.value = ''
        }}
      />
    </div>
  )
}

/* One line under the zone: the account that is behind, else the last file
   read, else that nothing has been. */
function LastLine({
  behind,
  last,
  onDrop,
}: {
  behind: { name: string; asOf: number } | null
  last:
    | { name: string; institution: string | null; readAt: number }
    | null
    | undefined
  onDrop: () => void
}) {
  if (last === undefined) return null
  const dot = behind
    ? 'bg-state-warn shadow-[0_0_8px_var(--color-state-warn)]'
    : 'bg-state-good shadow-[0_0_8px_var(--color-state-good)]'
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center font-mono text-[11px] text-ink-500">
      {behind || last ? (
        <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      ) : null}
      {behind ? (
        <>
          <span>
            <span className="text-state-warn">{behind.name}</span> balance of{' '}
            {DAY.format(behind.asOf)} — a newer one not in yet
          </span>
          <button
            type="button"
            onClick={onDrop}
            className="text-lav-400 underline-offset-4 hover:underline"
          >
            drop it
          </button>
        </>
      ) : last ? (
        <span>
          last read <span className="text-ink-300">{last.name}</span>
          {last.institution ? ` · ${last.institution}` : ''} ·{' '}
          {agoLabel(last.readAt)}
        </span>
      ) : (
        <span>nothing read yet — the first file makes its account</span>
      )}
    </div>
  )
}

/* A screenshot dropped: what it is, in his words, before it is read. */
function NoteStep({
  files,
  hint,
  busy,
  onHint,
  onBack,
  onRead,
}: {
  files: Array<File>
  hint: string
  busy: boolean
  onHint: (s: string) => void
  onBack: () => void
  onRead: () => void
}) {
  return (
    <div className="motion-arrive flex w-full max-w-[520px] flex-col gap-3">
      <span className="flex items-center gap-2 text-[13px] text-ink-200">
        <ImageIcon className="size-4 text-lav-300" />
        <span className="truncate">{files[0]?.name}</span>
        {files.length > 1 ? (
          <span className="font-mono text-[10.5px] text-ink-500">
            +{files.length - 1}
          </span>
        ) : null}
      </span>
      <label className={`${FIELD} flex items-center gap-2`}>
        <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
          what is it?
        </span>
        <input
          autoFocus
          value={hint}
          onChange={(e) => onHint(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) onRead()
          }}
          maxLength={200}
          placeholder="Trade Republic portfolio · optional"
          aria-label="What the screenshot is"
          className="w-full bg-transparent focus:outline-none"
        />
      </label>
      <span className="text-[12px] text-ink-500">
        A screen often has no bank name on it. A few words say whose it is — or
        leave it and read.
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className={`${PILL_QUIET} flex-1 justify-center py-2.5`}
        >
          back
        </button>
        <button
          type="button"
          onClick={onRead}
          disabled={busy}
          className={`${PILL_LOUD} flex-[2] justify-center py-2.5`}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {busy ? 'uploading…' : 'read it'}
        </button>
      </div>
    </div>
  )
}
