import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { AccountLogo } from '@/components/finances/Logo'
import { FIELD, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { Sheet } from '@/components/finances/Sheet'
import { dayLabel } from '@/lib/bills'
import { missingFrom, readBillLine } from '@/lib/billLine'
import { failureMessage } from '@/lib/convex-errors'
import type { Notice } from './Ahead'
import { eur, monthName } from './time'

const MONTH_NAMES = Array.from({ length: 12 }, (_, m) =>
  monthName(new Date(2026, m, 1).getTime()),
)

/** How a bill is said once it is added: "every month on the 28th". */
export function whenSaid(
  cadence: 'monthly' | 'yearly',
  day: number,
  month?: number | null,
) {
  return cadence === 'yearly' && month !== undefined && month !== null
    ? `every year on ${day} ${MONTH_NAMES[month]}`
    : `every month on the ${dayLabel(day)}`
}

/* + BILL (3 Oct: "most likely those bills are in statements"). It opens
   with the likely bills already read — payees outside everyday spending
   that are not bills yet — each MONTHLY or YEARLY away from its day, with
   everything else taken from the payment. Typing is only for a bill not
   paid yet, in one line, read as he types. */
export function AddBill({
  open,
  accounts,
  onClose,
  onAdded,
}: {
  open: boolean
  accounts: ReadonlyArray<Doc<'accounts'>>
  onClose: () => void
  onAdded: (n: Notice) => void
}) {
  const likely = useQuery(api.recurring.likely, open ? {} : 'skip')
  const fromRow = useMutation(api.recurring.fromRow)
  const create = useMutation(api.recurring.create)
  const remove = useMutation(api.recurring.remove)
  const [text, setText] = useState('')
  const banks = accounts.filter((a) => a.kinds.includes('bank'))
  const [accountId, setAccountId] = useState<Id<'accounts'> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const from = accountId ?? banks.at(0)?._id ?? null

  const line = readBillLine(text)
  const missing = missingFrom(line)
  const q = text.trim().toLowerCase()
  const shown = (likely ?? []).filter(
    (l) =>
      q.length < 2 ||
      l.name.toLowerCase().includes(q.split(' ')[0]) ||
      l.key.toLowerCase().includes(q.split(' ')[0]),
  )

  function done(
    made: { id: Id<'recurring'>; created: boolean },
    name: string,
    said: string,
  ) {
    onAdded({
      text: `${name} — ${said}.`,
      undo: made.created ? () => void remove({ id: made.id }) : null,
    })
    setText('')
    setError(null)
    onClose()
  }

  async function pick(
    l: NonNullable<typeof likely>[number],
    cadence: 'monthly' | 'yearly',
  ) {
    try {
      const made = await fromRow({ logId: l.rowId, cadence })
      const d = new Date(l.t)
      done(made, l.name, whenSaid(cadence, d.getUTCDate(), d.getUTCMonth()))
    } catch (e) {
      setError(failureMessage(e) ?? 'It did not go in.')
    }
  }

  async function typed() {
    if (missing.length || line.amount === null || line.day === null) return
    try {
      const id = await create({
        name: line.name[0].toUpperCase() + line.name.slice(1),
        kind: 'expense',
        amount: line.amount,
        cadence: line.cadence,
        day: line.day,
        month: line.month ?? undefined,
        accountId: from ?? undefined,
      })
      done(
        { id, created: true },
        line.name,
        whenSaid(line.cadence, line.day, line.month),
      )
    } catch (e) {
      setError(failureMessage(e) ?? 'It did not go in.')
    }
  }

  return (
    <Sheet open={open} title="+ bill" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[13.5px] leading-relaxed text-ink-300">
          Most bills are already in your statements — pick one below. Not paid
          yet? Type it in one line.
        </p>
        {likely === undefined ? null : shown.length ? (
          <div className="flex flex-col">
            <span className="label-caps mb-1">
              {q.length >= 2
                ? 'paid before — pick it'
                : 'from your statements · likely bills'}
            </span>
            {shown.map((l) => {
              const acc = accounts.find((a) => a._id === l.accountId)
              return (
                <div
                  key={l.rowId}
                  className="grid grid-cols-[26px_minmax(0,1fr)_auto] items-center gap-3 border-b border-lift/4 py-2.5"
                >
                  {acc ? (
                    <AccountLogo
                      name={acc.name}
                      domain={acc.domain}
                      size={24}
                    />
                  ) : (
                    <span />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[14px]">{l.name}</span>
                    <span className="font-mono text-[10.5px] text-ink-500">
                      last {new Date(l.t).getDate()} {monthName(l.t)} ·{' '}
                      {l.times === 1 ? 'once' : `${l.times} times`}
                      {acc ? ` · ${acc.name}` : ''}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center justify-end gap-1.5">
                    <span className="mr-1 font-mono text-[13px]">
                      −{eur(l.amount, true)}
                    </span>
                    <button
                      type="button"
                      className={PILL_QUIET}
                      onClick={() => void pick(l, 'monthly')}
                    >
                      monthly
                    </button>
                    <button
                      type="button"
                      className={PILL_QUIET}
                      onClick={() => void pick(l, 'yearly')}
                    >
                      yearly
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        ) : q.length < 2 ? (
          <p className="text-[13px] text-ink-500">
            Nothing in your statements looks like a bill that is not one
            already.
          </p>
        ) : null}

        <span className="label-caps mt-1">
          not in your statements yet · or search them
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void typed()
          }}
          placeholder="Name, or a new one: Holmes Place 49 monthly 1"
          aria-label="A bill in one line"
          className={`${FIELD} font-mono`}
        />
        {text.trim() ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
            {line.name ? <Chip>{line.name}</Chip> : null}
            {line.amount !== null ? (
              <Chip>−{eur(line.amount, true)}</Chip>
            ) : null}
            <Chip lav>
              {line.cadence === 'yearly' ? 'every year' : 'every month'}
            </Chip>
            {line.day !== null ? (
              <Chip>
                {line.cadence === 'yearly' && line.month !== null
                  ? `${line.day} ${MONTH_NAMES[line.month]}`
                  : `on the ${dayLabel(line.day)}`}
              </Chip>
            ) : null}
            <span className="label-caps ml-1">from</span>
            {banks.map((b) => (
              <button
                key={b._id}
                type="button"
                onClick={() => setAccountId(b._id)}
                className={`flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 ring-1 ring-inset ${
                  from === b._id
                    ? 'bg-lav-400/10 text-foreground ring-lav-400/45'
                    : 'text-ink-400 ring-lift/10'
                }`}
              >
                <AccountLogo name={b.name} domain={b.domain} size={18} />
                {b.name}
              </button>
            ))}
            {missing.length ? (
              <span className="label-caps ml-auto">
                still need {missing.join(', ')}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void typed()}
                className={`${PILL_LOUD} ml-auto`}
              >
                add
              </button>
            )}
          </div>
        ) : null}
        {error ? (
          <p className="text-[12.5px] text-state-danger">{error}</p>
        ) : null}
      </div>
    </Sheet>
  )
}

function Chip({ children, lav }: { children: React.ReactNode; lav?: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-1 font-mono text-[10.5px] tracking-[0.06em] uppercase ${
        lav ? 'bg-lav-400/12 text-lav-300' : 'bg-lift/5 text-ink-300'
      }`}
    >
      {children}
    </span>
  )
}
