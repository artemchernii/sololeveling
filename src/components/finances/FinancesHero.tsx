import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CandlestickChart,
  Check,
  Pencil,
  Wallet,
  X,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { api } from '../../../convex/_generated/api'
import { useDayStarts } from '@/components/track/useDayStarts'
import { areaVars } from '@/lib/areas'
import { daysLeftInMonth, monthRange } from '@/lib/month'
import { euros } from '@/lib/money'
import { dayLabel } from '@/lib/bills'
import { agoLabel } from '@/lib/format'
import { Veiled, VeilToggle } from '@/components/finances/Veil'

const MONTH = new Intl.DateTimeFormat(undefined, { month: 'long' })

/* Finances' header (F1, 26 Sep), Body's shape: a System window with this
   month's money out and in, side by side and never subtracted (PLAN.md §1,
   the sum rule's fifth condition — "saved" needs its own yes). Direction is
   the word and the arrow, not red and green (§3d.3: colour is a state,
   never a quantity).

   The one bar here is the monthly limit, and only when he has set one: a
   goal's targetValue is the denominator, the month's out is the numerator. */
export function FinancesHero() {
  const today = useDayStarts(1).at(-1) as number
  const { monthStart, nextStart } = monthRange(today)
  const sums = useQuery(api.aggregate.moneySums, {
    start: monthStart,
    end: nextStart,
  })
  const limit = useQuery(api.goals.spendLimit, {})

  return (
    <section
      style={areaVars('money')}
      className="system-frame system-open relative flex flex-col gap-4 overflow-clip p-4 sm:p-5"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -left-16 size-72 rounded-full bg-(--area)/14 blur-3xl"
      />
      <div className="relative flex items-center justify-between gap-3 border-b border-lav-400/20 pb-3">
        <span className="system-title flex-1">[ finances ]</span>
        <span className="label-caps text-ink-300">
          {MONTH.format(new Date(today))}
        </span>
        <VeilToggle hideOnLeave />
      </div>

      <AccountsTotal />

      <div className="relative grid grid-cols-2 gap-3">
        <Total
          label="out"
          Icon={ArrowDownRight}
          sum={sums?.out.sum}
          count={sums?.out.count}
          delay={60}
        />
        <Total
          label="in"
          Icon={ArrowUpRight}
          sum={sums?.in.sum}
          count={sums?.in.count}
          delay={120}
        />
      </div>

      <NextBill today={today} />

      {limit !== undefined && sums !== undefined ? (
        <Limit limit={limit} out={sums.out.sum} today={today} />
      ) : null}

      {sums && (sums.skipped > 0 || !sums.complete) ? (
        <p className="relative font-mono text-[11px] text-state-warn">
          {!sums.complete
            ? 'Too many rows this month to add them all — this is not the whole month.'
            : `${sums.skipped} not in euros — not added, and not converted.`}
        </p>
      ) : null}
    </section>
  )
}

function Total({
  label,
  Icon,
  sum,
  count,
  delay,
}: {
  label: string
  Icon: typeof ArrowUpRight
  sum: number | undefined
  count: number | undefined
  delay: number
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="motion-land flex min-w-0 flex-col gap-1 rounded-[14px] bg-lift/[0.035] p-3 ring-1 ring-lift/10 ring-inset"
    >
      <span className="label-caps flex items-center gap-1.5">
        <Icon className="size-3.5 text-area" />
        {label}
      </span>
      <span
        key={sum}
        className="motion-pop truncate text-[30px] leading-none font-light tracking-tight text-foreground sm:text-[38px]"
      >
        {sum === undefined ? '—' : euros(sum)}
      </span>
      <span className="font-mono text-[11px] text-ink-500">
        {count === undefined
          ? ' '
          : count === 0
            ? 'nothing logged'
            : `${count} ${count === 1 ? 'log' : 'logs'}`}
      </span>
    </div>
  )
}

/* The limit he set, against this month's out. Over it is a state, and
   wears the warning colour; under it is words ("€388 left · 5 days"). */
function Limit({
  limit,
  out,
  today,
}: {
  limit: number | null
  out: number
  today: number
}) {
  const set = useMutation(api.goals.setSpendLimit)
  const clear = useMutation(api.goals.clearSpendLimit)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState(false)

  function open() {
    setText(limit === null ? '' : String(limit))
    setError(false)
    setEditing(true)
  }

  async function save() {
    const n = Number(text.replace(',', '.'))
    if (!Number.isInteger(n) || n < 1) {
      setError(true)
      return
    }
    await set({ targetValue: n })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="relative flex flex-wrap items-center gap-2">
        <span className="label-caps">monthly limit €</span>
        <input
          autoFocus
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save()
            if (e.key === 'Escape') setEditing(false)
          }}
          placeholder="800"
          aria-label="Monthly spending limit in euros"
          className={`w-24 rounded-full bg-lift/[0.06] px-3 py-1 font-mono text-[13px] text-foreground ring-1 ring-inset focus:outline-none ${
            error ? 'ring-state-warn/60' : 'ring-lav-400/40'
          }`}
        />
        <button
          type="button"
          onClick={() => void save()}
          aria-label="Save limit"
          className="motion-press grid size-7 place-items-center rounded-full bg-lav-400/15 text-lav-400 ring-1 ring-lav-400/40 ring-inset"
        >
          <Check className="size-3.5" />
        </button>
        {limit !== null ? (
          <button
            type="button"
            onClick={() => {
              void clear({})
              setEditing(false)
            }}
            className="motion-press font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase hover:text-ink-200"
          >
            no limit
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setEditing(false)}
          aria-label="Cancel"
          className="motion-press grid size-7 place-items-center rounded-full text-ink-500 hover:text-ink-200"
        >
          <X className="size-3.5" />
        </button>
        {error ? (
          <span className="font-mono text-[11px] text-state-warn">
            a whole number of euros
          </span>
        ) : null}
      </div>
    )
  }

  if (limit === null) {
    return (
      <button
        type="button"
        onClick={open}
        className="motion-press relative inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10.5px] tracking-[0.12em] text-ink-400 uppercase ring-1 ring-lift/15 ring-inset hover:text-foreground hover:ring-lav-400/40"
      >
        <Pencil className="size-3" />
        set a monthly limit
      </button>
    )
  }

  const over = out > limit
  const days = daysLeftInMonth(new Date(today))
  const dayWords = days === 1 ? 'last day' : `${days} days left`
  return (
    <button
      type="button"
      onClick={open}
      aria-label={`Monthly limit ${euros(limit)} — change it`}
      className="motion-press group relative flex flex-col gap-1.5 text-left"
    >
      <span className="flex items-center justify-between gap-3 font-mono text-[11.5px]">
        <span className="text-ink-300">
          {euros(out)} <span className="text-ink-500">of {euros(limit)}</span>
        </span>
        <span className={over ? 'text-state-warn' : 'text-ink-400'}>
          {over
            ? `${euros(Math.round((out - limit) * 100) / 100)} over · ${dayWords}`
            : `${euros(Math.round((limit - out) * 100) / 100)} left · ${dayWords}`}
          <Pencil className="ml-1.5 inline size-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-lift/[0.08]">
        <span
          style={{ width: `${Math.min(100, (out / limit) * 100)}%` }}
          className={`block h-full rounded-full transition-[width] duration-700 ${
            over ? 'bg-state-warn' : 'bg-lav-400'
          }`}
        />
      </span>
    </button>
  )
}

