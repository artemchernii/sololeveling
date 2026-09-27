import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  FileUp,
  Loader2,
  Plus,
} from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { FIELD, PILL_LOUD, PILL_QUIET } from '@/components/finances/bits'
import { IntakeFlow } from '@/components/finances/Intake'
import { MoneyIcon } from '@/components/finances/icons'
import { Sheet } from '@/components/finances/Sheet'
import { Sparks } from '@/components/track/Sparks'
import { MAX_INTAKE_FILES, readableFile } from '@/lib/intake'
import { SPEND_CATEGORIES } from '@/lib/money'

/* + (Treasury, 27 Sep): two doors. DROP FILES — statements and screenshots,
   any bank or broker, several at once; the reader works out what each is
   and returns a list to check. LOG SOMETHING — a transfer, money out that
   matters, money in. Not the coffee: small spending comes by the batch.
   Every step has a way back; nothing closes the whole sheet but close. */

type Step =
  | { at: 'home' }
  | { at: 'transfer' }
  | { at: 'out' }
  | { at: 'in' }
  | { at: 'intake'; id: Id<'intakes'> }

export function AddButton({ className = '' }: { className?: string }) {
  const [step, setStep] = useState<Step | null>(null)
  const home = () => setStep({ at: 'home' })
  const title =
    step === null
      ? ''
      : step.at === 'home'
        ? 'add'
        : step.at === 'transfer'
          ? 'transfer'
          : step.at === 'out'
            ? 'money out'
            : step.at === 'in'
              ? 'money in'
              : 'check it'
  return (
    <>
      <button
        type="button"
        onClick={home}
        className={`${PILL_LOUD} ${className}`}
      >
        <Plus className="size-3.5" />
        add
      </button>
      <Sheet
        open={step !== null}
        title={title}
        onClose={() => setStep(null)}
        onBack={step !== null && step.at !== 'home' ? home : undefined}
        wide={step?.at === 'intake'}
      >
        {step?.at === 'home' ? (
          <>
            <DropFiles onStarted={(id) => setStep({ at: 'intake', id })} />
            <div className="flex flex-col gap-2 border-t border-lift/[0.07] pt-4">
              <span className="label-caps">or log something that matters</span>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['transfer', 'Transfer', ArrowLeftRight],
                    ['out', 'Money out', ArrowDownRight],
                    ['in', 'Money in', ArrowUpRight],
                  ] as const
                ).map(([k, label, Icon]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setStep({ at: k })}
                    className="motion-press flex flex-col items-center gap-1.5 rounded-[14px] bg-lift/[0.035] px-2 py-3.5 text-[13px] text-ink-100 ring-1 ring-lift/10 ring-inset hover:ring-lav-400/45"
                  >
                    <Icon className="size-5 text-area" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : step?.at === 'transfer' ? (
          <MoveForm onDone={home} />
        ) : step?.at === 'out' ? (
          <OutForm onDone={home} />
        ) : step?.at === 'in' ? (
          <InForm
            onDone={home}
            onTransfer={() => setStep({ at: 'transfer' })}
          />
        ) : step?.at === 'intake' ? (
          <IntakeFlow
            intakeId={step.id}
            onBack={home}
            onDone={() => setStep(null)}
          />
        ) : null}
      </Sheet>
    </>
  )
}

/** Files in: uploaded, then handed to the reader. The account is optional
    — the reader names the bank, the review matches it. */
