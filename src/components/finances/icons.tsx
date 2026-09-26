import {
  Briefcase,
  Bus,
  CircleHelp,
  Coins,
  Ellipsis,
  Gamepad2,
  HeartPulse,
  House,
  Plane,
  Shirt,
  ShoppingBasket,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { MoneyKind } from '@/lib/money'

/* One icon per money category (Finances F1), so a day on the calendar and a
   row in a list say what it was before the words do. Unsorted wears the
   warning colour, like every row on Body and Languages asking to be filed. */
const SPEND: Record<string, LucideIcon> = {
  groceries: ShoppingBasket,
  'eating out': UtensilsCrossed,
  transport: Bus,
  home: House,
  health: HeartPulse,
  fun: Gamepad2,
  clothes: Shirt,
  travel: Plane,
  other: Ellipsis,
}

const INCOME: Record<string, LucideIcon> = {
  salary: Wallet,
  freelance: Briefcase,
  other: Coins,
}

export function MoneyIcon({
  kind,
  category,
  className,
}: {
  kind: MoneyKind
  category: string | null
  className?: string
}) {
  if (category === null) {
    return <CircleHelp className={`${className ?? ''} text-state-warn`} />
  }
  const Icon =
    (kind === 'expense' ? SPEND : INCOME)[category] ??
    (kind === 'expense' ? Ellipsis : Coins)
  return <Icon className={className} />
}
