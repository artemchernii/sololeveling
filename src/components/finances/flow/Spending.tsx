import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'
import { ChevronRight } from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { PILL_QUIET } from '@/components/finances/bits'
import { Sheet } from '@/components/finances/Sheet'
import { SkeletonRows } from '@/components/Skeleton'
import { Veiled } from '@/components/finances/Veil'
import { SPEND_CATEGORIES, categoryLabel } from '@/lib/money'
import { PayeeMark, PayeeName, WhoIsThis, usePayees } from './Payees'
import type { Who } from './Payees'
import { dayMonth, eur, monthName } from './time'

type Detail = FunctionReturnType<typeof api.aggregate.payMonthDetail>
type Row = Detail['groups'][number]['rows'][number]

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
    const part = who(b.row).partOf
    const into = part
      ? billItems.find((x) => x.kind === 'parts' && x.name === part)
      : undefined
    if (into && into.kind === 'parts') into.bills.push(b)
    else if (part) billItems.push({ kind: 'parts', name: part, bills: [b] })
    else billItems.push({ kind: 'one', b })
  }

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

      <Suggestions onDone={setNotice} onOwn={(row) => name(row)()} />

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
                  sub={`${dayMonth(item.b.row.t)} · ${account(item.b.row.accountId)?.name ?? '—'} · ✓ paid`}
                  account={account(item.b.row.accountId)}
                  onName={name(item.b.row)}
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
                  sub={`${dayMonth(item.bills[0].row.t)} · ${account(item.bills[0].row.accountId)?.name ?? '—'} · ✓ paid`}
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
                          group={
                            <GroupPick
                              row={r}
                              onMoved={(n, to) =>
                                setNotice(
                                  `${who(r).name}: ${n} row${n === 1 ? '' : 's'} moved to ${categoryLabel('expense', to)} — and the next ones too.`,
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

/** A bill shows his payee name when he gave one, else the bill's own. */
function billWho(w: Who, billName: string): Who {
  return w.source === 'yours'
    ? w
    : {
        ...w,
        name: billName,
        original: w.original ?? (billName !== w.name ? w.name : null),
      }
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

function RowLine({
  row,
  who,
  sub,
  account,
  income,
  onName,
  group,
}: {
  row: Row
  who: Who
  sub: string
  account?: Doc<'accounts'>
  income?: boolean
  onName?: () => void
  /** The group chip, for a day-to-day row. */
  group?: React.ReactNode
}) {
  return (
    <div className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-b border-lift/4 px-1 py-2.5">
      <PayeeMark who={who} account={account} />
      <span className="min-w-0">
        <PayeeName who={who} onName={onName} />
        {who.original ? (
          <span className="block truncate text-[12px] text-ink-400">
            {who.original}
          </span>
        ) : null}
        <span className="block font-mono text-[10.5px] text-ink-500">
          {sub}
        </span>
        {group}
        {row.raw && row.raw !== who.name && row.raw !== who.original ? (
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
    </div>
  )
}

/** One thing made of several bills (Mortgage): one line, opening into its parts. */
function Parts({
  name,
  open,
  onToggle,
  total,
  sub,
  account,
  children,
}: {
  name: string
  open: boolean
  onToggle: () => void
  total: number
  sub: string
  account?: Doc<'accounts'>
  children: React.ReactNode
}) {
  const count = Array.isArray(children) ? children.length : 1
  return (
    <div className="border-b border-lift/4">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] px-1 py-2.5 text-left transition-colors hover:bg-lift/[0.035]"
      >
        <PayeeMark
          who={{
            key: name,
            name,
            original: null,
            domain: null,
            partOf: null,
            source: null,
          }}
          account={account}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-[14px]">
            {name}
            <ChevronRight
              className={`size-3.5 text-ink-500 transition-transform ${open ? 'rotate-90' : ''}`}
            />
            <span className="rounded-[5px] bg-lav-400/10 px-1.5 py-px font-mono text-[9px] tracking-[0.12em] text-lav-300 uppercase ring-1 ring-lav-400/25 ring-inset">
              {count} parts
            </span>
          </span>
          <span className="block font-mono text-[10.5px] text-ink-500">
            {sub}
          </span>
        </span>
        <span className="font-mono">
          <Veiled>−{eur(total, true)}</Veiled>
        </span>
      </button>
      {open ? (
        <div className="motion-arrive mb-2 ml-2.5 border-l border-lift/8 pl-3">
          {children}
        </div>
      ) : null}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <span className="py-3 text-[13px] text-ink-500">{children}</span>
}

/* What the app can say plainly: Portuguese bank phrases it knows, as one
   tap each (the mockup's "suggested names"). MY OWN opens Who is this. */
function Suggestions({
  onDone,
  onOwn,
}: {
  onDone: (s: string) => void
  onOwn: (row: Row) => void
}) {
  const list = useQuery(api.payees.suggestions, {})
  const set = useMutation(api.payees.set)
  const [open, setOpen] = useState(true)
  if (!list || list.length === 0) return null
  return (
    <div className="flex flex-col gap-2 rounded-[16px] bg-lav-400/5 p-3 ring-1 ring-lav-400/25 ring-inset">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="label-caps flex items-center gap-2 text-left text-lav-300"
      >
        the app can say {list.length === 1 ? 'this' : `these ${list.length}`}{' '}
        plainly
        <ChevronRight
          className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open
        ? list.map((s) => (
            <div
              key={s.key}
              className="motion-arrive grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-lift/6 pt-2"
            >
              <span className="min-w-0">
                <span className="block truncate font-mono text-[11px] text-ink-500">
                  {s.raw}
                </span>
                <span className="text-[14px]">→ {s.name}?</span>
                {s.partOf ? (
                  <span className="ml-2 font-mono text-[10.5px] text-ink-500">
                    part of {s.partOf}
                  </span>
                ) : null}
              </span>
              <span className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    void set({
                      logId: s.logId,
                      name: s.name,
                      domain: null,
                      category: s.category,
                      partOf: s.partOf,
                    }).then((n) => {
                      onDone(
                        `${s.name} — ${n} row${n === 1 ? '' : 's'} named, and the next ones too.`,
                      )
                    })
                  }
                  className="rounded-full bg-lav-400/18 px-3.5 py-1.5 font-mono text-[11px] tracking-[0.1em] ring-1 ring-lav-400/45 ring-inset"
                >
                  YES
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onOwn({
                      id: s.logId,
                      t: 0,
                      name: s.raw,
                      amount: 0,
                      raw: s.raw,
                      category: s.category,
                      accountId: undefined,
                    })
                  }
                  className="rounded-full px-3 py-1.5 font-mono text-[11px] tracking-[0.1em] text-ink-400 ring-1 ring-lift/12 ring-inset"
                >
                  MY OWN
                </button>
              </span>
            </div>
          ))
        : null}
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
