import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { MoneyIcon } from '@/components/finances/icons'
import { UndoOrError, useUndoWindow } from '@/components/track/DidButton'
import { Sparks } from '@/components/track/Sparks'
import { toNumber } from '@/lib/capture-parser'
import { categoriesFor } from '@/lib/money'
import type { MoneyKind } from '@/lib/money'

/* The phone's way in (F1, 26 Sep), beside ⌘L: type the amount, tap what it
   was on — the tap is the save. A note is optional and becomes the row's
   words. Out or in is one switch; out is the default because it is the
   daily one. The same undo window every one-tap log has. */
export function AddMoney() {
  const create = useMutation(api.logs.create)
  const [kind, setKind] = useState<MoneyKind>('expense')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [burst, setBurst] = useState<{ id: string; n: number } | null>(null)
  const { press, takeBack, canUndo, failed } = useUndoWindow()
  const amountRef = useRef<HTMLInputElement>(null)

  const value = toNumber(amount.trim())
  const ready = value !== null && value > 0

  function log(category: string) {
    if (!ready) {
      amountRef.current?.focus()
      return
    }
    const text = note.trim() || undefined
    setBurst((b) => ({ id: category, n: (b?.n ?? 0) + 1 }))
    press(() =>
      create({
        kind,
        area: 'money',
        occurredAt: Date.now(),
        value: Math.round(value * 100) / 100,
        unit: 'eur',
        text,
        category,
      }),
    )
    setAmount('')
    setNote('')
  }

  return (
    <section className="glass flex flex-col gap-3.5 rounded-[22px] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps flex-1">log money</span>
        <UndoOrError undo={canUndo} failed={failed} onUndo={takeBack} />
        <div
          role="radiogroup"
          aria-label="Out or in"
          className="inline-flex rounded-full p-0.5 ring-1 ring-lift/12 ring-inset"
        >
          {(
            [
              ['expense', 'out', ArrowDownRight],
              ['income', 'in', ArrowUpRight],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`motion-press inline-flex items-center gap-1 rounded-full px-3 py-1 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors ${
                kind === k
                  ? 'bg-lav-400/15 text-foreground ring-1 ring-lav-400/45 ring-inset'
                  : 'text-ink-400 hover:text-foreground'
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-1 rounded-[14px] bg-lift/[0.05] px-3 py-2 ring-1 ring-lift/12 ring-inset focus-within:ring-lav-400/50">
          <span className="text-[22px] font-light text-ink-400">€</span>
          <input
            ref={amountRef}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            aria-label="Amount in euros"
            className="w-24 bg-transparent text-[26px] leading-none font-light text-foreground placeholder:text-ink-600 focus:outline-none"
          />
        </label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="what on (optional)"
          aria-label="Note"
          className="min-w-0 flex-1 rounded-[14px] bg-lift/[0.05] px-3 py-3 text-[14px] text-foreground ring-1 ring-lift/12 ring-inset placeholder:text-ink-500 focus:ring-lav-400/50 focus:outline-none"
        />
      </div>

      <div
        key={kind}
        className="motion-arrive grid grid-cols-3 gap-1.5 sm:grid-cols-5"
      >
        {categoriesFor(kind).map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => log(c.id)}
            aria-disabled={!ready}
            style={{ animationDelay: `${i * 30}ms` }}
            className={`motion-press motion-land relative flex min-h-[64px] flex-col items-center justify-center gap-1.5 rounded-[14px] px-2 py-2 text-[12.5px] ring-1 transition-colors ring-inset ${
              ready
                ? 'bg-lift/[0.04] text-ink-100 ring-lav-400/20 hover:bg-lav-400/10 hover:text-foreground hover:ring-lav-400/50'
                : 'bg-lift/[0.02] text-ink-500 ring-lift/8'
            }`}
          >
            <span
              className={`grid size-7 place-items-center rounded-full ${
                ready ? 'bg-(--area)/15 text-area' : 'text-ink-600'
              }`}
            >
              <MoneyIcon kind={kind} category={c.id} className="size-4" />
            </span>
            {c.label}
            {burst?.id === c.id ? (
              <Sparks key={burst.n} count={12} reach={34} />
            ) : null}
          </button>
        ))}
      </div>
      {!ready ? (
        <p className="text-[12px] text-ink-500">
          Type the amount, then tap what it was — or{' '}
          <span className="font-mono text-ink-300">⌘L spend 48 groceries</span>.
        </p>
      ) : null}
    </section>
  )
}
