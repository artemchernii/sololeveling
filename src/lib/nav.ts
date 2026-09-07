import {
  Activity,
  BookOpen,
  Briefcase,
  CalendarDays,
  Compass,
  Euro,
  Layers,
  LayoutDashboard,
  Languages,
  ListChecks,
  Notebook,
  Scale,
  Shirt,
  Target,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
}

export type NavGroup = {
  /* Rendered in mono caps — the label voice from PLAN.md §3. */
  heading: string
  items: Array<NavItem>
}

/** The one definition of the sidebar. PLAN.md §3: DO / TRACK / KNOW. */
export const navGroups: Array<NavGroup> = [
  {
    heading: 'DO',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/quests', label: 'Quests', icon: ListChecks },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/goals', label: 'Goals', icon: Target },
      { to: '/projects', label: 'Projects', icon: Layers },
    ],
  },
  {
    heading: 'TRACK',
    items: [
      { to: '/money', label: 'Money', icon: Euro },
      { to: '/body', label: 'Body', icon: Activity },
      { to: '/social', label: 'Social', icon: Users },
      { to: '/portuguese', label: 'Portuguese', icon: Languages },
      { to: '/career', label: 'Career', icon: Briefcase },
      { to: '/style', label: 'Style', icon: Shirt },
    ],
  },
  {
    heading: 'KNOW',
    items: [
      { to: '/notes', label: 'Notes', icon: Notebook },
      { to: '/knowledge', label: 'Knowledge', icon: BookOpen },
      { to: '/principles', label: 'Principles', icon: Scale },
    ],
  },
]

/** Bottom nav on mobile (PLAN.md §3): five destinations, thumb-reachable. */
export const mobileNav: Array<NavItem> = [
  { to: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { to: '/quests', label: 'Quests', icon: ListChecks },
  { to: '/projects', label: 'Projects', icon: Layers },
  { to: '/reviews', label: 'Month', icon: Compass },
  { to: '/settings', label: 'More', icon: Notebook },
]
