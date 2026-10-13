import { createContext, useContext } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Check, TriangleAlert } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Veiled } from '@/components/finances/Veil'
import { buysCheck } from '@/lib/addBuys'
import type { SavedTrade } from '@/lib/addBuys'
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
  saved: ReadonlyArray<SavedTrade>
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

/** The units the buys reach beside the units held: a state, said with
    its colour, its icon and a pulse — never grey words. */
export function BuysLine({
  check,
  thing,
}: {
  check: Pick<ReturnType<typeof buysCheck>, 'state' | 'missing'>
  thing: BuysFor
}) {
  const ok = check.state === 'reaches'
  return (
    <div
      data-testid="buys-line"
      className={`motion-land flex items-center gap-2.5 rounded-[14px] px-3.5 py-3 text-[13.5px] ring-1 ring-inset ${ok ? 'bg-state-good/[0.06] text-state-good ring-state-good/30' : 'bg-state-warn/[0.07] text-state-warn ring-state-warn/35'}`}
    >
      {ok ? (
        <Check className="size-4 shrink-0" />
      ) : (
        <TriangleAlert className="motion-pulse size-4 shrink-0" />
      )}
      <span className="text-ink-100">
        {ok ? (
          'The buys reach what is held.'
        ) : check.state === 'missing' ? (
          <>
            <Veiled>{thing.amount(check.missing)}</Veiled> of what is held is
            not in the buys — older ones are missing.
          </>
        ) : (
          <>
            The buys are <Veiled>{thing.amount(-check.missing)}</Veiled> more
            than is held.
          </>
        )}
      </span>
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
      <div className="grid gap-2.5 sm:grid-cols-3">
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
        <Sum label="held" value={thing.amount(c.held)} veiled>
          {`${thing.amount(c.units)} in the buys`}
        </Sum>
      </div>
      <BuysLine check={c} thing={thing} />
      {c.others > 0 ? (
        <p className="font-mono text-[11px] text-state-warn">
          {c.others} {c.others === 1 ? 'row is' : 'rows are'} for something
          else, not {thing.name}.
        </p>
      ) : null}
      <div className="flex flex-col">
        {c.rows.map((r, i) => (
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

/** The saved screen's words for the thing, and its line. */
export function useBuysLanded(batchId: Id<'batches'>) {
  const thing = useBuysFor()
  const read = useQuery(
    api.intake.batchBuys,
    thing === null ? 'skip' : { batchId },
  )
  if (thing === null) return null
  const check =
    read === undefined
      ? undefined
      : buysCheck(read, thing.saved, thing.symbols, thing.held)
  return { thing, check }
}
