import { createContext, useContext, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, Loader2, TriangleAlert, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { TickerLogo } from '@/components/finances/Logo'
import { Veiled } from '@/components/finances/Veil'
import { buysCheck } from '@/lib/addBuys'
import type { SavedTrade } from '@/lib/addBuys'
import { landedSplit } from '@/lib/buysLanded'
import { productIn } from '@/lib/institutions'
import { matchAccount } from '@/lib/intake'
import { euros } from '@/lib/money'

/* ADD BUYS on one position's page (14 Oct, mockup add-buys.html): the
   window is the account's update window, and this is what it knows of
   the thing it was opened for. With it, the check and the saved screen
   speak of that thing — its buys, their sum, the units they reach
   beside the units held — not of the whole account ("why it says
   revolut is up to date? We update gold and not entire revolut"). */
export type BuysFor = {
  name: string
  /** Every listing it is owned under. */
  symbols: ReadonlyArray<string>
  held: number
  /** "0.286213 oz", "3 shares". */
  amount: (n: number) => string
  /** Its buys and sells saved so far. */
  saved: ReadonlyArray<SavedTrade & { priceEur: number }>
  /** What its icon is drawn from. */
  logo: { symbol: string; type: string; name: string }
  /** PAID as its page says it (null where no file says). */
  paid: number | null
  /** The round held now (src/lib/rounds.ts), where there is one. */
  since?: { from: number; buys: number; sells: number; buyEur: number }
  /** Its page's list of buys and sells, cut into rounds. */
  trades: React.ReactNode
}
export const BuysContext = createContext<BuysFor | null>(null)
export const useBuysFor = () => useContext(BuysContext)

const DAY = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function useCheck(batchId: Id<'batches'>, thing: BuysFor) {
  const read = useQuery(api.intake.batchBuys, { batchId })
  return read === undefined
    ? undefined
    : buysCheck(read, thing.saved, thing.symbols, thing.held)
}

/** What is held beside what the buys reach, on one line (14 Oct, his
    words: "7.365427 shares · every buy in ✓"): a state, said with its
    colour, its icon and a pulse — never grey words. */
export function BuysLine({
  check,
  thing,
}: {
  check: Pick<
    ReturnType<typeof buysCheck>,
    'state' | 'missing' | 'held' | 'units'
  >
  thing: BuysFor
}) {
  const ok = check.state === 'reaches'
  return (
    <div
      data-testid="buys-line"
      className={`motion-land flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[14px] px-3.5 py-3 font-mono text-[13px] ring-1 ring-inset ${ok ? 'bg-state-good/[0.06] ring-state-good/30' : 'bg-state-warn/[0.07] ring-state-warn/35'}`}
    >
      <span className="text-foreground">
        <Veiled>{thing.amount(check.held)}</Veiled>
      </span>
      <span className="text-ink-500">·</span>
      {ok ? (
        <span className="flex items-center gap-1.5 text-state-good">
          every buy in
          <Check className="size-3.5 shrink-0" />
        </span>
      ) : (
        <>
          <span className="text-ink-300">
            <Veiled>{thing.amount(check.units)}</Veiled> in the buys
          </span>
          {check.state === 'missing' ? (
            <>
              <span className="text-ink-500">·</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-state-warn/14 px-2.5 py-0.5 text-[10.5px] tracking-[0.12em] text-state-warn uppercase">
                <TriangleAlert className="motion-pulse size-3 shrink-0" />
                <Veiled>{thing.amount(check.missing)}</Veiled> missing
              </span>
            </>
          ) : (
            <TriangleAlert className="motion-pulse size-3.5 shrink-0 text-state-warn" />
          )}
        </>
      )}
    </div>
  )
}

/** The check step: three sums, the line, and each buy read. */
export function BuysCheck({ batchId }: { batchId: Id<'batches'> }) {
  const thing = useBuysFor()
  if (thing === null) return null
  return <Read batchId={batchId} thing={thing} />
}

function Read({ batchId, thing }: { batchId: Id<'batches'>; thing: BuysFor }) {
  const c = useCheck(batchId, thing)
  if (c === undefined) return <div className="min-h-[220px]" />
  const had = c.rows.length - c.fresh
  return (
    <div data-testid="buys-check" className="flex flex-col gap-3.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Sum label="buys read" value={String(c.rows.length)}>
          {c.rows.length === 0
            ? `none for ${thing.name}`
            : had === 0
              ? 'all new'
              : `${had} already saved`}
        </Sum>
        <Sum
          label="buy total"
          value={c.totalEur === null ? '—' : euros(c.totalEur)}
          veiled
        >
          <Veiled>{thing.amount(c.readUnits)}</Veiled>
        </Sum>
      </div>
      <BuysLine check={c} thing={thing} />
      <Elsewhere files={c.elsewhere} thing={thing} />
      <BuyRows rows={c.rows} thing={thing} />
    </div>
  )
}

/** What ADD BUYS needs to know before saving: the listings it may save,
    whether rows for something else block it, and whether a file holds
    any row of the thing. Nothing when the window is not ADD BUYS. */
export function useBuysGate(batchId: Id<'batches'> | null) {
  const thing = useBuysFor()
  const read = useQuery(
    api.intake.batchBuys,
    thing === null || batchId === null ? 'skip' : { batchId },
  )
  if (thing === null) return null
  return {
    only: [...thing.symbols],
    blocked: read === undefined || read.some((r) => !mine(r, thing)),
    /** A file holds a row of the thing — else it is never asked about. */
    holds: (intakeId: Id<'intakes'>) =>
      read?.some((r) => r.intakeId === intakeId && mine(r, thing)) ?? false,
  }
}
const mine = (r: { symbol: string | null }, thing: BuysFor) =>
  r.symbol !== null && thing.symbols.includes(r.symbol)

/** Files with rows for something else: what they are, where they
    belong, and a way to take them out. None of it is saved here. */
function Elsewhere({
  files,
  thing,
}: {
  files: ReturnType<typeof buysCheck>['elsewhere']
  thing: BuysFor
}) {
  const accounts = useQuery(api.accounts.list, {})
  if (files.length === 0) return null
  /* His account of that bank, else the bank as the file names it. */
  const bank = (institution: string | null) =>
    accounts?.find(
      (a) =>
        a._id ===
        matchAccount(
          institution ?? undefined,
          accounts.map((x) => ({ id: x._id, name: x.name, domain: x.domain })),
        ),
    )?.name ?? productIn(institution ?? undefined)?.name
  return (
    <div data-testid="buys-elsewhere" className="flex flex-col gap-2">
      <span className="label-caps text-state-warn">
        not {thing.name} · not saved here
      </span>
      {files.map((f) => (
        <OtherFile
          key={f.intakeId}
          intakeId={f.intakeId as Id<'intakes'>}
          title={`${f.rows} ${f.rows === 1 ? 'row' : 'rows'} · ${f.names.join(', ')}`}
          where={`belongs on its own page${bank(f.institution) ? ` · ${bank(f.institution)}` : ''}`}
        />
      ))}
      <span className="font-mono text-[11px] text-ink-400">
        Remove {files.length === 1 ? 'this file' : 'these files'} to save{' '}
        {thing.name}&apos;s buys.
      </span>
    </div>
  )
}

function OtherFile({
  intakeId,
  title,
  where,
}: {
  intakeId: Id<'intakes'>
  title: string
  where: string
}) {
  const discard = useMutation(api.intake.discard)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  return (
    <div
      data-testid="buys-other-file"
      className="motion-land flex items-center gap-3 rounded-[14px] bg-state-warn/[0.07] px-3.5 py-3 ring-1 ring-state-warn/35 ring-inset"
    >
      <TriangleAlert className="motion-pulse size-4 shrink-0 text-state-warn" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13.5px] text-foreground">{title}</span>
        <span className="font-mono text-[11px] text-ink-400">
          {error ? 'Not removed — try again.' : where}
        </span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          setError(false)
          discard({ intakeId })
            .catch(() => setError(true))
            .finally(() => setBusy(false))
        }}
        className="motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] text-state-warn uppercase ring-1 ring-state-warn/40 ring-inset disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <X className="size-3.5" />
        )}
        {busy ? 'removing…' : 'remove'}
      </button>
    </div>
  )
}