export function DropFiles({
  accountId,
  onStarted,
}: {
  accountId?: Id<'accounts'>
  onStarted: (intakeId: Id<'intakes'>) => void
}) {
  const uploadUrl = useMutation(api.attachments.generateUploadUrl)
  const start = useMutation(api.intake.start)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  async function send(files: Array<File>) {
    if (files.length === 0) return
    if (files.length > MAX_INTAKE_FILES) {
      setError(`At most ${MAX_INTAKE_FILES} files at once.`)
      return
    }
    const bad = files.find((f) => readableFile(f.type, f.name) === null)
    if (bad) {
      setError(`${bad.name} is not a PDF, a CSV or a screenshot.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const stored = []
      for (const file of files) {
        const url = await uploadUrl({})
        const type =
          file.type ||
          (file.name.toLowerCase().endsWith('.csv')
            ? 'text/csv'
            : 'application/octet-stream')
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': type },
          body: file,
        })
        const { storageId } = (await res.json()) as {
          storageId: Id<'_storage'>
        }
        stored.push({
          storageId,
          contentType: type,
          name: file.name,
          size: file.size,
        })
      }
      const result = await start({ accountId, files: stored })
      if (!result.ok) setError(result.error)
      else onStarted(result.intakeId)
    } catch {
      setError('It did not upload — try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void send([...e.dataTransfer.files])
        }}
        className={`motion-press flex min-h-36 flex-col items-center justify-center gap-2 rounded-[16px] border border-dashed px-4 text-center transition-colors ${
          over
            ? 'border-lav-400 bg-lav-400/10'
            : 'border-lav-400/40 hover:bg-lav-400/6'
        }`}
      >
        {busy ? (
          <Loader2 className="size-6 animate-spin text-lav-400" />
        ) : (
          <FileUp className="size-6 text-area" />
        )}
        <span className="text-[15px] text-foreground">
          {busy ? 'Uploading…' : 'Drop statements or screenshots'}
        </span>
        <span className="font-mono text-[11px] text-ink-500">
          PDF · CSV · PNG — any bank, any broker, up to {MAX_INTAKE_FILES} at
          once. It works out what each one is.
        </span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="application/pdf,text/csv,.csv,image/png,image/jpeg,image/webp"
        onChange={(e) => void send([...(e.target.files ?? [])])}
      />
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
    </div>
  )
}

/* ---- Log something ---------------------------------------------------- */

function useAccounts() {
  return useQuery(api.accounts.list, {}) ?? []
}

function AccountChips({
  accounts,
  value,
  onChange,
  exclude,
}: {
  accounts: Array<Doc<'accounts'>>
  value: Id<'accounts'> | null
  onChange: (id: Id<'accounts'>) => void
  exclude?: Id<'accounts'> | null
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {accounts
        .filter((a) => a._id !== exclude)
        .map((a) => (
          <button
            key={a._id}
            type="button"
            aria-pressed={value === a._id}
            onClick={() => onChange(a._id)}
            className={value === a._id ? PILL_LOUD : PILL_QUIET}
          >
            {a.name}
          </button>
        ))}
    </div>
  )
}

function Amount({
  value,
  onChange,
  currency,
  currencies,
  onCurrency,
}: {
  value: string
  onChange: (v: string) => void
  currency: string
  currencies: Array<string>
  onCurrency: (c: string) => void
}) {
  return (
    <div className="flex items-baseline gap-2">
      {currencies.length > 1 ? (
        <select
          value={currency}
          onChange={(e) => onCurrency(e.target.value)}
          aria-label="Currency"
          className="rounded-[8px] bg-lift/[0.05] px-2 py-1 font-mono text-[13px] text-ink-200 ring-1 ring-lift/12 ring-inset"
        >
          {currencies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      ) : (
        <span className="text-[28px] font-light text-ink-500">
          {currency === 'EUR' ? '€' : currency}
        </span>
      )}
      <input
        autoFocus
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        aria-label="Amount"
        className="w-full bg-transparent text-[42px] leading-tight font-light text-foreground placeholder:text-ink-700 focus:outline-none"
      />
    </div>
  )
}

const num = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'))

function When({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className={`${FIELD} flex items-center gap-2`}>
      <span className="shrink-0 font-mono text-[10.5px] text-ink-500">
        when
      </span>
      <input
        type="date"
        value={value}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent focus:outline-none"
      />
    </label>
  )
}

const at = (date: string) =>
  Math.min(new Date(`${date}T12:00:00`).getTime(), Date.now())

function SaveButton({
  label,
  disabled,
  onSave,
}: {
  label: string
  disabled: boolean
  onSave: () => Promise<void>
}) {
  const [burst, setBurst] = useState(0)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      {error ? (
        <span className="font-mono text-[11px] text-state-warn">{error}</span>
      ) : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setError(null)
          onSave().then(
            () => setBurst((b) => b + 1),
            (e: unknown) =>
              setError(
                e instanceof Error
                  ? e.message.replace(/^.*?ConvexError: /, '').split('\n')[0]
                  : 'Not saved',
              ),
          )
        }}
        className={`${PILL_LOUD} relative justify-center py-3 disabled:opacity-40`}
      >
        {label}
        {burst > 0 ? <Sparks key={burst} count={12} reach={40} /> : null}
      </button>
    </>
  )
}

function MoveForm({ onDone }: { onDone: () => void }) {
  const accounts = useAccounts()
  const logMove = useMutation(api.money.logMove)
  const [from, setFrom] = useState<Id<'accounts'> | null>(null)
  const [to, setTo] = useState<Id<'accounts'> | null>(null)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const fromAcc = accounts.find((a) => a._id === from)
  const ok = from !== null && to !== null && num(amount) > 0
  return (
    <>
      <Amount
        value={amount}
        onChange={setAmount}
        currency={currency}
        currencies={fromAcc?.currencies ?? ['EUR']}
        onCurrency={setCurrency}
      />
      <span className="label-caps">from</span>
      <AccountChips
        accounts={accounts}
        value={from}
        onChange={(id) => {
          setFrom(id)
          if (to === id) setTo(null)
        }}
      />
      <span className="label-caps">to</span>
      <AccountChips
        accounts={accounts}
        value={to}
        onChange={setTo}
        exclude={from}
      />
      <p className="text-[12.5px] text-ink-500">
        Between your own accounts — not spending, not income. When a statement
        shows it later it is matched, not counted twice.
      </p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="note (optional)"
        aria-label="Note"
        className={FIELD}
      />
      <When value={date} onChange={setDate} />
      <SaveButton
        label={
          ok
            ? `move ${currency === 'EUR' ? '€' : currency + ' '}${amount}`
            : 'move'
        }
        disabled={!ok}
        onSave={async () => {
          if (!from || !to) return
          await logMove({
            fromAccountId: from,
            toAccountId: to,
            amount: num(amount),
            currency,
            occurredAt: at(date),
            note: note || undefined,
          })
          onDone()
        }}
      />
    </>
  )
}

function OutForm({ onDone }: { onDone: () => void }) {
  const accounts = useAccounts()
  const logOut = useMutation(api.money.logOut)
  const [account, setAccount] = useState<Id<'accounts'> | null>(null)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [category, setCategory] = useState('shopping')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const acc = accounts.find((a) => a._id === account)
  const ok = account !== null && num(amount) > 0
  return (
    <>
      <Amount
        value={amount}
        onChange={setAmount}
        currency={currency}
        currencies={acc?.currencies ?? ['EUR']}
        onCurrency={setCurrency}
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Purchase"
        aria-label="What it was"
        className={FIELD}
      />
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {SPEND_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={category === c.id}
            onClick={() => setCategory(c.id)}
            className={`motion-press flex flex-col items-center gap-1 rounded-[12px] px-1 py-2.5 text-[12px] ring-1 ring-inset ${
              category === c.id
                ? 'bg-lav-400/14 text-foreground ring-lav-400/50'
                : 'text-ink-300 ring-lift/10 hover:ring-lift/25'
            }`}
          >
            <MoneyIcon
              kind="expense"
              category={c.id}
              className="size-4 text-area"
            />
            {c.label}
          </button>
        ))}
      </div>
      <span className="label-caps">paid from</span>
      <AccountChips accounts={accounts} value={account} onChange={setAccount} />
      <When value={date} onChange={setDate} />
      <SaveButton
        label={
          ok
            ? `save · −${currency === 'EUR' ? '€' : currency + ' '}${amount}`
            : 'save'
        }
        disabled={!ok}
        onSave={async () => {
          if (!account) return
          await logOut({
            accountId: account,
            amount: num(amount),
            currency,
            category,
            occurredAt: at(date),
            note: note || undefined,
          })
          onDone()
        }}
      />
    </>
  )
}

const IN_KINDS = [
  'bonus',
  'IRS return',
  'gift',
  'sold something',
  'other',
] as const

function InForm({
  onDone,
  onTransfer,
}: {
  onDone: () => void
  onTransfer: () => void
}) {
  const accounts = useAccounts()
  const logIn = useMutation(api.money.logIn)
  const [account, setAccount] = useState<Id<'accounts'> | null>(null)
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [kind, setKind] = useState<string>('bonus')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const acc = accounts.find((a) => a._id === account)
  const ok = account !== null && num(amount) > 0
  return (
    <>
      <Amount
        value={amount}
        onChange={setAmount}
        currency={currency}
        currencies={acc?.currencies ?? ['EUR']}
        onCurrency={setCurrency}
      />
      <span className="label-caps">
        what came in — salary arrives through Bills
      </span>
      <div className="flex flex-wrap gap-1.5">
        {IN_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={kind === k ? PILL_LOUD : PILL_QUIET}
          >
            {k}
          </button>
        ))}
        {/* Money that came from another of his accounts is a transfer, not
            income — offered here because that is where he looks for it. */}
        <button type="button" onClick={onTransfer} className={PILL_QUIET}>
          <ArrowLeftRight className="size-3" />
          transfer
        </button>
      </div>
      <span className="label-caps">into</span>
      <AccountChips accounts={accounts} value={account} onChange={setAccount} />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="note (optional)"
        aria-label="Note"
        className={FIELD}
      />
      <When value={date} onChange={setDate} />
      <SaveButton
        label={
          ok
            ? `save · +${currency === 'EUR' ? '€' : currency + ' '}${amount}`
            : 'save'
        }
        disabled={!ok}
        onSave={async () => {
          if (!account) return
          await logIn({
            accountId: account,
            amount: num(amount),
            currency,
            category: kind,
            occurredAt: at(date),
            note: note || undefined,
          })
          onDone()
        }}
      />
    </>
  )
}
