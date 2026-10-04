import { useMemo, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'
import { ArrowLeftRight } from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { FIELD, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { Sheet } from '@/components/finances/Sheet'
import { SkeletonRows } from '@/components/Skeleton'
import { failureMessage } from '@/lib/convex-errors'
import { categoryLabel } from '@/lib/money'
import { GroupBadge, PaidChip } from '@/components/finances/GroupBadge'
import type { Notice } from './Ahead'
import { whenSaid } from './AddBill'
import { PayeeMark, PayeeName, usePayees, Why } from './Payees'
import { dayMonth, eur, weekday } from './time'

type Item = FunctionReturnType<typeof api.logs.movements>['items'][number]
type AheadData = FunctionReturnType<typeof api.aggregate.ahead>

const DAY = 86_400_000

/* MOVEMENTS (3 Oct: "one view of movements of all sources"). Every row of
   every account, newest first, by day; a move between his accounts one
   grey row, never in or out. Account chips, a search, and the days as a
   strip — out red, in green, a ring on a bill's day — tap one to jump.
   Tap a row: what it is, and whether it repeats. */
export function Movements({
  today,
  accounts,
  ahead,
  onBill,
}: {
  today: number
  accounts: ReadonlyArray<Doc<'accounts'>>
  ahead: AheadData | undefined
  onBill: (n: Notice) => void
}) {
  const [days, setDays] = useState(30)
  const [acc, setAcc] = useState<Id<'accounts'> | null>(null)
  const [q, setQ] = useState('')
  const [day, setDay] = useState<number | null>(null)
  /* The day under the pointer (4 Oct: hovering a green-and-red day showed
     only the money out). */
  const [hover, setHover] = useState<number | null>(null)
  const [open, setOpen] = useState<Doc<'logs'> | null>(null)
  const span = useMemo(
    () => ({ start: today - (days - 1) * DAY, end: today + DAY }),
    [today, days],
  )
  const data = useQuery(api.logs.movements, span)
  const { who } = usePayees()
  const whoOf = (l: Doc<'logs'>) =>
    who({
      raw: l.meta?.raw,
      name: l.meta?.merchant ?? l.text ?? '',
      payee: l.meta?.payee,
    })
  const account = (id: Id<'accounts'> | null | undefined) =>
    accounts.find((a) => a._id === id)

  const words = q.trim().toLowerCase()
  const hit = (i: Item) =>
    (i.type === 'move'
      ? !acc || i.from === acc || i.to === acc
      : !acc || i.log.accountId === acc) &&
    (!words ||
      (i.type === 'move'
        ? i.text.toLowerCase().includes(words)
        : `${i.log.meta?.merchant ?? i.log.text ?? ''} ${i.log.meta?.category ?? ''}`
            .toLowerCase()
            .includes(words)))
  const items = (data?.items ?? []).filter(hit)
  const startOf = (t: number) => {
    const d = new Date(t)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  }
  const t = (i: Item) => (i.type === 'move' ? i.t : i.log.occurredAt)

  /* The strip: thirty days to today, then the rest of the month with the
     bills still to come ringed. */
  const d0 = new Date(today)
  const monthEnd = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getTime()
  const cells = []
  /* Snapped to his midnights: 24-hour steps slip an hour at a clock change. */
  for (
    let c = startOf(today - 29 * DAY + 12 * 3_600_000);
    c <= monthEnd;
    c = startOf(c + DAY + 3_600_000)
  )
    cells.push(c)
  const sums = new Map<number, { o: number; i: number; bill: boolean }>()
  for (const i of items) {
    if (i.type !== 'row') continue
    const k = startOf(i.log.occurredAt)
    const s = sums.get(k) ?? { o: 0, i: 0, bill: false }
    if (i.log.kind === 'expense') s.o += i.log.value
    else s.i += i.log.value
    if (i.billId) s.bill = true
    sums.set(k, s)
  }
  const billDays = new Set((ahead?.events ?? []).map((e) => startOf(e.t)))
  const mx = Math.max(1, ...[...sums.values()].map((s) => s.o))

  const groups: Array<{ day: number; items: Array<Item> }> = []
  for (const i of items) {
    const k = startOf(t(i))
    const g = groups.at(-1)
    if (g && g.day === k) g.items.push(i)
    else groups.push({ day: k, items: [i] })
  }

  function jump(k: number) {
    setDay(k)
    document
      .getElementById(`mv-${k}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className="glass motion-arrive flex flex-col gap-3 rounded-[22px] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="system-title">[ MOVEMENTS · every account ]</span>
        <span className="label-caps">last {days} days</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setAcc(null)}
          className={`${PILL_QUIET} ${acc === null ? 'bg-lav-400/12 text-foreground ring-lav-400/45' : ''}`}
        >
          all
        </button>
        {accounts.map((a) => (
          <button
            key={a._id}
            type="button"
            onClick={() => setAcc(a._id)}
            className={`flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-[12.5px] ring-1 ring-inset transition-colors ${
              acc === a._id
                ? 'bg-lav-400/10 text-foreground ring-lav-400/45'
                : 'text-ink-300 ring-lift/10 hover:text-foreground'
            }`}
          >
            <AccountLogo name={a.name} domain={a.domain} size={20} />
            {a.name}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search"
          aria-label="Search movements"
          className={`${FIELD} ml-auto min-w-40 flex-1 rounded-full py-1.5 sm:max-w-64`}
        />
      </div>

      <div
        className="relative mt-2 grid h-[74px] auto-cols-fr grid-flow-col items-end gap-[3px]"
        role="list"
        aria-label="Days"
        onPointerLeave={() => setHover(null)}
      >
        {hover !== null ? (
          <DayTip
            t={hover}
            at={cells.indexOf(hover) / Math.max(1, cells.length - 1)}
            s={sums.get(hover)}
            bill={hover > today ? billDays.has(hover) : !!sums.get(hover)?.bill}
            future={hover > today}
          />
        ) : null}
        {cells.map((c) => {
          const s = sums.get(c)
          const future = c > today
          return (
            <button
              key={c}
              type="button"
              role="listitem"
              disabled={future}
              onClick={() => jump(c)}
              onPointerEnter={() => setHover(c)}
              className={`relative flex h-full flex-col items-center justify-end gap-1 rounded-[6px] pb-0.5 transition-colors hover:bg-lift/4 ${
                day === c ? 'bg-lav-400/12' : ''
              }`}
            >
              {(future ? billDays.has(c) : s?.bill) ? (
                <span
                  className={`absolute top-0.5 size-1.5 rounded-full border ${future ? 'border-lav-400' : 'border-ink-400'}`}
                />
              ) : null}
              {s?.i ? (
                <span
                  className="mx-[18%] min-h-0.5 self-stretch rounded-[3px] bg-state-good"
                  style={{ height: Math.min(44, Math.sqrt(s.i / mx) * 44) }}
                />
              ) : null}
              {future ? null : (
                <span
                  className="motion-pop mx-[18%] min-h-0.5 self-stretch rounded-[3px_3px_1px_1px] bg-state-danger/60"
                  style={{
                    height: Math.max(2, Math.sqrt((s?.o ?? 0) / mx) * 44),
                  }}
                />
              )}
              <span
                className={`font-mono text-[9px] ${c === today ? 'text-lav-300' : 'text-ink-600'} ${
                  /* Fifty-odd days on a phone: every fifth, and today. */
                  c === today || new Date(c).getDate() % 5 === 0
                    ? ''
                    : 'hidden lg:inline'
                }`}
              >
                {new Date(c).getDate()}
              </span>
            </button>
          )
        })}
      </div>
      <div className="label-caps flex flex-wrap gap-4">
        <span>red: out that day · green: in</span>
        <span>○ a bill&apos;s day</span>
        <span className="text-lav-300">○ still to come</span>
        <span>tap a day to jump</span>
      </div>

      {data === undefined ? (
        <SkeletonRows rows={6} twoLine />
      ) : groups.length === 0 ? (
        <p className="py-6 text-center text-[13.5px] text-ink-400">
          <span className="block text-[16px] text-foreground">
            {words || acc ? 'Nothing matches' : 'No movements yet'}
          </span>
          {words || acc
            ? 'Try another name or account.'
            : 'Every row from every account will be here, newest first.'}
        </p>
      ) : (
        <div className="flex flex-col">
          {groups.map((g) => {
            const out = g.items.reduce(
              (n, i) =>
                n +
                (i.type === 'row' && i.log.kind === 'expense'
                  ? i.log.value
                  : 0),
              0,
            )
            return (
              <div key={g.day} className="flex flex-col">
                <div
                  id={`mv-${g.day}`}
                  className={`flex scroll-mt-28 justify-between border-b border-lift/7 px-1 pt-4 pb-1.5 ${day === g.day ? 'motion-land' : ''}`}
                >
                  <span className="label-caps">
                    {g.day === today
                      ? 'today'
                      : g.day === startOf(today - 3_600_000)
                        ? 'yesterday'
                        : `${weekday(g.day)} ${dayMonth(g.day)}`}
                  </span>
                  <span className="label-caps">
                    {out ? `−${eur(out, true)}` : ''}
                  </span>
                </div>
                {g.items.map((i) =>
                  i.type === 'move' ? (
                    <MoveRow
                      key={i.id}
                      i={i}
                      from={account(i.from)}
                      to={account(i.to)}
                    />
                  ) : (
                    <button
                      key={i.log._id}
                      type="button"
                      onClick={() => setOpen(i.log)}
                      className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-[8px] border-b border-lift/3 px-1 py-2 text-left text-[13.5px] transition-colors hover:bg-lift/[0.035]"
                    >
                      <PayeeMark
                        who={whoOf(i.log)}
                        account={account(i.log.accountId)}
                      />
                      <span className="min-w-0">
                        <PayeeName who={whoOf(i.log)} />
                        {whoOf(i.log).original ? (
                          <span className="block truncate text-[12px] text-ink-400">
                            {whoOf(i.log).original}
                          </span>
                        ) : null}
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[10px] text-ink-500">
                          {i.log.kind === 'income' &&
                          !i.log.meta?.category ? null : (
                            <GroupBadge
                              kind={
                                i.log.kind === 'income' ? 'income' : 'expense'
                              }
                              category={i.log.meta?.category ?? null}
                            />
                          )}
                          {i.billId ? <PaidChip label="bill" /> : null}
                          {account(i.log.accountId)?.name ?? '—'}
                        </span>
                      </span>
                      <span
                        className={`font-mono ${i.log.kind === 'income' ? 'text-state-good' : ''}`}
                      >
                        {i.log.kind === 'income' ? '+' : '−'}
                        {eur(i.log.value, true)}
                      </span>
                    </button>
                  ),
                )}
              </div>
            )
          })}
        </div>
      )}
      {data && !words && !acc ? (
        <button
          type="button"
          onClick={() => setDays(days + 30)}
          className={`${PILL_QUIET} mx-auto mt-2`}
        >
          earlier · 30 more days
        </button>
      ) : null}

      <Sheet
        open={open !== null}
        title={open?.meta?.merchant ?? open?.text ?? 'row'}
        onClose={() => setOpen(null)}
      >
        {open ? (
          <RowSheet
            row={open}
            account={account(open.accountId)}
            isBill={(data?.items ?? []).some(
              (i) =>
                i.type === 'row' && i.log._id === open._id && i.billId !== null,
            )}
            onDone={(n) => {
              setOpen(null)
              onBill(n)
            }}
          />
        ) : null}
      </Sheet>
    </section>
  )
}

function Logo({ a }: { a?: Doc<'accounts'> }) {
  return a ? (
    <AccountLogo name={a.name} domain={a.domain} size={24} />
  ) : (
    <span />
  )
}

function DayTip({
  t,
  at,
  s,
  bill,
  future,
}: {
  t: number
  /** 0–1 across the strip. */
  at: number
  s?: { o: number; i: number }
  bill: boolean
  future: boolean
}) {
  return (
    <div
      style={{ left: `${Math.min(88, Math.max(12, at * 100))}%` }}
      className="pointer-events-none absolute -top-2 z-10 min-w-[150px] -translate-x-1/2 -translate-y-full rounded-[12px] bg-background/95 p-2.5 ring-1 ring-[color:var(--system-edge)] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]"
    >
      <div className="mb-1 font-mono text-[10px] tracking-[0.14em] text-lav-300 uppercase">
        {weekday(t)} {dayMonth(t)}
      </div>
      {s?.i ? (
        <div className="flex justify-between gap-4 font-mono text-[12px] text-state-good">
          <span>in</span>
          <span>+{eur(s.i, true)}</span>
        </div>
      ) : null}
      {s?.o ? (
        <div className="flex justify-between gap-4 font-mono text-[12px] text-state-danger">
          <span>out</span>
          <span>−{eur(s.o, true)}</span>
        </div>
      ) : null}
      {!s?.i && !s?.o ? (
        <div className="font-mono text-[12px] text-ink-500">
          {future ? 'still to come' : 'nothing moved'}
        </div>
      ) : null}
      {bill ? (
        <div className="mt-1 font-mono text-[10px] text-ink-400">
          ○ a bill&apos;s day
        </div>
      ) : null}
    </div>
  )
}

function MoveRow({
  i,
  from,
  to,
}: {
  i: Extract<Item, { type: 'move' }>
  from?: Doc<'accounts'>
  to?: Doc<'accounts'>
}) {
  return (
    /* Lavender (4 Oct: "transfers make violet"): his own money moving,
       apart from red out and green in at a glance. */
    <div className="my-0.5 grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] bg-lav-400/7 px-1.5 py-2 text-[13.5px] text-lav-200 ring-1 ring-lav-400/15 ring-inset">
      <span className="flex items-center">
        {from ? (
          <AccountLogo name={from.name} domain={from.domain} size={18} />
        ) : null}
        {to ? (
          <span className="-ml-1.5 rounded-[7px] ring-2 ring-background">
            <AccountLogo name={to.name} domain={to.domain} size={18} />
          </span>
        ) : null}
        {!from && !to ? <ArrowLeftRight className="size-4" /> : null}
      </span>
      <span className="min-w-0">
        <span className="block truncate">
          {!from && !to
            ? `Put aside · ${i.text}`
            : from && to && from._id === to._id
              ? `${from.name} · within the account`
              : `${from?.name ?? 'another account'} → ${to?.name ?? 'another account'}`}
        </span>
        <span className="block font-mono text-[10px] text-lav-300/70">
          transfer · {i.text.toLowerCase()} · not in or out
        </span>
      </span>
      <span className="font-mono text-lav-300">⇄ {eur(i.amount, true)}</span>
    </div>
  )
}

/* A row opened: everything about it is already known, so the one thing
   to say is whether it comes round (3 Oct, "add bills yes"). */
function RowSheet({
  row,
  account,
  isBill,
  onDone,
}: {
  row: Doc<'logs'>
  account?: Doc<'accounts'>
  isBill: boolean
  onDone: (n: Notice) => void
}) {
  const fromRow = useMutation(api.recurring.fromRow)
  const remove = useMutation(api.recurring.remove)
  const [error, setError] = useState<string | null>(null)
  const income = row.kind === 'income'
  const d = new Date(row.occurredAt)
  async function make(cadence: 'monthly' | 'yearly') {
    try {
      const made = await fromRow({ logId: row._id, cadence })
      const name = row.meta?.merchant ?? row.text ?? 'Bill'
      onDone({
        text: `${name} — ${made.created ? whenSaid(cadence, d.getUTCDate(), d.getUTCMonth()) : 'a bill already'}.`,
        undo: made.created ? () => void remove({ id: made.id }) : null,
      })
    } catch (e) {
      setError(failureMessage(e) ?? 'It did not go in.')
    }
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <Logo a={account} />
        <span
          className={`text-[30px] font-light tabular-nums ${income ? 'text-state-good' : ''}`}
        >
          {income ? '+' : '−'}
          {eur(row.value ?? 0, true)}
        </span>
      </div>
      <Line
        k="day"
        v={`${weekday(row.occurredAt)} ${dayMonth(row.occurredAt)}`}
      />
      <Line k="account" v={account?.name ?? '—'} />
      <Line
        k="group"
        v={categoryLabel(
          income ? 'income' : 'expense',
          row.meta?.category ?? null,
        )}
      />
      {row.meta?.raw ? <Line k="the bank wrote" v={row.meta.raw} /> : null}
      <Why logId={row._id} />
      {isBill ? (
        <p className="text-[13.5px] text-ink-300">
          <span className="rounded-full bg-state-good/12 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-state-good uppercase">
            bill ✓
          </span>{' '}
          Already in Future balance on its day.
        </p>
      ) : (
        <>
          <span className="label-caps mt-1.5">repeats?</span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void make('monthly')}
              className={PILL_LOUD}
            >
              every month
            </button>
            <button
              type="button"
              onClick={() => void make('yearly')}
              className={PILL_LOUD}
            >
              every year
            </button>
          </div>
        </>
      )}
      {error ? (
        <p className="text-[12.5px] text-state-danger">{error}</p>
      ) : null}
    </div>
  )
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <span className="flex justify-between gap-4 font-mono text-[12px] text-ink-300">
      <span className="text-ink-500">{k}</span>
      <span className="truncate text-right">{v}</span>
    </span>
  )
}
