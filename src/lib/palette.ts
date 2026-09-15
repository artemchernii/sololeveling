import { Plus, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { navGroups } from './nav'

/* What ⌘K can reach without touching the database: every page by name, and the
   handful of things the app can do. Content search — a note, a task, a project
   by its text — is a second layer over Convex search indexes and lands after
   this one.

   Two ways to reach the same row, deliberately. A leading slash matches the
   route (`/finances`, `/log`) and is what you use when you know where you are
   going; bare words match the label (`languages`) and are what you use when
   you are looking. The slash is not a mode switch so much as a way of saying
   "only the things I can name". */

export type PaletteTarget = { kind: 'page'; to: string } | { kind: 'capture' }

export type PaletteEntry = {
  /** What you type after a slash to reach it. For a page this is its route. */
  slash: string
  label: string
  icon: LucideIcon
  target: PaletteTarget
}

/** Things the app does. `/log` hands over to the capture modal — it never
    writes a row itself, so there stays exactly one parser and one
    confirmation. */
export const PALETTE_COMMANDS: Array<PaletteEntry> = [
  { slash: '/log', label: 'Log', icon: Plus, target: { kind: 'capture' } },
]

/* Built from navGroups so the palette cannot list a page the rail doesn't, or
   miss one it does. Settings is appended because it sits below the three
   groups rather than in one. Review was appended too until 15 Sep, when it
   joined NOW. */
export const PALETTE_PAGES: Array<PaletteEntry> = [
  ...navGroups.flatMap((group) =>
    group.items.map((item) => ({
      slash: item.to,
      label: item.label,
      icon: item.icon,
      target: { kind: 'page' as const, to: item.to },
    })),
  ),
  {
    slash: '/settings',
    label: 'Settings',
    icon: Settings,
    target: { kind: 'page', to: '/settings' },
  },
]

export type PaletteMatch = {
  commands: Array<PaletteEntry>
  pages: Array<PaletteEntry>
  /** Whatever followed the command, for the modal it hands over to:
      `/log workout 60` opens capture with `workout 60` already typed. */
  prefill: string
}

export function matchPalette(input: string): PaletteMatch {
  const trimmed = input.trim()

  if (trimmed.startsWith('/')) {
    const [word, ...rest] = trimmed.split(/\s+/)
    const slash = word.toLowerCase()
    const hit = (entry: PaletteEntry) => entry.slash.startsWith(slash)
    return {
      commands: PALETTE_COMMANDS.filter(hit),
      pages: PALETTE_PAGES.filter(hit),
      prefill: rest.join(' '),
    }
  }

  const query = trimmed.toLowerCase()
  const hit = (entry: PaletteEntry) =>
    query.length === 0 || entry.label.toLowerCase().includes(query)
  return {
    commands: PALETTE_COMMANDS.filter(hit),
    pages: PALETTE_PAGES.filter(hit),
    prefill: '',
  }
}
