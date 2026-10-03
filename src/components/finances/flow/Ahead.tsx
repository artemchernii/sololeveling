import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'
import { Plus } from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { PILL_QUIET } from '@/components/finances/bits'
import { Sheet } from '@/components/finances/Sheet'
import { SkeletonRows } from '@/components/Skeleton'
import { Veiled } from '@/components/finances/Veil'
import { categoryLabel } from '@/lib/money'
import { AheadChart } from './AheadChart'
import { AddBill } from './AddBill'
import { daysBetween, eur, monthName, weekday } from './time'

type AheadData = FunctionReturnType<typeof api.aggregate.ahead>
type Event = AheadData['events'][number]
type Done = AheadData['done'][number]

export type Notice = { text: string; undo: (() => void) | null } | null

/* AHEAD (journey step 3 and 8; his words: "important thing is to show
   future spendings, especially reoccurring"). The line first, then every
   bill on its day: this month in full — paid ✓ with the row that paid it,
   still to come — later months folded to what differs (a yearly bill, an
   account short on the day). Found bills arrive with no question, tagged
   NEW for a week, and look like any other bill (4 Oct: "× not a bill" on
   his salary and Anthropic was insulting); tap one for the payments it
   was found from, and to stop it there. Beside it: free cash, day-to-day
   spending as real sums, and his bills as a month. */