function Sum({
  label,
  value,
  veiled = false,
  children,
}: {
  label: string
  value: string
  veiled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] bg-lift/[0.04] px-3 py-2.5">
      <span className="label-caps">{label}</span>
      <span className="text-[19px] font-light text-foreground tabular-nums">
        {veiled ? <Veiled>{value}</Veiled> : value}
      </span>
      <span className="label-caps">{children}</span>
    </div>
  )
}

/** The saved screen's words for the thing, its line, and where this
    save's buys sit — read from the trades its files wrote, never from
    the file's count (14 Oct: "9 buys saved" while all nine sat on
    another thing). */
export function useBuysLanded(batchId: Id<'batches'>) {
  const thing = useBuysFor()
  const read = useQuery(
    api.intake.batchBuys,
    thing === null ? 'skip' : { batchId },
  )
  const landed = useQuery(
    api.buysLanded.batch,
    thing === null ? 'skip' : { batchId },
  )
  if (thing === null) return null
  const check =
    read === undefined
      ? undefined
      : buysCheck(read, thing.saved, thing.symbols, thing.held)
  const where =
    landed === undefined ? undefined : landedSplit(landed, thing.symbols)
  return { thing, check, where }
}

/** Each buy: a badge, what it was for, the units and the day. */
function BuyRows({
  rows,
  thing,
}: {
  rows: ReturnType<typeof buysCheck>['rows']
  thing: BuysFor
}) {
  return (
    <div className="flex flex-col">
      {rows.map((r, i) => (
        <div
          key={`${r.occurredAt}:${i}`}
          data-testid="buys-row"
          style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
          className={`motion-arrive grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border-t border-lift/6 py-2.5 first:border-t-0 ${r.had ? 'opacity-50' : ''}`}
        >
          <span
            className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${r.side === 'sell' ? 'bg-state-danger/14 text-state-danger' : 'bg-state-good/14 text-state-good'}`}
          >
            {r.side}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5 font-mono">
            <span className="text-[13.5px] text-foreground">
              <Veiled>
                {r.eur === null ? thing.amount(r.shares) : euros(r.eur)}
              </Veiled>
            </span>
            <span className="truncate text-[10.5px] text-ink-500">
              <Veiled>{thing.amount(r.shares)}</Veiled>
              {r.currency === 'EUR' ? ` at ${euros(r.price)}` : ''}
            </span>
          </span>
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] uppercase ${r.had ? 'bg-lift/[0.05] text-ink-400' : 'bg-state-good/12 text-state-good'}`}
          >
            {r.had ? 'already saved' : 'new'}
          </span>
          <span className="font-mono text-[11px] text-ink-400">
            {DAY.format(new Date(r.occurredAt))}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The saved screen, said of the thing: its icon, how many buys went
    in and what they come to, the units beside what is held, and the
    buys themselves — no account card, no "rows" to open (14 Oct: "no
    icon, bland … rows I clicked and see nothing"). */
export function BuysSaved({
  thing,
  check,
  warn = false,
}: {
  thing: BuysFor
  check: ReturnType<typeof buysCheck> | undefined
  /** Some of the save sits on another thing: this card is not the news. */
  warn?: boolean
}) {
  const r = thing.since
  const amount = thing.paid ?? r?.buyEur ?? null
  const chip =
    'rounded-full bg-lift/[0.06] px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-ink-300 uppercase'
  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <div
        data-testid="buys-saved-card"
        className={`motion-arrive flex items-center gap-3.5 rounded-[16px] px-4 py-3.5 ring-1 ring-inset ${warn ? 'bg-lift/[0.035] ring-lift/8' : 'bg-state-good/[0.06] ring-state-good/30'}`}
      >
        <TickerLogo {...thing.logo} size={44} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-[17px] text-foreground">
            {thing.name}
          </span>
          {r ? (
            <span className="flex flex-wrap gap-1.5">
              <span className={chip}>
                paid · {r.buys} buy{r.sells > 0 ? ` · ${r.sells} sell` : ''}
              </span>
              <span className={chip}>since {DAY.format(new Date(r.from))}</span>
            </span>
          ) : null}
        </div>
        <span className="text-[22px] leading-tight text-foreground tabular-nums">
          {amount === null ? '—' : <Veiled>{euros(amount)}</Veiled>}
        </span>
      </div>
      {check && !warn ? (
        <>
          <BuysLine check={check} thing={thing} />
          {thing.trades}
        </>
      ) : null}
    </div>
  )
}
