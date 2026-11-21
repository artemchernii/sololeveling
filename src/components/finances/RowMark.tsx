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

/* Each group's own colour (tokens.css 12, 31 Oct): what it is, never how
   much. A group not here keeps the plain tile. */
const GROUP_TONE: Record<string, string> = {
  groceries: 'var(--grp-groceries)',
  'eating out': 'var(--grp-eating)',
  transport: 'var(--grp-transport)',
  car: 'var(--grp-transport)',
  home: 'var(--grp-home)',
  phone: 'var(--grp-bills)',
  subscriptions: 'var(--grp-bills)',
  services: 'var(--grp-bills)',
  fees: 'var(--grp-bills)',
  health: 'var(--grp-health)',
  fun: 'var(--grp-fun)',
  shopping: 'var(--grp-shopping)',
  clothes: 'var(--grp-shopping)',
  travel: 'var(--grp-travel)',
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
  const tone = category === null ? undefined : GROUP_TONE[category]
  if (Icon === undefined) return <>{children}</>
  return (
    <span
      data-group={category}
      title={category ?? undefined}
      style={
        {
          width: size,
          height: size,
          borderRadius: size / 3.2,
          '--g': tone,
        } as React.CSSProperties
      }
      className={`grid shrink-0 place-items-center ${
        income
          ? 'bg-state-good/14 text-state-good'
          : tone
            ? 'bg-(--g)/16 text-(--g)'
            : 'bg-lift/[0.07] text-ink-200'
      }`}
    >
      <Icon className={size > 30 ? 'size-4' : 'size-3.5'} />
    </span>
  )
}
