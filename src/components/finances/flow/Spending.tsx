import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'
import { ChevronRight } from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { FIELD, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { Sheet } from '@/components/finances/Sheet'
import { SkeletonRows } from '@/components/Skeleton'
import { Veiled } from '@/components/finances/Veil'
import { failureMessage } from '@/lib/convex-errors'
import { SPEND_CATEGORIES, categoryLabel } from '@/lib/money'
import { dayMonth, eur, monthName } from './time'

type Row = FunctionReturnType<
  typeof api.aggregate.payMonthDetail
>['groups'][number]['rows'][number]

/* SPENDING (4 Oct; mockup design/treasury-mockup/flow-spending.html). His
   words: "Bills, daytoday I would love to see those exactly values and
   where they come from." The pay month opened: every bill paid, with the
   line the bank wrote, and the ones still to pay; day-to-day by group,
   biggest first, each opening its rows, last month's figure beside it;
   the money in. The same rows aggregate.payMonth sums. */
export function Spending({
  today,
  accounts,
  open,
}: {
  today: number
  accounts: ReadonlyArray<Doc<'accounts'>>
  /** "2026-08": a month asked for in the URL — its pay month opens. */
  open?: string
}) {
  const p = useQuery(api.aggregate.payMonth, { today })
  const months = p ? [...p.past, p.current] : []
  const [picked, setPicked] = useState<number | null>(null)
  useEffect(() => {
    if (!open || !p) return
    const [y, m] = open.split('-').map(Number)
    const mid = Date.UTC(y, m - 1, 15, 12)
    const i = [...p.past, p.current].findIndex(
      (x) => x.start <= mid && mid < x.end,
    )
    if (i !== -1) setPicked(i)
  }, [open, p])
  const at = picked ?? months.length - 1
  const month = months.at(at)
  const prev = at > 0 ? months.at(at - 1) : undefined
  const d = useQuery(
    api.aggregate.payMonthDetail,
    month
      ? {
          start: month.start,
          end: month.end,
          prev: prev ? { start: prev.start, end: prev.end } : null,
          today,
        }
      : 'skip',
  )
  const [openGroup, setOpenGroup] = useState<Record<string, boolean>>({})
  const [moved, setMoved] = useState<string | null>(null)
  const [naming, setNaming] = useState<{
    id: Id<'recurring'>
    name: string
    raw?: string
  } | null>(null)
  const account = (id?: Id<'accounts'>) => accounts.find((a) => a._id === id)

  if (p === undefined) {
    return (
      <section className="glass rounded-[22px] p-4 sm:p-5">
        <SkeletonRows rows={6} />
      </section>
    )
  }
  if (p === null || !month) {
    return (
      <section className="glass motion-arrive rounded-[22px] p-4 sm:p-5">
        <span className="system-title">[ WHERE IT WENT ]</span>
        <p className="py-6 text-center text-[13.5px] leading-relaxed text-ink-400">
          Spending is shown by pay month, salary to salary. It appears once your
          salary is found in a statement.
        </p>
      </section>
    )
  }

  const billsSum = d?.bills.reduce((n, b) => n + b.row.amount, 0) ?? 0
  const daySum = d?.groups.reduce((n, g) => n + g.sum, 0) ?? 0
  const inSum = d?.moneyIn.reduce((n, m) => n + m.row.amount, 0) ?? 0
  const max = Math.max(1, ...(d?.groups.map((g) => g.sum) ?? []))
  const now = at === months.length - 1

  return (
    <section className="glass motion-arrive flex flex-col gap-5 rounded-[22px] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="system-title">
          [ WHERE IT WENT · {dayMonth(month.start)} → {now ? '~' : ''}
          {dayMonth(month.end)} ]
        </span>
        <span className="flex flex-wrap gap-1.5">
          {months.map((m, i) => (
            <button
              key={m.start}
              type="button"
              onClick={() => setPicked(i)}
              className={`${PILL_QUIET} ${i === at ? 'bg-lav-400/16 text-foreground ring-lav-400/45' : ''}`}
            >
              {monthName(m.start)} pay{i === months.length - 1 ? ' · now' : ''}
            </button>
          ))}
        </span>
      </div>

      {d === undefined ? (
        <SkeletonRows rows={8} twoLine />
      ) : (
        <>
          <Section
            title={`bills · ${d.bills.length} paid${d.todo.length ? ` · ${d.todo.length} to pay` : ''}`}
            sum={`−${eur(billsSum)}`}
            tone="text-state-danger"
          >
            {d.bills.map((b) => (
              <RowLine
                key={b.row.id}
                row={b.row}
                name={b.billName}
                sub={`${dayMonth(b.row.t)} · ${account(b.row.accountId)?.name ?? '—'} · ✓ paid · tap to rename`}
                account={account(b.row.accountId)}
                onClick={() =>
                  setNaming({ id: b.billId, name: b.billName, raw: b.row.raw })
                }
              />
            ))}
            {d.todo.map((x) => (
              <div
                key={`${x.billId}-${x.t}`}
                className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] bg-state-warn/7 px-1 py-2.5"
              >
                <Logo a={account(x.accountId)} />
                <span className="min-w-0">
                  <span className="block truncate text-[14px]">{x.name}</span>
                  <span className="block font-mono text-[10.5px] text-state-warn">
                    {dayMonth(x.t)} · still to pay
                  </span>
                </span>
                <span className="font-mono text-state-warn">
                  <Veiled>−{eur(x.amount, true)}</Veiled>
                </span>
              </div>
            ))}
            {d.bills.length + d.todo.length === 0 ? (
              <Empty>No bills this pay month.</Empty>
            ) : null}
          </Section>

          {moved ? (
            <p className="motion-arrive -mb-2 flex items-center gap-2 text-[13px] text-ink-300">
              <span className="rounded-full bg-state-good/12 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-state-good uppercase">
                done
              </span>

              {moved}
            </p>
          ) : null}

          <Section
            title="day-to-day · biggest first · tap a group"
            sum={`−${eur(daySum)}`}
            tone="text-state-danger"
          >
            {d.groups.map((g) => {
              const k = g.category ?? ''
              const isOpen = openGroup[k] ?? false
              return (
                <div key={k} className="border-b border-lift/5">
                  <button
                    type="button"
                    onClick={() => setOpenGroup({ ...openGroup, [k]: !isOpen })}
                    className="grid w-full grid-cols-[minmax(0,1fr)_70px_auto_16px] items-center gap-3.5 rounded-[8px] px-1 py-2.5 text-left transition-colors hover:bg-lift/[0.03] sm:grid-cols-[minmax(0,1fr)_140px_auto_16px]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14.5px]">
                        {categoryLabel('expense', g.category)}
                      </span>
                      <span className="block font-mono text-[10.5px] text-ink-500">
                        {g.rows.length} payment{g.rows.length === 1 ? '' : 's'}
                        {g.last !== null ? (
                          <>
                            {' · last month '}
                            <Veiled>{eur(g.last)}</Veiled>
                          </>
                        ) : null}
                      </span>
                    </span>
                    <span className="h-[7px] overflow-hidden rounded-full bg-lift/6">
                      <span
                        className="motion-arrive block h-full rounded-full bg-money-cash"
                        style={{ width: `${(g.sum / max) * 100}%` }}
                      />
                    </span>
                    <span className="text-right font-mono whitespace-nowrap">
                      <Veiled>−{eur(g.sum, true)}</Veiled>
                    </span>
                    <ChevronRight
                      className={`size-4 text-ink-500 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {isOpen ? (
                    <div className="motion-arrive mb-2 ml-2.5 border-l border-lift/8 pl-3">
                      {g.rows.map((r) => (
                        <RowLine
                          key={r.id}
                          row={r}
                          name={r.name}
                          sub={`${dayMonth(r.t)} · ${account(r.accountId)?.name ?? '—'}`}
                          account={account(r.accountId)}
                          group={
                            <GroupPick
                              row={r}
                              onMoved={(n, to) =>
                                setMoved(
                                  `${r.name}: ${n} row${n === 1 ? '' : 's'} moved to ${categoryLabel('expense', to)} — and the next ones too.`,
                                )
                              }
                            />
                          }
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })}
            {d.groups.length === 0 ? (
              <Empty>Nothing spent yet this pay month.</Empty>
            ) : null}
          </Section>

          <Section
            title="money in"
            sum={`+${eur(inSum)}`}
            tone="text-state-good"
          >
            {d.moneyIn.map((m) => (
              <RowLine
                key={m.row.id}
                row={m.row}
                name={m.salary ? 'Salary' : m.row.name}
                sub={`${dayMonth(m.row.t)} · ${account(m.row.accountId)?.name ?? '—'}`}
                account={account(m.row.accountId)}
                income
              />
            ))}
            {d.moneyIn.length === 0 ? <Empty>Nothing in yet.</Empty> : null}
          </Section>
        </>
      )}

      <Sheet
        open={naming !== null}
        title="the bill's name"
        onClose={() => setNaming(null)}
      >
        {naming ? (
          <Rename
            key={naming.id}
            bill={naming}
            onDone={() => setNaming(null)}
          />
        ) : null}
      </Sheet>
    </section>
  )
}

function Section({
  title,
  sum,
  tone,
  children,
}: {
  title: string
  sum: string
  tone: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between border-b border-lift/10 pb-2">
        <span className="label-caps text-ink-300">{title}</span>
        <span className={`text-[26px] font-light tabular-nums ${tone}`}>
          <Veiled>{sum}</Veiled>
        </span>
      </div>
      {children}
    </div>
  )
}

function Logo({ a }: { a?: Doc<'accounts'> }) {
  return a ? (
    <AccountLogo name={a.name} domain={a.domain} size={24} />
  ) : (
    <span />
  )
}

function RowLine({
  row,
  name,
  sub,
  account,
  income,
  onClick,
  group,
}: {
  row: Row
  name: string
  sub: string
  account?: Doc<'accounts'>
  income?: boolean
  onClick?: () => void
  /** The group chip, for a day-to-day row. */
  group?: React.ReactNode
}) {
  const body = (
    <>
      <Logo a={account} />
      <span className="min-w-0">
        <span className="block truncate text-[14px]">{name}</span>
        <span className="block font-mono text-[10.5px] text-ink-500">
          {sub}
        </span>
        {group}
        {row.raw && row.raw !== name ? (
          <span className="block truncate font-mono text-[10px] text-ink-600">
            {row.raw}
          </span>
        ) : null}
      </span>
      <span className={`font-mono ${income ? 'text-state-good' : ''}`}>
        <Veiled>
          {income ? '+' : '−'}
          {eur(row.amount, true)}
        </Veiled>
      </span>
    </>
  )
  const cls =
    'grid w-full grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 border-b border-lift/4 px-1 py-2.5 text-left'
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${cls} rounded-[8px] transition-colors hover:bg-lift/[0.035]`}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="py-3 text-[13px] text-ink-500">{children}</span>
}

/* His name for a bill: "Mortgage · interest" rather than what the bank
   printed. Once renamed it is his, and the app never renames it. */
function Rename({
  bill,
  onDone,
}: {
  bill: { id: Id<'recurring'>; name: string; raw?: string }
  onDone: () => void
}) {
  const rename = useMutation(api.recurring.rename)
  const [name, setName] = useState(bill.name)
  const [error, setError] = useState<string | null>(null)
  async function save() {
    try {
      await rename({ id: bill.id, name })
      onDone()
    } catch (e) {
      setError(failureMessage(e) ?? 'It did not save.')
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {bill.raw ? (
        <span className="font-mono text-[11px] text-ink-500">
          the bank wrote: {bill.raw}
        </span>
      ) : null}
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
        }}
        aria-label="Bill name"
        className={FIELD}
      />
      <button
        type="button"
        onClick={() => void save()}
        className={`${PILL_LOUD} self-start`}
      >
        save
      </button>
      {error ? (
        <span className="text-[12.5px] text-state-danger">{error}</span>
      ) : null}
    </div>
  )
}

/* The group a payee is filed in, changed where it is seen (4 Oct: "I see
   unsorted… shopping last month includes fuel"). The app's own list, not
   a browser picker; the choice moves every row of the payee and is
   remembered for the next statements. */
function GroupPick({
  row,
  onMoved,
}: {
  row: Row
  onMoved: (n: number, to: string) => void
}) {
  const refile = useMutation(api.logs.refile)
  const [open, setOpen] = useState(false)
  const now = row.category ?? null
  return (
    <span className="mt-1 block">
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') setOpen(!open)
        }}
        className={`cursor-pointer rounded-[5px] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.12em] uppercase ring-1 ring-inset ${
          now
            ? 'bg-lav-400/10 text-lav-300 ring-lav-400/25'
            : 'bg-state-warn/12 text-state-warn ring-state-warn/30'
        }`}
      >
        {now ? categoryLabel('expense', now) : 'unsorted'} · change
      </span>
      {open ? (
        <span className="motion-arrive mt-1.5 flex flex-wrap gap-1">
          {SPEND_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setOpen(false)
                if (c.id === now) return
                void refile({ logId: row.id, category: c.id }).then((n) => {
                  onMoved(n, c.id)
                })
              }}
              className={`rounded-full px-2.5 py-1 text-[12px] ring-1 ring-inset transition-colors ${
                c.id === now
                  ? 'bg-lav-400/14 text-foreground ring-lav-400/45'
                  : 'text-ink-300 ring-lift/12 hover:text-foreground hover:ring-lift/25'
              }`}
            >
              {c.label}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  )
}
