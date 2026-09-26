import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Pencil,
  Plus,
  Repeat,
  X,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { FIELD, PILL_LOUD, PILL_QUIET, Panel } from '@/components/finances/bits'
import { MoneyIcon } from '@/components/finances/icons'
import { UndoOrError, useUndoWindow } from '@/components/track/DidButton'
import { Sparks } from '@/components/track/Sparks'
import { useDayStarts } from '@/components/track/useDayStarts'
import { dayLabel } from '@/lib/bills'
import { categoriesFor, euros } from '@/lib/money'
import type { MoneyKind } from '@/lib/money'

const MONTHS = Array.from({ length: 12 }, (_, m) =>
  new Date(2026, m, 1).toLocaleDateString(undefined, { month: 'short' }),
)

/* Bills (Finances F3, 26 Sep): what comes round — mortgage, subscriptions,
   salary. The month as a strip of days with each on its day and today
   marked, then the list: tap PAID (or ARRIVED for money in) and the log is
   written, with undo. Nothing is logged by itself — the tap is his word
   that it moved. A bill past its day and not paid wears the warning
   colour: a state, not a verdict. */
export function Bills() {
  const today = useDayStarts(1).at(-1) as number
  const now = new Date(today)
  const year = now.getFullYear()
  const month = now.getMonth()
  const start = new Date(year, month, 1).getTime()
  const end = new Date(year, month + 1, 1).getTime()
  const rows = useQuery(api.recurring.month, { year, month, start, end })
  const [editing, setEditing] = useState<Doc<'recurring'> | 'new' | null>(null)
  const undo = useUndoWindow()

  const days = new Date(year, month + 1, 0).getDate()
  const todayNum = now.getDate()

  return (
    <Panel
      title={`bills · ${now.toLocaleDateString(undefined, { month: 'long' })}`}
      aside={
        <>
          <UndoOrError
            undo={undo.canUndo}
            failed={undo.failed}
            onUndo={undo.takeBack}
          />
          <button
            type="button"
            onClick={() => setEditing(editing === 'new' ? null : 'new')}
            className={PILL_QUIET}
          >
            {editing === 'new' ? (
              <X className="size-3" />
            ) : (
              <Plus className="size-3" />
            )}
            {editing === 'new' ? 'cancel' : 'bill'}
          </button>
        </>
      }
    >
      {editing !== null ? (
        <BillForm
          key={editing === 'new' ? 'new' : editing._id}
          item={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : null}

      {rows === undefined ? null : rows.length === 0 && editing === null ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <Repeat className="size-6 text-area" />
          <p className="max-w-sm text-[13.5px] text-ink-400">
            Your mortgage, subscriptions and salary, each on its day. One tap
            when it goes out — or comes in — and it is logged.
          </p>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className={PILL_LOUD}
          >
            <Plus className="size-3" />
            first bill
          </button>
        </div>
      ) : (
        <>
          {/* The month, a day per column: each bill a mark on its day. */}
          <div
            className="relative grid h-14 items-end gap-px"
            style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}
            aria-hidden
          >
            {Array.from({ length: days }, (_, i) => {
              const d = i + 1
              const on = rows.filter((r) => r.day === d)
              return (
                <div
                  key={d}
                  className="flex h-full flex-col items-center justify-end gap-0.5"
                >
                  {on.map((r) => (
                    <span
                      key={r.item._id}
                      className={`motion-pop size-2 rounded-full ${
                        r.paid
                          ? 'bg-lav-400'
                          : d < todayNum
                            ? 'bg-state-warn'
                            : 'ring-1 ring-lav-400/70'
                      }`}
                    />
                  ))}
                  <span
                    className={`w-full rounded-full ${
                      d === todayNum
                        ? 'h-2 bg-lav-400 shadow-[0_0_10px_var(--system-shine)]'
                        : d < todayNum
                          ? 'h-1 bg-lift/25'
                          : 'h-1 bg-lift/10'
                    }`}
                  />
                </div>
              )
            })}
          </div>
          <div className="-mt-2 flex justify-between font-mono text-[10px] text-ink-600">
            <span>1</span>
            <span>{days}</span>
          </div>

          <div className="flex flex-col gap-1">
            {rows.map((r, i) => (
              <BillRow
                key={r.item._id}
                row={r}
                delay={i * 40}
                late={!r.paid && r.day < todayNum}
                onEdit={() => setEditing(r.item)}
                press={undo.press}
              />
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}

type Row = {
  item: Doc<'recurring'>
  day: number
  paid: { logId: Id<'logs'>; occurredAt: number; value: number } | null
}

function BillRow({
  row,
  delay,
  late,
  onEdit,
  press,
}: {
  row: Row
  delay: number
  late: boolean
  onEdit: () => void
  press: (write: () => Promise<Id<'logs'>>) => void
}) {
  const markPaid = useMutation(api.recurring.markPaid)
  const [burst, setBurst] = useState(0)
  const { item, paid } = row
  const incoming = item.kind === 'income'

  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`motion-land group flex min-h-14 items-center gap-3 rounded-[14px] px-2.5 py-2 ring-1 transition-colors ring-inset ${
        paid
          ? 'bg-lav-400/6 ring-lav-400/25'
          : late
            ? 'bg-state-warn/6 ring-state-warn/30'
            : 'ring-lift/8 hover:ring-lift/20'
      }`}
    >
      <span className="w-11 shrink-0 text-center font-mono text-[11px] text-ink-400">
        {dayLabel(row.day)}
      </span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-(--area)/15 text-area">
        <MoneyIcon
          kind={item.kind}
          category={item.category ?? 'other'}
          className="size-4"
        />
      </span>
      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 flex-col text-left"
      >
        <span className="flex items-center gap-1.5 truncate text-[14.5px] text-foreground">
          {item.name}
          <Pencil className="size-3 text-ink-600 opacity-0 transition-opacity group-hover:opacity-100" />
        </span>
        <span className="font-mono text-[11px] text-ink-500">
          {incoming ? 'in' : 'out'} ·{' '}
          {item.cadence === 'yearly'
            ? `yearly, ${MONTHS[item.month ?? 0]}`
            : 'monthly'}
          {item.endedAt !== undefined ? ' · ended' : ''}
        </span>
      </button>
      <span className="font-mono text-[15px] font-light text-foreground">
        {incoming ? '+' : '−'}
        {euros(paid ? paid.value : item.amount)}
      </span>
      {paid ? (
        <span className="motion-pop inline-flex w-[84px] items-center justify-center gap-1 font-mono text-[10.5px] tracking-[0.12em] text-lav-300 uppercase">
          <Check className="size-3.5" strokeWidth={3} />
          {incoming ? 'arrived' : 'paid'}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setBurst((b) => b + 1)
            press(() => markPaid({ id: item._id, occurredAt: Date.now() }))
          }}
          className={`relative w-[84px] justify-center ${PILL_LOUD}`}
        >
          {incoming ? 'arrived' : 'paid'}
          {burst > 0 ? <Sparks key={burst} count={12} reach={34} /> : null}
        </button>
      )}
    </div>
  )
}

function BillForm({
  item,
  onDone,
}: {
  item: Doc<'recurring'> | null
  onDone: () => void
}) {
  const create = useMutation(api.recurring.create)
  const update = useMutation(api.recurring.update)
  const end = useMutation(api.recurring.end)
  const remove = useMutation(api.recurring.remove)
  const accounts = useQuery(api.accounts.list, {})
  const [name, setName] = useState(item?.name ?? '')
  const [kind, setKind] = useState<MoneyKind>(item?.kind ?? 'expense')
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [category, setCategory] = useState<string>(item?.category ?? '')
  const [cadence, setCadence] = useState<'monthly' | 'yearly'>(
    item?.cadence ?? 'monthly',
  )
  const [day, setDay] = useState(item?.day ?? 1)
  const [month, setMonth] = useState(item?.month ?? new Date().getMonth())
  const [accountId, setAccountId] = useState<string>(item?.accountId ?? '')
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const value = Number(amount.replace(',', '.'))
    const args = {
      name,
      kind,
      amount: value,
      category: category || undefined,
      accountId: (accountId || undefined) as Id<'accounts'> | undefined,
      cadence,
      day,
      month: cadence === 'yearly' ? month : undefined,
    }
    try {
      if (item) await update({ id: item._id, ...args })
      else await create(args)
      onDone()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message.replace(/^.*: /, '').split('\n')[0]
          : 'Not saved',
      )
    }
  }

  return (
    <div className="motion-arrive flex flex-col gap-2.5 rounded-[14px] bg-lav-400/6 p-3 ring-1 ring-lav-400/25 ring-inset">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mortgage"
          aria-label="Name"
          className={`${FIELD} min-w-0 flex-1`}
        />
        <label className={`${FIELD} inline-flex w-32 items-center gap-1`}>
          <span className="text-ink-400">€</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="750"
            aria-label="Amount in euros"
            className="w-full bg-transparent focus:outline-none"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['expense', 'out', ArrowDownRight],
            ['income', 'in', ArrowUpRight],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k)
              setCategory('')
            }}
            className={kind === k ? PILL_LOUD : PILL_QUIET}
          >
            <Icon className="size-3" />
            {label}
          </button>
        ))}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
          className={FIELD}
        >
          <option value="">no category</option>
          {categoriesFor(kind).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          aria-label="From which account"
          className={FIELD}
        >
          <option value="">any account</option>
          {(accounts ?? []).map((a) => (
            <option key={a._id} value={a._id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(['monthly', 'yearly'] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cadence === c}
            onClick={() => setCadence(c)}
            className={cadence === c ? PILL_LOUD : PILL_QUIET}
          >
            {c}
          </button>
        ))}
        <span className="label-caps">on the</span>
        <select
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          aria-label="Day of the month"
          className={FIELD}
        >
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              {dayLabel(d)}
            </option>
          ))}
          <option value={0}>last day</option>
        </select>
        {cadence === 'yearly' ? (
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            aria-label="Month"
            className={FIELD}
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void save()} className={PILL_LOUD}>
          <Check className="size-3" />
          {item ? 'save' : 'add'}
        </button>
        <button type="button" onClick={onDone} className={PILL_QUIET}>
          cancel
        </button>
        {item && item.endedAt === undefined ? (
          <button
            type="button"
            /* Deleted if never paid (a typo); otherwise ended, so its
               payments keep what they were for. */
            onClick={() =>
              void remove({ id: item._id })
                .catch(() => end({ id: item._id }))
                .then(onDone)
            }
            className="ml-auto font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase hover:text-state-danger"
          >
            no longer comes round
          </button>
        ) : null}
        {error ? (
          <span className="w-full font-mono text-[11px] text-state-warn">
            {error}
          </span>
        ) : null}
      </div>
    </div>
  )
}