/* What is his, in two halves (26 Sep: "distinguish free cash and
   investments"): FREE CASH — the balances he types, money not in shares —
   and INVESTED — his positions at stored closes (aggregate.worth). The big
   number is the two added; each half says how old its oldest reading is.
   Not called net worth — the mortgage it owes is not in it. */
function AccountsTotal() {
  const data = useQuery(api.aggregate.worth, {})
  if (data === undefined) return <div className="h-[104px]" />
  if (data.byAccount.length === 0) {
    return (
      <Link
        to="/finances"
        search={{ tab: 'balances' }}
        className="relative w-fit font-mono text-[11.5px] tracking-[0.12em] text-ink-400 uppercase hover:text-foreground"
      >
        + add your accounts to see what they hold
      </Link>
    )
  }
  return (
    <div className="relative flex flex-col gap-2.5">
      <div className="flex flex-col gap-1">
        <span className="label-caps">cash + investments</span>
        <span
          key={data.total}
          className="motion-pop text-[40px] leading-none font-light tracking-tight text-foreground sm:text-[52px]"
        >
          <Veiled>{euros(data.total)}</Veiled>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Half
          label="free cash"
          Icon={Wallet}
          value={data.cash.total}
          note={
            data.cash.oldestAt === null
              ? 'nothing typed yet'
              : `oldest read ${agoLabel(data.cash.oldestAt)}${
                  data.cash.unread > 0 ? ` · ${data.cash.unread} not read` : ''
                }`
          }
          tab="balances"
        />
        <Half
          label="invested"
          Icon={CandlestickChart}
          value={data.invested.total}
          note={
            data.invested.oldestAt === null
              ? 'no positions yet'
              : `closes as of ${agoLabel(data.invested.oldestAt)}${
                  data.invested.unvalued > 0
                    ? ` · ${data.invested.unvalued} unpriced`
                    : ''
                }`
          }
          tab="invest"
        />
      </div>
    </div>
  )
}

function Half({
  label,
  Icon,
  value,
  note,
  tab,
}: {
  label: string
  Icon: typeof Wallet
  value: number
  note: string
  tab: 'balances' | 'invest'
}) {
  return (
    <Link
      to="/finances"
      search={{ tab }}
      className="motion-press flex min-w-0 flex-col gap-0.5 rounded-[12px] px-2.5 py-2 ring-1 ring-lav-400/20 transition-colors ring-inset hover:bg-lav-400/8 hover:ring-lav-400/45"
    >
      <span className="label-caps flex items-center gap-1.5">
        <Icon className="size-3.5 text-area" />
        {label}
      </span>
      <span className="truncate text-[20px] leading-tight font-light text-foreground">
        <Veiled>{euros(value)}</Veiled>
      </span>
      <span className="truncate font-mono text-[10.5px] text-ink-500">
        {note}
      </span>
    </Link>
  )
}

/* The next bill not yet paid this month, so the hero says what is coming. */
function NextBill({ today }: { today: number }) {
  const now = new Date(today)
  const year = now.getFullYear()
  const month = now.getMonth()
  const rows = useQuery(api.recurring.month, {
    year,
    month,
    start: new Date(year, month, 1).getTime(),
    end: new Date(year, month + 1, 1).getTime(),
  })
  const next = rows?.find(
    (r) => r.paid === null && r.item.endedAt === undefined,
  )
  if (!next) return null
  const late = next.day < now.getDate()
  return (
    <Link
      to="/finances"
      search={{ tab: 'bills' }}
      className={`motion-arrive relative inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11.5px] ring-1 ring-inset ${
        late
          ? 'text-state-warn ring-state-warn/35'
          : 'text-ink-200 ring-lav-400/25 hover:ring-lav-400/50'
      }`}
    >
      <CalendarClock className="size-3.5 text-area" />
      {late ? 'waiting' : 'next'}: {next.item.name} · {euros(next.item.amount)}{' '}
      · {next.day === now.getDate() ? 'today' : dayLabel(next.day)}
    </Link>
  )
}
