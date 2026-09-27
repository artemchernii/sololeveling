import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, RotateCw, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { AccountLogo } from '@/components/finances/Logo'
import { money } from '@/lib/currency'
import { agoLabel } from '@/lib/format'
import { INTAKE_MODEL_NAME, READING_DEAD_MS, usd } from '@/lib/intake'
import { productIn } from '@/lib/institutions'

/* A file being read (27 Sep, his "Reading what?" — mocked in
   design/treasury-mockup/reading.html and approved). Every line is what the
   reader has actually found so far (intake.progress, written as it
   streams): the bank, what the file is, the rows as they come — grey when
   he already has them, lavender when new — and the balance last. No
   percentage and no timer pretending to know the end. When it fails, it
   says why, what it cost, and whether a second try could help. */

const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})
const LINES = 22

export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function isDead(intake: Doc<'intakes'>, now: number): boolean {
  return (
    intake.status === 'reading' &&
    now - (intake.readingSince ?? intake._creationTime) > READING_DEAD_MS
  )
}

const since = (intake: Doc<'intakes'>, now: number) =>
  Math.max(
    0,
    Math.round((now - (intake.readingSince ?? intake._creationTime)) / 1000),
  )

const elapsed = (s: number) =>
  s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`

const kb = (n: number) =>
  n >= 1024 * 1024
    ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1024))} KB`

/* ---- The sheet ---------------------------------------------------------- */