export function Ahead({
  a,
  today,
  accounts,
  notice,
  onNotice: setNotice,
}: {
  a: AheadData | undefined
  today: number
  accounts: ReadonlyArray<Doc<'accounts'>>
  notice: Notice
  onNotice: (n: Notice) => void
}) {
  const [only, setOnly] = useState(false)
  const [open, setOpen] = useState<Record<number, boolean>>({})
  const [adding, setAdding] = useState(false)
  const [year, setYear] = useState(false)
  const [opened, setOpened] = useState<Id<'recurring'> | null>(null)
  const notBill = useMutation(api.recurring.notBill)
  const unrefuse = useMutation(api.recurring.unrefuse)

  if (a === undefined) {
    return (
      <section className="system-frame relative p-4 sm:p-5">
        <SkeletonRows rows={5} twoLine />
      </section>
    )
  }
  const account = (id?: Id<'accounts'>) => accounts.find((x) => x._id === id)
  const bill = (id: Id<'recurring'>) => a.bills.find((b) => b.id === id)
  const outs = a.events.filter((e) => e.kind === 'expense')
  const shorts = a.events.filter((e) => e.short)
  const thisMonth = new Date(today).getMonth()
  const monthKey = (t: number) =>
    new Date(t).getFullYear() * 12 + new Date(t).getMonth()
  const months = [...new Set(a.events.map((e) => monthKey(e.t)))]
  const nothing = a.bills.length === 0

  function stop(id: Id<'recurring'>, name: string) {
    void notBill({ id })
    setOpened(null)
    setNotice({
      text: `${name} is off AHEAD and will not be found again.`,
      undo: () => void unrefuse({ id }),
    })
  }
  /* The three full months before this one, to name one with no rows. */
  const pastStarts = [3, 2, 1].map((back) => {
    const d = new Date(today)
    return new Date(d.getFullYear(), d.getMonth() - back, 1).getTime()
  })

  const lowLine = (() => {
    const d = new Date(a.low.t)
    const when =
      daysBetween(today, a.low.t) > 0
        ? `on ${d.getDate()} ${monthName(a.low.t)}`
        : 'today'
    const value =
      only || a.range === null
        ? eur(a.low.bills)
        : `${eur(a.low.lower)}–${eur(a.low.upper)}`
    return { value, when }
  })()

  return (
    <section className="system-frame motion-arrive relative flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-3">
          <span className="system-title">[ AHEAD · next 3 months ]</span>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={PILL_QUIET}
          >
            <Plus className="size-3" />
            bill
          </button>
        </span>
        {!nothing ? (
          <span className="label-caps">
            {outs.length} payments · −
            {eur(outs.reduce((n, e) => n + e.amount, 0))}
            {shorts.length ? (
              <span className="text-state-warn">
                {' '}
                · {shorts.length} not covered on the day
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {notice ? (
        <p className="motion-arrive flex flex-wrap items-center gap-2 text-[13.5px] text-ink-300">
          <span className="rounded-full bg-state-good/12 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-state-good uppercase">
            done
          </span>
          {notice.text}
          {notice.undo ? (
            <button
              type="button"
              onClick={() => {
                notice.undo?.()
                setNotice(null)
              }}
              className="font-mono text-[11px] tracking-[0.1em] text-lav-300 uppercase hover:text-foreground"
            >
              undo
            </button>
          ) : null}
        </p>
      ) : null}

      {nothing ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center text-[13.5px] leading-relaxed text-ink-400">
          <span className="text-[16px] text-foreground">
            Nothing coming yet
          </span>
          Bills and salary are found in your statements — the same payee each
          month — and put here on their day.
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={PILL_QUIET}
          >
            <Plus className="size-3" /> a bill from your statements
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="flex min-w-0 flex-col gap-2">
            {/* Straight to the point (4 Oct: "I'm lazy… it should be
                straight to the point"): three figures, then the line. */}
            <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
              <Fact label="free cash now">
                <Veiled>{eur(a.freeTotal)}</Veiled>
              </Fact>
              <Fact label="lowest before salary" hint={lowLine.when}>
                <Veiled>{lowLine.value}</Veiled>
              </Fact>
              {a.salaryAt ? (
                <Fact label="salary">
                  {new Date(a.salaryAt).getDate()} {monthName(a.salaryAt)}
                </Fact>
              ) : null}
              {a.range !== null ? (
                <button
                  type="button"
                  aria-pressed={only}
                  onClick={() => setOnly(!only)}
                  className={`${PILL_QUIET} ml-auto ${only ? 'bg-lav-400/12 text-foreground ring-lav-400/45' : ''}`}
                >
                  only bills and salary
                </button>
              ) : null}
            </div>
            <AheadChart a={a} only={only} />
            <span className="label-caps">
              {only || a.range === null
                ? 'line: bills and salary only'
                : 'band: day-to-day spending, your cheapest month to your dearest'}
            </span>

            <div className="mt-2 flex flex-col">
              {a.done.length ? (
                <>
                  <MonthHead
                    left={`${monthName(today)} · already`}
                    right={`−${eur(
                      a.done
                        .filter((d) => d.kind === 'expense')
                        .reduce((n, d) => n + d.amount, 0),
                      true,
                    )}`}
                  />
                  {a.done.map((d) => (
                    <BillRow
                      key={`${d.billId}-${d.t}`}
                      t={d.t}
                      name={d.name}
                      kind={d.kind}
                      amount={d.amount}
                      what={bill(d.billId)?.category}
                      account={account(d.accountId)}
                      status={<DoneStatus d={d} />}
                      dim={d.rowId !== null}
                      onOpen={() => setOpened(d.billId)}
                    />
                  ))}
                </>
              ) : null}
              {months.map((m) => {
                const es = a.events.filter((e) => monthKey(e.t) === m)
                const out = es.filter((e) => e.kind === 'expense')
                const salary = es
                  .filter((e) => e.kind === 'income')
                  .reduce((n, e) => n + e.amount, 0)
                const current =
                  es[0] && new Date(es[0].t).getMonth() === thisMonth
                const full = current || open[m]
                const odd = es.filter((e) => e.yearly || e.short)
                return (
                  <div key={m} className="flex flex-col">
                    <MonthHead
                      left={`${monthName(es[0].t)} · ${current ? 'still to come' : `${out.length} payments ${full ? '▴' : '▾'}`}`}
                      right={`−${eur(
                        out.reduce((n, e) => n + e.amount, 0),
                        true,
                      )}${salary ? ` · salary +${eur(salary)}` : ''}`}
                      onClick={
                        current
                          ? undefined
                          : () => setOpen({ ...open, [m]: !open[m] })
                      }
                    />
                    {(full ? es : odd).map((e) => (
                      <BillRow
                        key={`${e.billId}-${e.t}`}
                        t={e.t}
                        name={e.name}
                        kind={e.kind}
                        amount={e.amount}
                        what={bill(e.billId)?.category}
                        account={account(e.accountId)}
                        yearly={e.yearly}
                        isNew={bill(e.billId)?.isNew}
                        short={e.short}
                        status={
                          <EventStatus
                            e={e}
                            today={today}
                            account={account(e.accountId)}
                          />
                        }
                        onOpen={() => setOpened(e.billId)}
                      />
                    ))}
                    {!full && odd.length === 0 ? (
                      <span className="label-caps px-1 py-2.5 text-ink-600">
                        the usual month — nothing new
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3.5">
            <Box
              title="free cash today"
              big={<Veiled>{eur(a.freeTotal)}</Veiled>}
            >
              {a.free.map((f) => (
                <Kv
                  key={f.accountId}
                  k={
                    <span className="flex items-center gap-2">
                      <AccountLogo name={f.name} domain={f.domain} size={18} />
                      {f.name}
                    </span>
                  }
                  v={<Veiled>{eur(f.eur, true)}</Veiled>}
                  warn={f.eur < 40}
                />
              ))}
              <span className="label-caps leading-relaxed">
                banks and cash · brokers not counted
              </span>
            </Box>
            <Box
              title="day-to-day spending"
              big={
                a.range ? (
                  <>
                    {a.range.lo === a.range.hi
                      ? eur(a.range.lo)
                      : `${eur(a.range.lo)}–${eur(a.range.hi)}`}
                    <span className="label-caps"> a month</span>
                  </>
                ) : (
                  '—'
                )
              }
            >
              <span className="text-[12.5px] leading-relaxed text-ink-400">
                What you spend that is not a bill — groceries, eating out,
                transport.{' '}
                {only ? 'Not in the line now.' : 'In the line as its range.'}
              </span>
              {pastStarts.map((start) => {
                const r = a.rest.find((x) => x.start === start)
                return (
                  <Kv
                    key={start}
                    k={monthName(start)}
                    v={r ? `−${eur(r.sum, true)}` : 'no statements'}
                  />
                )
              })}
            </Box>
            <Box title="bills each month" big={eur(a.eachMonth.total)}>
              {a.eachMonth.groups.map((g) => (
                <Kv
                  key={g.category ?? ''}
                  k={
                    <span title={g.names.join(', ')}>
                      {categoryLabel('expense', g.category)}{' '}
                      <span className="text-ink-600">· {g.names.length}</span>
                    </span>
                  }
                  v={`−${eur(g.sum, true)}`}
                />
              ))}
              {a.eachMonth.yearly.count ? (
                <Kv
                  k={`once a year · ${a.eachMonth.yearly.count}`}
                  v={`−${eur(a.eachMonth.yearly.total, true)}`}
                />
              ) : null}
              <button
                type="button"
                onClick={() => setYear(true)}
                className="text-left font-mono text-[11px] tracking-[0.1em] text-lav-300 uppercase hover:text-foreground"
              >
                what I pay this year →
              </button>
            </Box>
          </div>
        </div>
      )}

      <AddBill
        open={adding}
        accounts={accounts}
        onClose={() => setAdding(false)}
        onAdded={(n) => setNotice(n)}
      />
      <Sheet
        open={opened !== null}
        title={opened ? (bill(opened)?.name ?? 'bill') : 'bill'}
        onClose={() => setOpened(null)}
      >
        {opened ? (
          <BillSheet
            id={opened}
            bill={bill(opened)}
            account={account(bill(opened)?.accountId)}
            onStop={() => stop(opened, bill(opened)?.name ?? 'It')}
          />
        ) : null}
      </Sheet>
      <Sheet
        open={year}
        title="what I pay this year"
        onClose={() => setYear(false)}
      >
        <YearSheet a={a} />
      </Sheet>
    </section>
  )
}

function Fact({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <span className="flex flex-col gap-1">
      <span className="label-caps">{label}</span>
      <span className="text-[22px] leading-none font-light tabular-nums">
        {children}
      </span>
      {hint ? (
        <span className="font-mono text-[10.5px] text-ink-500">{hint}</span>
      ) : null}
    </span>
  )
}

function New() {
  return (
    <span className="rounded-full bg-lav-400/12 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-lav-300 uppercase">
      new
    </span>
  )
}

function MonthHead({
  left,
  right,
  onClick,
}: {
  left: string
  right: string
  onClick?: () => void
}) {
  const body = (
    <>
      <span className="label-caps">{left}</span>
      <span className="label-caps">{right}</span>
    </>
  )
  const cls =
    'flex items-baseline justify-between gap-3 border-b border-lift/7 px-1 pt-3.5 pb-1.5'
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={`${cls} text-left hover:text-foreground`}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function BillRow({
  t,
  name,
  kind,
  amount,
  what,
  account,
  yearly,
  isNew,
  short,
  status,
  dim,
  onOpen,
}: {
  t: number
  name: string
  kind: 'expense' | 'income'
  amount: number
  what?: string
  account?: Doc<'accounts'>
  yearly?: boolean
  isNew?: boolean
  short?: boolean
  status: React.ReactNode
  dim?: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`motion-arrive grid grid-cols-[46px_28px_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] border-b border-lift/4 px-1 py-2.5 text-left transition-colors hover:bg-lift/[0.035] ${
        short ? 'bg-state-warn/7' : ''
      } ${dim ? 'opacity-55' : ''}`}
    >
      <span className="flex flex-col items-center leading-tight">
        <span className="text-[20px] font-light tabular-nums">
          {new Date(t).getDate()}
        </span>
        <span className="font-mono text-[9.5px] tracking-[0.1em] text-ink-500 uppercase">
          {weekday(t)}
        </span>
      </span>
      {account ? (
        <AccountLogo name={account.name} domain={account.domain} size={26} />
      ) : (
        <span />
      )}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[14px]">{name}</span>
        <span className="flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-ink-500">
          {[kind === 'income' ? 'salary' : what, account?.name]
            .filter(Boolean)
            .join(' · ')}
          {yearly ? <Tag tone="lav">yearly</Tag> : null}
          {isNew ? <New /> : null}
          {short ? <Tag tone="warn">not enough on the day</Tag> : null}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1 font-mono">
        <span
          className={`text-[14px] ${kind === 'income' ? 'text-state-good' : ''}`}
        >
          {kind === 'income' ? '+' : '−'}
          {eur(amount, true)}
        </span>
        {status}
      </span>
    </button>
  )
}

/* A bill opened: what it is, and the statement rows behind it — the
   evidence the app found it from. Stopping it is here, quiet, not on
   every row. */
function BillSheet({
  id,
  bill,
  account,
  onStop,
}: {
  id: Id<'recurring'>
  bill?: AheadData['bills'][number]
  account?: Doc<'accounts'>
  onStop: () => void
}) {
  const rows = useQuery(api.recurring.payments, { id })
  if (!bill) return null
  const income = bill.kind === 'income'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {account ? (
          <AccountLogo name={account.name} domain={account.domain} size={28} />
        ) : null}
        <span
          className={`text-[30px] font-light tabular-nums ${income ? 'text-state-good' : ''}`}
        >
          {income ? '+' : '−'}
          {eur(bill.amount, true)}
        </span>
        <span className="label-caps">
          {bill.cadence === 'yearly' ? 'every year' : 'every month'}
        </span>
      </div>
      <span className="label-caps">
        {bill.isNew ? 'found in your statements · ' : ''}the payments
      </span>
      {rows === undefined ? (
        <SkeletonRows rows={3} />
      ) : rows.length ? (
        rows.map((r) => (
          <Kv
            key={r._id}
            k={`${new Date(r.occurredAt).getDate()} ${monthName(r.occurredAt)} ${new Date(r.occurredAt).getFullYear()}`}
            v={`${income ? '+' : '−'}${eur(r.value ?? 0, true)}`}
          />
        ))
      ) : (
        <span className="text-[13px] text-ink-500">No payment read yet.</span>
      )}
      <button
        type="button"
        onClick={onStop}
        className="mt-2 self-start font-mono text-[11px] tracking-[0.1em] text-ink-500 uppercase hover:text-state-danger"
      >
        {income ? 'it no longer comes in' : 'it does not repeat — remove it'}
      </button>
    </div>
  )
}

function Tag({
  tone,
  children,
}: {
  tone: 'lav' | 'warn'
  children: React.ReactNode
}) {
  return (
    <span
      className={`rounded-full px-1.5 py-px text-[9.5px] tracking-[0.12em] uppercase ${
        tone === 'lav'
          ? 'bg-lav-400/12 text-lav-300'
          : 'bg-state-warn/14 text-state-warn'
      }`}
    >
      {children}
    </span>
  )
}

function DoneStatus({ d }: { d: Done }) {
  return d.rowId !== null ? (
    <span className="text-[10px] text-state-good">
      ✓ {d.kind === 'income' ? 'arrived' : 'paid'} · statement row
    </span>
  ) : (
    <span className="text-[10px] text-state-warn">not seen yet</span>
  )
}

function EventStatus({
  e,
  today,
  account,
}: {
  e: Event
  today: number
  account?: Doc<'accounts'>
}) {
  if (e.kind === 'income')
    return <span className="text-[10px] text-state-good">arrives</span>
  if (e.short && e.held !== null) {
    return (
      <span className="text-[10px] text-state-warn">
        {account?.name ?? 'account'} holds <Veiled>{eur(e.held, true)}</Veiled>
      </span>
    )
  }
  const n = daysBetween(today, e.t)
  return (
    <span className="text-[10px] text-ink-500">
      {n === 1 ? 'tomorrow' : `${n} days`}
    </span>
  )
}

function Box({
  title,
  big,
  children,
}: {
  title: string
  big: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[16px] bg-lift/[0.02] p-3.5 ring-1 ring-lift/7 ring-inset">
      <span className="label-caps">{title}</span>
      <span className="text-[26px] font-light tabular-nums">{big}</span>
      {children}
    </div>
  )
}

function Kv({
  k,
  v,
  warn,
}: {
  k: React.ReactNode
  v: React.ReactNode
  warn?: boolean
}) {
  return (
    <span className="flex justify-between py-0.5 font-mono text-[12px] text-ink-300">
      <span className="text-ink-500">{k}</span>
      <span className={warn ? 'text-state-warn' : ''}>{v}</span>
    </span>
  )
}

function YearSheet({ a }: { a: AheadData }) {
  const max = Math.max(1, ...a.year.months.map((m) => m.sum))
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-relaxed text-ink-300">
        The next twelve months of bills and subscriptions: −{eur(a.year.total)}{' '}
        in all.
      </p>
      {a.year.months.map((m) => (
        <div
          key={m.month}
          className="grid grid-cols-[44px_1fr_80px] items-center gap-2.5 font-mono text-[12px]"
        >
          <span>
            {monthName(
              new Date(Math.floor(m.month / 12), m.month % 12, 1).getTime(),
            )}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-lift/5">
            <span
              className="block h-full rounded-full bg-lav-400/70"
              style={{ width: `${(m.sum / max) * 100}%` }}
            />
          </span>
          <span className="text-right">−{eur(m.sum)}</span>
        </div>
      ))}
      {a.year.yearly.length ? (
        <>
          <span className="label-caps mt-1.5">the once-a-year ones</span>
          {a.year.yearly.map((y) => (
            <Kv
              key={`${y.name}-${y.t}`}
              k={`${new Date(y.t).getDate()} ${monthName(y.t)} · ${y.name}`}
              v={`−${eur(y.amount, true)}`}
            />
          ))}
        </>
      ) : null}
    </div>
  )
}
