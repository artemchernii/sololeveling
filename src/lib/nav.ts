import {
  Activity,
  BookOpen,
  Briefcase,
  CalendarDays,
  Compass,
  Euro,
  Inbox,
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

import type { Area } from './capture-parser'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  /** The area whose colour the item wears. Only where the page *is* an area
      — the TRACK pages, and KNOW, which is knowledge — because colour says
      what a thing is (§3d), and Dashboard is not any one area. */
  area?: Area
}

export type NavGroup = {
  /* Rendered in mono caps — the label voice from PLAN.md §3. */
  heading: string
  items: Array<NavItem>
}

/**
 * The one definition of the sidebar.
 *
 * Four groups, not PLAN.md §3's original three (14 Sep). DO held two different
 * things: what is happening today, and the planning that feeds it. NOW is the
 * day — the dashboard, its three quests, the calendar. PLAN is what the day is
 * chosen from — goals, the chains under them, and the backlog of everything
 * not yet picked.
 */
export const navGroups: Array<NavGroup> = [
  {
    heading: 'NOW',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/quests', label: 'Quests', icon: ListChecks },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
  {
    heading: 'PLAN',
    items: [
      { to: '/goals', label: 'Goals', icon: Target },
      { to: '/projects', label: 'Projects', icon: Layers },
      { to: '/backlog', label: 'Backlog', icon: Inbox },
    ],
  },
  {
    heading: 'TRACK',
    items: [
      { to: '/money', label: 'Money', icon: Euro, area: 'money' },
      { to: '/body', label: 'Body', icon: Activity, area: 'body' },
      { to: '/social', label: 'Social', icon: Users, area: 'social' },
      {
        to: '/portuguese',
        label: 'Portuguese',
        icon: Languages,
        area: 'portuguese',
      },
      { to: '/career', label: 'Career', icon: Briefcase, area: 'career' },
      { to: '/style', label: 'Style', icon: Shirt, area: 'style' },
    ],
  },
  {
    heading: 'KNOW',
    items: [
      { to: '/notes', label: 'Notes', icon: Notebook, area: 'knowledge' },
      {
        to: '/knowledge',
        label: 'Knowledge',
        icon: BookOpen,
        area: 'knowledge',
      },
      {
        to: '/principles',
        label: 'Principles',
        icon: Scale,
        area: 'knowledge',
      },
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