export function ReadingSheet({
  intake,
  onBack,
}: {
  intake: Doc<'intakes'>
  onBack: () => void
}) {
  const now = useNow()
  if (intake.status === 'failed' || isDead(intake, now))
    return (
      <ReadFailed
        intake={intake}
        dead={intake.status !== 'failed'}
        onBack={onBack}
      />
    )

  const p = intake.progress ?? {
    stage: 'opening' as const,
    rows: 0,
    have: 0,
    recent: [],
  }
  /* Trades and positions are counted; only cash rows can already be his. */
  const counted = p.kind === 'trades' || p.kind === 'holdings'
  const trades = counted
  const fresh = p.rows - p.have
  const lit = Math.min(LINES, p.rows)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
        <FileLook intake={intake} lit={lit} />
        <div className="flex flex-col gap-2.5">
          <Find label="bank" done={p.institution !== undefined}>
            {p.institution ? (
              <Bank institution={p.institution} tail={p.accountTail} />
            ) : (
              <Waiting>
                {p.stage === 'columns' ? 'reading the columns…' : 'looking…'}
              </Waiting>
            )}
          </Find>
          <Find label="what it is" done={p.title !== undefined}>
            {p.title ? (
              <span className="text-[14px] text-foreground">{p.title}</span>
            ) : (
              <Waiting>…</Waiting>
            )}
          </Find>
          <div
            className={`flex flex-col gap-2 rounded-[14px] bg-lift/[0.035] p-3 ring-1 ring-lift/[0.07] ring-inset transition-opacity ${p.rows > 0 ? 'opacity-100' : 'opacity-40'}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="label-caps">
                {p.kind === 'trades'
                  ? 'trades'
                  : p.kind === 'holdings'
                    ? 'positions'
                    : 'rows'}
              </span>
              <span className="flex items-baseline gap-2.5">
                <span className="text-[30px] leading-none font-light text-foreground tabular-nums">
                  {p.rows.toLocaleString()}
                </span>
                {p.rows > 0 && !trades ? (
                  <span className="font-mono text-[11px] text-ink-500">
                    {p.have} already here · {fresh} new
                  </span>
                ) : null}
              </span>
            </div>
            <div className="flex h-[5px] gap-1.5 overflow-hidden rounded-full bg-lift/[0.05]">
              <div
                className="rounded-full bg-ink-600 transition-[flex-grow] duration-300"
                style={{ flexGrow: trades ? 0 : p.have }}
              />
              <div
                className="rounded-full bg-lav-400 shadow-[0_0_10px_var(--system-shine)] transition-[flex-grow] duration-300"
                style={{ flexGrow: trades ? p.rows : fresh }}
              />
            </div>
            <div className="flex min-h-[150px] flex-col gap-0.5">
              {[...p.recent].reverse().map((r, i) => (
                <div
                  key={`${p.rows}-${i}`}
                  className={`motion-arrive grid grid-cols-[52px_1fr_auto_62px] items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-[13px] ${r.have ? 'text-ink-500' : 'bg-lav-400/[0.06] text-foreground'}`}
                >
                  <span className="font-mono text-[11px] text-ink-500">
                    {DAY.format(r.occurredAt)}
                  </span>
                  <span className="truncate">{r.label}</span>
                  <span
                    className={`text-right font-mono text-[12.5px] ${r.have || r.move || r.amount === 0 ? '' : r.amount > 0 ? 'text-state-good' : 'text-state-danger'}`}
                  >
                    {r.amount === 0
                      ? ''
                      : `${r.amount > 0 ? '+' : '−'}${money(Math.abs(r.amount), r.currency)}`}
                  </span>
                  <span
                    className={`text-right font-mono text-[9.5px] tracking-[0.12em] uppercase ${r.have ? 'text-ink-600' : 'text-lav-300'}`}
                  >
                    {r.have ? 'have it' : r.move ? 'move' : 'new'}
                  </span>
                </div>
              ))}
            </div>
            {p.stage === 'tickers' ? (
              <span className="font-mono text-[11px] text-lav-300 system-pulse">
                matching names to tickers…
              </span>
            ) : null}
          </div>
          {trades ? null : (
            <Find label="balance" done={p.balance !== undefined}>
              {p.balance ? (
                <span className="flex items-baseline gap-2">
                  <span className="motion-pop text-[20px] font-light text-foreground">
                    {money(p.balance.value, p.balance.currency)}
                  </span>
                  <span className="font-mono text-[11px] text-ink-500">
                    closing, {DAY.format(p.balance.asOf)}
                  </span>
                </span>
              ) : (
                <Waiting>at the end of the file</Waiting>
              )}
            </Find>
          )}
        </div>
      </div>
      <span className="border-t border-lav-400/15 pt-3 font-mono text-[11px] text-ink-500">
        {p.stage === 'rows' &&
        intake.files?.every((f) => /csv/i.test(f.contentType))
          ? 'read in code'
          : INTAKE_MODEL_NAME}{' '}
        · {elapsed(since(intake, now))} · nothing saved until you confirm
      </span>
    </div>
  )
}

function Find({
  label,
  done,
  children,
}: {
  label: string
  done: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-[14px] bg-lift/[0.035] px-3 py-2.5 ring-1 ring-lift/[0.07] ring-inset transition-opacity duration-300 ${done ? 'motion-arrive opacity-100' : 'opacity-40'}`}
    >
      <span className="label-caps w-[88px] shrink-0">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {done ? <Check className="motion-pop size-3.5 text-state-good" /> : null}
    </div>
  )
}

function Waiting({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px] text-ink-600">{children}</span>
}

function Bank({ institution, tail }: { institution: string; tail?: string }) {
  const accounts = useQuery(api.accounts.list, {})
  const product = productIn(institution)
  const mine = accounts?.find(
    (a) =>
      (tail !== undefined && a.ibanTails?.includes(tail)) ||
      (product !== undefined && a.institution === product.institution),
  )
  return (
    <span className="flex items-center gap-2.5">
      <span className="motion-pop">
        <AccountLogo
          name={product?.name ?? institution}
          domain={product?.domain ?? null}
          size={26}
        />
      </span>
      <span className="min-w-0 truncate text-[14px] text-foreground">
        {product?.name ?? institution}
        <span className="font-mono text-[11px] text-ink-500">
          {tail ? ` · …${tail}` : ''}
          {mine
            ? ` → your ${mine.name}`
            : accounts
              ? ' · not one of yours yet'
              : ''}
        </span>
      </span>
    </span>
  )
}

/* The file itself: his screenshot, or a page — lit line by line as rows
   are found, a beam passing down it while it is read. */
