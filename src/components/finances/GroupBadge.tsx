import {
  Car,
  Circle,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  PartyPopper,
  Plane,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  TramFront,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { categoryLabel } from '@/lib/money'

/* A row's group as a badge with its icon (4 Oct: "eating out, fun,
   subscription can be badges or icons" — in place of YOUR NAME / KNOWN,
   which said where a name came from and nothing he wanted). */

const ICONS: Record<string, LucideIcon> = {
  groceries: ShoppingBasket,
  'eating out': UtensilsCrossed,
  transport: TramFront,
  home: House,
  health: HeartPulse,
  fun: PartyPopper,
  clothes: Shirt,
  travel: Plane,
  car: Car,
  shopping: ShoppingBag,
  subscriptions: Repeat,
  learning: GraduationCap,
  lent: HandCoins,
  salary: Wallet,
  freelance: Wallet,
}

export function GroupBadge({
  kind,
  category,
  open,
  onClick,
}: {
  kind: 'expense' | 'income'
  category: string | null
  /** Its picker is open (the badge is the button). */
  open?: boolean
  onClick?: () => void
}) {
  const Icon = (category && ICONS[category]) || Circle
  const unsorted = category === null
  const cls = `inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] ring-1 ring-inset ${
    unsorted
      ? 'bg-state-warn/12 text-state-warn ring-state-warn/30'
      : 'bg-lav-400/10 text-lav-200 ring-lav-400/25'
  } ${onClick ? 'cursor-pointer transition-colors hover:bg-lav-400/18' : ''} ${
    open ? 'bg-lav-400/18 ring-lav-400/50' : ''
  }`
  const body = (
    <>
      <Icon className="size-3" aria-hidden />
      {unsorted ? 'file it' : categoryLabel(kind, category)}
    </>
  )
  return onClick ? (
    <span
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick()
      }}
      className={cls}
    >
      {body}
    </span>
  ) : (
    <span className={cls}>{body}</span>
  )
}

/** "✓ paid", said in colour (4 Oct: "paid is bland"). */
export function PaidChip({ label = 'paid' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-state-good/14 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-state-good uppercase ring-1 ring-state-good/30 ring-inset">
      ✓ {label}
    </span>
  )
}
