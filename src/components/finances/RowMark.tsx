import {
  Briefcase,
  Bus,
  Car,
  Gamepad2,
  GraduationCap,
  HandCoins,
  HeartPulse,
  House,
  Laptop,
  Plane,
  Receipt,
  Repeat,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Utensils,
  Wrench,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { AccountLogo } from '@/components/finances/Logo'
import { payeeSite } from '@/lib/payeeSites'

/* What stands at the start of a money row (11 Oct). A shop the app knows
   shows its own logo. A row that names no shop — BPI prints "Habitação e
   Rendas", "Seguros" — shows the icon of the group it is filed under ("i
   see no logos"). Only a row with neither falls back to what the screen
   had before. The ids are src/lib/money.ts's; "other" has no picture. */
const GROUP_ICON: Record<string, LucideIcon> = {
  groceries: ShoppingCart,
  'eating out': Utensils,
  transport: Bus,
  home: House,
  phone: Smartphone,
  health: HeartPulse,
  fun: Gamepad2,
  clothes: Shirt,
  travel: Plane,
  car: Car,
  shopping: ShoppingBag,
  subscriptions: Repeat,
  services: Wrench,
  learning: GraduationCap,
  fees: Receipt,
  lent: HandCoins,
  salary: Briefcase,
  freelance: Laptop,
}

export function RowMark({
  name,
  category,
  income = false,
  size = 26,
  children,
}: {
  name: string
  category: string | null
  /** Money in keeps its green square. */
  income?: boolean
  size?: number
  /** What the row shows when there is no shop and no group. */
  children: ReactNode
}) {
  const site = payeeSite(name)
  if (site !== null)
    return <AccountLogo name={name} domain={site} size={size} />
  const Icon = category === null ? undefined : GROUP_ICON[category]
  if (Icon === undefined) return <>{children}</>
  return (
    <span
      data-group={category}
      title={category ?? undefined}
      style={{ width: size, height: size, borderRadius: size / 3.2 }}
      className={`grid shrink-0 place-items-center ${
        income
          ? 'bg-state-good/14 text-state-good'
          : 'bg-lift/[0.07] text-ink-200'
      }`}
    >
      <Icon className="size-3.5" />
    </span>
  )
}