function FileLook({ intake, lit }: { intake: Doc<'intakes'>; lit: number }) {
  const url = useQuery(api.intake.preview, { intakeId: intake._id })
  const files = intake.files ?? []
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-[180px] overflow-hidden rounded-[10px] bg-lift/[0.06] ring-1 ring-lift/10 ring-inset sm:h-[300px]">
        {url ? (
          <img
            src={url}
            alt=""
            className="size-full object-cover object-top opacity-80"
          />
        ) : (
          <div className="flex flex-col gap-[7px] p-3.5">
            <span className="mb-1 flex items-center gap-2">
              <span className="size-3.5 rounded-[4px] bg-lift/25" />
              <span className="h-1.5 w-16 rounded-full bg-lift/20" />
            </span>
            {Array.from({ length: LINES }, (_, i) => (
              <span
                key={i}
                style={{ width: `${55 + ((i * 37) % 40)}%` }}
                className={`h-[5px] rounded-full transition-colors duration-300 ${i < lit ? 'bg-lav-400/60' : 'bg-lift/15'}`}
              />
            ))}
          </div>
        )}
        {intake.status === 'reading' ? <span className="system-beam" /> : null}
      </div>
      <span className="font-mono text-[11px] break-all text-ink-400">
        {files.map((f) => f.name).join(', ') || 'your file'}
        {files.length ? (
          <span className="block text-ink-600">
            {kb(files.reduce((n, f) => n + f.size, 0))}
          </span>
        ) : null}
      </span>
    </div>
  )
}

/* ---- When it fails ------------------------------------------------------ */

