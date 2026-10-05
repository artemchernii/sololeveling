import { useEffect, useState } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'
import { ChevronRight } from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { PILL_QUIET } from '@/components/finances/bits'
import { Sheet } from '@/components/finances/Sheet'
import { SkeletonRows } from '@/components/Skeleton'
import { Veiled } from '@/components/finances/Veil'
import { PaidChip } from '@/components/finances/GroupBadge'
import { LENT, categoryLabel } from '@/lib/money'
import { bankPhrase } from '@/lib/payees'
import { PayeeMark, WhoIsThis, usePayees } from './Payees'
import { Empty, Parts, RowLine, Section, billWho } from './SpendingParts'
import type { Row } from './SpendingParts'
import type { Who } from './Payees'
import { dayMonth, eur, monthName } from './time'

type Detail = FunctionReturnType<typeof api.aggregate.payMonthDetail>

/* SPENDING (4 Oct; mockups flow-spending.html and payees.html). His words:
   "Bills, daytoday I would love to see those exactly values and where they
   come from." The pay month opened: every bill — one thing made of parts
   (Mortgage) shown as one line that opens — and the ones still to pay;
   day-to-day by group, each opening its rows, last month's figure beside
   it; the money in. Every row says who it is in his words, the bank's
   own name underneath, and its name opens "Who is this?". */
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
  const { who, parts } = usePayees()
  const [openGroup, setOpenGroup] = useState<Record<string, boolean>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [naming, setNaming] = useState<{
    row: Row
    who: Who
    category: string | null
  } | null>(null)
  const account = (id?: Id<'accounts'>) => accounts.find((a) => a._id === id)
  const name = (row: Row) => () =>
    setNaming({ row, who: who(row), category: row.category ?? null })

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

  /* Bills that are parts of one thing (Mortgage) fold into it. */
  const billItems: Array<
    | { kind: 'one'; b: Detail['bills'][number] }
    | { kind: 'parts'; name: string; bills: Array<Detail['bills'][number]> }
  > = []
  for (const b of d?.bills ?? []) {
    /* His "part of", else what the bank's words say (the mortgage). */
    const part =
      who(b.row).partOf ?? bankPhrase(b.row.raw ?? '')?.partOf ?? null
    const into = part
      ? billItems.find((x) => x.kind === 'parts' && x.name === part)
      : undefined
    if (into && into.kind === 'parts') into.bills.push(b)
    else if (part) billItems.push({ kind: 'parts', name: part, bills: [b] })
    else billItems.push({ kind: 'one', b })
  }

  /** What a group change says, by where the row went. */
  const moved = (r: Row) => (n: number, to: string) =>
    setNotice(
      to === LENT
        ? `${who(r).name}: lent — out of spending. The money back is found by itself.`
        : to === 'subscriptions'
          ? `${who(r).name}: a bill now — every month, in Future balance.`
          : `${who(r).name}: ${n} row${n === 1 ? '' : 's'} moved to ${categoryLabel('expense', to)} — and the next ones too.`,
    )

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

      {notice ? (
        <p className="motion-arrive -my-2 flex items-center gap-2 text-[13px] text-ink-300">
          <span className="rounded-full bg-state-good/12 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-state-good uppercase">
            done
          </span>
          {notice}
        </p>
      ) : null}

      {d === undefined ? (
        <SkeletonRows rows={8} twoLine />
      ) : (
        <>
          <Section
            title={`bills · ${d.bills.length} paid${d.todo.length ? ` · ${d.todo.length} to pay` : ''}`}
            sum={`−${eur(billsSum)}`}
            tone="text-state-danger"
          >
            {billItems.map((item) =>
              item.kind === 'one' ? (
                <RowLine
                  key={item.b.row.id}
                  row={item.b.row}
                  who={billWho(who(item.b.row), item.b.billName)}
                  sub={`${dayMonth(item.b.row.t)} · ${account(item.b.row.accountId)?.name ?? '—'}${
                    item.b.everyMonths && item.b.everyMonths > 1
                      ? ` · covers ${item.b.everyMonths} months, ${eur(item.b.row.amount / item.b.everyMonths, true)} a month`
                      : ''
                  }`}
                  account={account(item.b.row.accountId)}
                  onName={name(item.b.row)}
                  onMoved={moved(item.b.row)}
                  status={<PaidChip />}
                />
              ) : (
                <Parts
                  key={item.name}
                  name={item.name}
                  open={openGroup[`part:${item.name}`] ?? false}
                  onToggle={() =>
                    setOpenGroup({
                      ...openGroup,
                      [`part:${item.name}`]: !(
                        openGroup[`part:${item.name}`] ?? false
                      ),
                    })
                  }
                  total={item.bills.reduce((n, b) => n + b.row.amount, 0)}
                  sub={`${dayMonth(item.bills[0].row.t)} · ${account(item.bills[0].row.accountId)?.name ?? '—'}`}
                  account={account(item.bills[0].row.accountId)}
                >
                  {item.bills.map((b) => (
                    <RowLine
                      key={b.row.id}
                      row={b.row}
                      who={billWho(who(b.row), b.billName)}
                      sub={dayMonth(b.row.t)}
                      account={account(b.row.accountId)}
                      onName={name(b.row)}
                      onMoved={moved(b.row)}
                    />
                  ))}
                </Parts>
              ),
            )}
            {d.todo.map((x) => (
              <div
                key={`${x.billId}-${x.t}`}
                className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] bg-state-warn/7 px-1 py-2.5"
              >
                <PayeeMark
                  who={who({ name: x.name })}
                  account={account(x.accountId)}
                />
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
                          who={who(r)}
                          sub={`${dayMonth(r.t)} · ${account(r.accountId)?.name ?? '—'}`}
                          account={account(r.accountId)}
                          onName={name(r)}
                          onMoved={moved(r)}
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
                who={
                  m.salary
                    ? {
                        ...who(m.row),
                        name: 'Salary',
                        original: m.row.name,
                        source: null,
                      }
                    : who(m.row)
                }
                sub={`${dayMonth(m.row.t)} · ${account(m.row.accountId)?.name ?? '—'}`}
                account={account(m.row.accountId)}
                income
              />
            ))}
            {d.moneyIn.length === 0 ? <Empty>Nothing in yet.</Empty> : null}
          </Section>

          {/* Lent and paid back (4 Oct): money that left and came back,
              in no sum above — said here so nothing goes missing. */}
          {d.lent.length ? (
            <Section
              title="lent · not spending, not money in"
              sum={(() => {
                const out = d.lent
                  .filter((x) => x.kind === 'expense')
                  .reduce((n, x) => n + x.row.amount, 0)
                const back = d.lent
                  .filter((x) => x.kind === 'income')
                  .reduce((n, x) => n + x.row.amount, 0)
                return out - back > 0.005
                  ? `${eur(out - back)} still out`
                  : 'all back'
              })()}
              tone="text-ink-300"
            >
              {d.lent.map((x) => (
                <RowLine
                  key={x.row.id}
                  row={x.row}
                  who={who(x.row)}
                  sub={`${dayMonth(x.row.t)} · ${account(x.row.accountId)?.name ?? '—'} · ${x.kind === 'expense' ? 'lent' : 'paid back'}`}
                  account={account(x.row.accountId)}
                  income={x.kind === 'income'}
                  onName={name(x.row)}
                  onMoved={x.kind === 'expense' ? moved(x.row) : undefined}
                />
              ))}
            </Section>
          ) : null}
        </>
      )}

      <Sheet
        open={naming !== null}
        title="who is this?"
        onClose={() => setNaming(null)}
      >
        {naming ? (
          <WhoIsThis
            key={naming.row.id}
            row={naming.row}
            who={naming.who}
            category={naming.category}
            parts={parts}
            onDone={(n, called) => {
              setNaming(null)
              setNotice(
                `${called} — ${n} row${n === 1 ? '' : 's'} named, and the next ones too.`,
              )
            }}
          />
        ) : null}
      </Sheet>
    </section>
  )
}
