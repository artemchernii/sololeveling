import { Check } from 'lucide-react'

import { Sparks } from '@/components/track/Sparks'
import type { AccountKind } from '@/lib/currency'

const KIND_STYLE: Record<AccountKind, string> = {
  bank: 'text-acct-bank ring-acct-bank/35 bg-acct-bank/8',
  broker: 'text-lav-300 ring-lav-400/40 bg-lav-400/10',
  cash: 'text-acct-cash ring-acct-cash/35 bg-acct-cash/8',
}

export function KindBadge({ kind }: { kind: AccountKind }) {
  return (
    <span
      className={`rounded-[6px] px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.14em] uppercase ring-1 ring-inset ${KIND_STYLE[kind]}`}
    >
      {kind}
    </span>
  )
}

/** A balance saved: a tick that lands, and the words — then the sheet
    closes on its own. */
export function SavedNote({
  name,
  title,
  note = 'saved today',
}: {
  name: string
  title?: string
  note?: string
}) {
  return (
    <div className="motion-land flex flex-col items-center gap-3 py-8 text-center">
      <span
        className="motion-pop relative grid size-16 place-items-center rounded-full bg-state-good/16 text-state-good shadow-[0_0_36px_-6px_var(--color-state-good)] ring-1 ring-state-good/45"
        style={{ '--area': 'var(--color-state-good)' } as React.CSSProperties}
      >
        <Check className="size-8" strokeWidth={2.5} />
        <Sparks count={14} reach={46} />
      </span>
      <span className="text-[22px] font-light text-foreground">
        {title ?? `${name} is up to date`}
      </span>
      <span className="font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase">
        {note}
      </span>
    </div>
  )
}
