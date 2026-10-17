import {
  CupSoda,
  Dumbbell,
  GitCommitHorizontal,
  Languages,
  Send,
  TrendingUp,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { areaVars } from '@/lib/areas'

/* Today's icons (17 Oct): an area's colour on the icon only, never the
   card ("don't make entire card of lang blue — only icon"). */
export const ICONS: Record<string, LucideIcon> = {
  body: Dumbbell,
  shake: CupSoda,
  social: Send,
  projects: GitCommitHorizontal,
  money: TrendingUp,
  language: Languages,
}

export function AreaIcon({
  icon,
  area,
  size = 26,
}: {
  icon: keyof typeof ICONS
  area: string
  size?: number
}) {
  const Icon = ICONS[icon]
  if (size < 18)
    return (
      <Icon
        aria-hidden
        style={areaVars(area)}
        className="shrink-0 text-(--area)"
        width={size - 2}
        height={size - 2}
        strokeWidth={1.8}
      />
    )
  return (
    <span
      aria-hidden
      style={{ ...areaVars(area), width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-[8px] border border-lift/[0.09] bg-lift/[0.03] text-(--area)"
    >
      <Icon className="size-3.5" strokeWidth={1.8} />
    </span>
  )
}