function ReadFailed({
  intake,
  dead,
  onBack,
}: {
  intake: Doc<'intakes'>
  dead: boolean
  onBack: () => void
}) {
  const retry = useMutation(api.intake.retry)
  const discard = useMutation(api.intake.discard)
  const [error, setError] = useState<string | null>(null)
  const canRetry = dead || intake.retryable === true
  const files = (intake.files ?? []).map((f) => f.name).join(', ')
  return (
    <div className="motion-arrive flex flex-col gap-4 rounded-[14px] bg-state-warn/[0.06] p-4 ring-1 ring-state-warn/30 ring-inset">
      <span className="font-mono text-[11px] tracking-[0.3em] text-state-warn uppercase">
        [ couldn’t read it ]
      </span>
      <p className="text-[15px] leading-relaxed text-foreground">
        {dead
          ? 'The reader stopped without answering. Nothing was saved — try again, and if it stops twice, the file is too long for one reading.'
          : intake.error}
      </p>
      <span className="font-mono text-[11px] text-ink-500">
        {files ? `${files} · ` : ''}
        {intake.costUsd !== undefined && intake.costUsd > 0
          ? `this cost ${usd(intake.costUsd)}`
          : 'nothing was charged'}
        {intake.note ? ` · ${intake.note}` : ''}
      </span>
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {canRetry ? (
          <button
            type="button"
            onClick={() =>
              void retry({ intakeId: intake._id }).catch((e: unknown) =>
                setError(
                  e instanceof Error
                    ? e.message.replace(/^.*ConvexError: /, '').split('\n')[0]
                    : 'Not tried',
                ),
              )
            }
            className={`${PILL_LOUD} flex-1 justify-center py-3`}
          >
            <RotateCw className="size-3.5" />
            try again
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void discard({ intakeId: intake._id }).then(onBack)}
          className={`${PILL_QUIET} flex-1 justify-center py-3`}
        >
          try another file
        </button>
      </div>
    </div>
  )
}

/* ---- The strip on the page, when the sheet is closed -------------------- */

export function IntakeStrip({
  intake,
  onOpen,
}: {
  intake: Doc<'intakes'>
  onOpen: () => void
}) {
  const now = useNow()
  const retry = useMutation(api.intake.retry)
  const discard = useMutation(api.intake.discard)
  const dead = isDead(intake, now)
  const failed = intake.status === 'failed' || dead
  const reading = intake.status === 'reading' && !dead
  const p = intake.progress
  const institution = intake.institution ?? p?.institution
  const product = productIn(institution)
  const name = intake.files?.[0]?.name
  const fresh = (p?.rows ?? 0) - (p?.have ?? 0)

  const title = failed
    ? (intake.title ?? p?.title ?? name ?? 'Your file')
    : reading
      ? (p?.title ??
        (product
          ? `${product.name} — reading`
          : `Reading ${name ?? 'your file'}`))
      : intake.historyTrades !== undefined
        ? `${intake.title ?? 'Trades'} · ready`
        : `${intake.title ?? 'Your file'} · ready to check`

  const sub = failed
    ? dead
      ? 'the reader stopped without answering'
      : (intake.error ?? 'could not be read')
    : reading
      ? [
          p?.rows
            ? `${p.rows.toLocaleString()} rows`
            : p?.stage === 'columns'
              ? 'reading the columns'
              : 'opening the file',
          p?.rows && p.have ? `${p.have} already here` : null,
          p?.rows ? `${fresh.toLocaleString()} new` : null,
          elapsed(since(intake, now)),
        ]
          .filter(Boolean)
          .join(' · ')
      : [
          intake.historyTrades !== undefined
            ? `${intake.historyTrades.toLocaleString()} trades · ${intake.historyTickers ?? 0} tickers`
            : p && p.rows > 0
              ? `${fresh} new · ${p.have} already here`
              : null,
          intake.balance
            ? `balance ${money(intake.balance.value, intake.balance.currency)}`
            : null,
          intake.reusedFrom
            ? 'read before · $0'
            : intake.costUsd !== undefined
              ? usd(intake.costUsd)
              : null,
        ]
          .filter(Boolean)
          .join(' · ')

  const ticks = Math.min(40, p?.rows ?? 0)
  const oldTicks = p && p.rows ? Math.round((p.have / p.rows) * ticks) : 0

  return (
    <div
      className={`motion-land relative flex items-center gap-3.5 px-4 py-3 ${failed ? 'rounded-[var(--radius-lg)] bg-state-warn/[0.06] ring-1 ring-state-warn/30 ring-inset' : 'system-frame'}`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
      >
        <span className="relative h-[38px] w-[30px] shrink-0 overflow-hidden rounded-[5px] bg-lift/10 ring-1 ring-lift/15 ring-inset">
          <span className="absolute inset-x-[5px] top-[7px] h-[22px] bg-[repeating-linear-gradient(var(--color-ink-600)_0_2px,transparent_2px_5px)] opacity-60" />
          {reading ? <span className="system-beam" /> : null}
          {failed ? (
            <X className="absolute inset-0 m-auto size-4 text-state-warn" />
          ) : null}
        </span>
        {institution && !failed ? (
          <span className="motion-pop shrink-0">
            <AccountLogo
              name={product?.name ?? institution}
              domain={product?.domain ?? null}
              size={26}
            />
          </span>
        ) : null}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[14px] text-foreground">{title}</span>
          <span
            className={`truncate font-mono text-[11px] ${failed ? 'text-state-warn' : 'text-ink-500'}`}
          >
            {sub}
          </span>
          {reading && ticks > 0 ? (
            <span className="flex h-1 gap-[3px]">
              {Array.from({ length: ticks }, (_, i) => (
                <i
                  key={i}
                  className={`max-w-2 flex-1 rounded-[2px] ${i < oldTicks ? 'bg-ink-600' : 'bg-lav-400'}`}
                />
              ))}
            </span>
          ) : null}
        </span>
      </button>
      {failed ? (
        dead || intake.retryable ? (
          <button
            type="button"
            onClick={() => void retry({ intakeId: intake._id })}
            className={PILL_LOUD}
          >
            <RotateCw className="size-3" />
            try again
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void discard({ intakeId: intake._id })}
            className={PILL_QUIET}
          >
            remove
          </button>
        )
      ) : reading ? (
        <button type="button" onClick={onOpen} className={PILL_QUIET}>
          watch
        </button>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className={`${PILL_LOUD} system-pulse`}
        >
          check →
        </button>
      )}
    </div>
  )
}

/* ---- Once read ---------------------------------------------------------- */

/** "read by Claude Haiku 4.5 2 min ago · $0.004", or "read before · $0". */
export function ReadBy({ intake }: { intake: Doc<'intakes'> }) {
  if (intake.reusedFrom)
    return <>the same file as before — its first reading, $0</>
  return (
    <>
      read by {intake.model}
      {intake.readAt ? ` ${agoLabel(intake.readAt)}` : ''}
      {intake.costUsd !== undefined ? ` · ${usd(intake.costUsd)}` : ''}
    </>
  )
}

/* A whole trade history (his Revolut export: 3,595 trades since 2020).
   What it holds, in his own rows: how many trades, how many tickers, what
   is still held. Bringing every dated trade in — so worth and P&L can go
   back to the first buy — is the next step, mocked first; nothing is saved
   from here yet. */
export function HistoryReview({
  intake,
  onDiscard,
}: {
  intake: Doc<'intakes'>
  onDiscard: () => void
}) {
  const rows = useQuery(api.intake.history, { intakeId: intake._id })
  if (rows === undefined) return <div className="min-h-[240px]" />
  const by = new Map<string, number>()
  for (const r of rows)
    by.set(
      r.name,
      (by.get(r.name) ?? 0) + (r.side === 'sell' ? -r.shares : r.shares),
    )
  const held = [...by]
    .filter(([, n]) => n > 1e-6)
    .sort((a, b) => a[0].localeCompare(b[0]))
  const buys = rows.filter((r) => r.side === 'buy').length
  const sells = rows.filter((r) => r.side === 'sell').length
  const splits = rows.filter((r) => r.side === 'split').length
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[15px] text-foreground">{intake.title}</span>
        <span className="font-mono text-[10.5px] text-ink-500">
          <ReadBy intake={intake} />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          [
            'trades',
            (buys + sells).toLocaleString(),
            `${buys.toLocaleString()} buys · ${sells.toLocaleString()} sells`,
          ],
          [
            'tickers',
            String(by.size),
            splits ? `${splits} stock splits` : 'no splits',
          ],
          ['held now', String(held.length), 'shares left after every sell'],
          ['closed', String(by.size - held.length), 'bought and sold out'],
        ].map(([label, n, sub], i) => (
          <div
            key={label}
            style={{ animationDelay: `${i * 60}ms` }}
            className="motion-arrive flex flex-col gap-1 rounded-[14px] bg-lift/[0.035] p-3 ring-1 ring-lift/[0.07] ring-inset"
          >
            <span className="label-caps">{label}</span>
            <span className="text-[26px] leading-none font-light text-foreground tabular-nums">
              {n}
            </span>
            <span className="font-mono text-[10.5px] text-ink-500">{sub}</span>
          </div>
        ))}
      </div>
      {held.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {held.map(([name, n]) => (
            <span
              key={name}
              className="rounded-full bg-lav-400/[0.08] px-2.5 py-1 font-mono text-[11px] text-lav-300 ring-1 ring-lav-400/25 ring-inset"
            >
              {name}{' '}
              <span className="text-ink-500">
                {n < 10 ? n.toFixed(3) : n.toFixed(1)}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {intake.note ? (
        <span className="font-mono text-[11px] text-ink-500">
          {intake.note}
        </span>
      ) : null}
      <p className="rounded-[12px] bg-lav-400/[0.05] p-3 text-[13px] text-ink-300 ring-1 ring-lav-400/20 ring-inset">
        Everything is read and nothing is saved yet. Bringing the whole history
        in — every trade on its day, so your worth and profit can go back to{' '}
        {rows[0] ? DAY_YEAR.format(rows[0].occurredAt) : 'the first buy'} — is
        the next screen, and it is mocked for you first.
      </p>
      <button
        type="button"
        onClick={onDiscard}
        className={`${PILL_QUIET} justify-center py-3`}
      >
        throw it away
      </button>
    </div>
  )
}

const DAY_YEAR = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
})
