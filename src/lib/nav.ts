import {
  Activity,
  CalendarDays,
  Compass,
  Euro,
  Inbox,
  Languages,
  Layers,
  LayoutDashboard,
  MoreHorizontal,
  Notebook,
  Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { Area } from './capture-parser'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  /** The area whose colour the item wears. Only where the page *is* an area
      — the TRACK pages — because colour says what a thing is (§3d). The rest
      are places, not areas. Notes wore knowledge until it joined BUILD on 15
      Sep, where it was the one coloured icon in a grey group. */
  area?: Area
}

export type NavGroup = {
  /* Rendered in mono caps — the label voice from PLAN.md §3. */
  heading: string
  items: Array<NavItem>
}

/**
 * The one definition of the sidebar — PLAN.md §3, rethought 15 Sep: fewer
 * places, each one deep. NOW is the day and the week that closes it. BUILD is
 * what the day is chosen from: the projects, the goals above them, the backlog
 * beneath, and the notes that feed them. TRACK is the three areas with numbers
 * of their own. Settings sits below the groups (SideNav.tsx).
 *
 * Languages wears the `portuguese` colour and Finances the `money` one. Those
 * are slugs, not labels: since R6 (21 Sep) renaming an area changes what you
 * read and never what is stored, so these two keep working however the areas
 * are named — and a slug being permanent is what lets them be written here at
 * all. There is no enum left to rename. R6b builds the pages themselves.
 */
export const navGroups: Array<NavGroup> = [
  {
    heading: 'NOW',
    items: [
      { to: '/dashboard', label: 'Today', icon: LayoutDashboard },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/reviews', label: 'Review', icon: Compass },
    ],
  },
  {
    heading: 'BUILD',
    items: [
      { to: '/projects', label: 'Projects', icon: Layers },
      { to: '/goals', label: 'Goals', icon: Target },
      { to: '/backlog', label: 'Backlog', icon: Inbox },
      { to: '/notes', label: 'Notes', icon: Notebook },
    ],
  },
  {
    heading: 'TRACK',
    items: [
      { to: '/finances', label: 'Finances', icon: Euro, area: 'money' },
      { to: '/body', label: 'Body', icon: Activity, area: 'body' },
      {
        to: '/languages',
        label: 'Languages',
        icon: Languages,
        area: 'portuguese',
      },
    ],
  },
]

/** Bottom nav on mobile (PLAN.md §3): five destinations, thumb-reachable. */
export const mobileNav: Array<NavItem> = [
  { to: '/dashboard', label: 'Today', icon: LayoutDashboard },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/projects', label: 'Projects', icon: Layers },
  { to: '/notes', label: 'Notes', icon: Notebook },
  { to: '/settings', label: 'More', icon: MoreHorizontal },
]
