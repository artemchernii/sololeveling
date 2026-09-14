import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
/* The one exception to the cached hook: search runs a query per keystroke, and
   keeping every half-typed term subscribed for minutes buys nothing. */
// eslint-disable-next-line no-restricted-imports
import { useQuery } from 'convex/react'
import { useNavigate } from '@tanstack/react-router'
import {
  CalendarDays,
  Layers,
  ListChecks,
  Notebook,
  Scale,
  Search,
  Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Hint, PaletteShell } from './PaletteShell'
import { Key } from './Key'
import { api } from '../../../convex/_generated/api'
import { matchPalette } from '@/lib/palette'
import type { PaletteEntry } from '@/lib/palette'

/* ⌘K. A word finds a page or one of your own rows, a slash names a route, and
   `/log` hands over to the capture modal.

   Enter here only ever navigates or opens another modal — it never writes. The
   one thing in this app that writes a row lives behind its own door, because a
   mistaken Enter there invents evidence, and every count on the dashboard is
   made of that evidence.

   Sections are never merged into one ranked list. Ordering a note against a
   task needs a relevance number, and a number with no sanctioned source is
   what PLAN.md §1 forbids — so Convex orders within a kind and nothing orders
   across them. */

const KIND_SECTIONS: Array<{
  kind: string
  heading: string
  icon: LucideIcon
}> = [
  { kind: 'task', heading: 'Tasks', icon: ListChecks },
  { kind: 'project', heading: 'Projects', icon: Layers },
  { kind: 'goal', heading: 'Goals', icon: Target },
  { kind: 'note', heading: 'Notes', icon: Notebook },
  { kind: 'event', heading: 'Events', icon: CalendarDays },
  { kind: 'principle', heading: 'Principles', icon: Scale },
]

export function SearchPalette({
  open,
  onOpenChange,
  onLog,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLog: (prefill: string) => void
}) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const { commands, pages, prefill } = matchPalette(query)
  const trimmed = query.trim()
  const slashed = trimmed.startsWith('/')

  /* A slash means "only the things I can name", so it does not go to the
     database at all — and an empty box has nothing to look for. 'skip' rather
     than a guard inside the query so no subscription is opened either. */
  const searching = trimmed.length > 0 && !slashed
  const hits = useQuery(
    api.search.everything,
    searching ? { query: trimmed } : 'skip',
  )
  const loading = searching && hits === undefined

  /* Cleared on close, not on open: reopening should be a blank box, and doing
     it here means the next open renders empty rather than flashing the last
     query for a frame. */
  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  function go(to: string) {
    onOpenChange(false)
    void navigate({ to })
  }

  function run(entry: PaletteEntry) {
    if (entry.target.kind === 'capture') {
      onOpenChange(false)
      onLog(prefill)
      return
    }
    go(entry.target.to)
  }

  const nothing =
    commands.length === 0 &&
    pages.length === 0 &&
    !loading &&
    (hits?.length ?? 0) === 0

  return (
    <PaletteShell
      open={open}
      onOpenChange={onOpenChange}
      label="Search"
      icon={Search}
      placeholder="Search, or / for commands"
      value={query}
      onValueChange={setQuery}
      onClear={() => setQuery('')}
      footer={
        <>
          <Hint>
            <Key>↑</Key>
            <Key>↓</Key>
            navigate
          </Hint>
          <Hint>
            <Key>↵</Key>
            open
          </Hint>
          <Hint className="ml-auto">
            <Key>esc</Key>
            close
          </Hint>
        </>
      }
    >
      <Command.List className="max-h-[46vh] overflow-y-auto pb-2">
        {/* Only once the search has answered. Saying "nothing matches" while
            the query is still in flight is a false negative, and it would show
            on every first keystroke. */}
        {nothing ? (
          <div className="px-5 py-4 text-[13px] text-ink-500">
            Nothing matches “{trimmed}”.
          </div>
        ) : null}

        {commands.length > 0 ? (
          <Command.Group heading="Commands">
            {commands.map((entry) => (
              <Row
                key={entry.slash}
                value={entry.slash}
                icon={entry.icon}
                label={entry.label}
                meta={entry.slash}
                onSelect={() => run(entry)}
              />
            ))}
          </Command.Group>
        ) : null}

        {pages.length > 0 ? (
          <Command.Group heading="Pages">
            {pages.map((entry) => (
              <Row
                key={entry.slash}
                value={entry.slash}
                icon={entry.icon}
                label={entry.label}
                /* The route, shown while you are typing one, so the slash
                   vocabulary is learnable from the list rather than from
                   documentation. */
                meta={slashed ? entry.slash : undefined}
                onSelect={() => run(entry)}
              />
            ))}
          </Command.Group>
        ) : null}

        {KIND_SECTIONS.map(({ kind, heading, icon }) => {
          const rows = (hits ?? []).filter((row) => row.kind === kind)
          if (rows.length === 0) {
            return null
          }
          return (
            <Command.Group key={kind} heading={heading}>
              {rows.map((row) => (
                <Row
                  key={row.id}
                  value={`${kind}-${row.id}`}
                  icon={icon}
                  label={row.title}
                  subtitle={row.subtitle}
                  onSelect={() => go(row.to)}
                />
              ))}
            </Command.Group>
          )
        })}
      </Command.List>
    </PaletteShell>
  )
}

function Row({
  value,
  icon: Icon,
  label,
  subtitle,
  meta,
  onSelect,
}: {
  value: string
  icon: LucideIcon
  label: string
  subtitle?: string
  meta?: string
  onSelect: () => void
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="mx-1.5 flex cursor-pointer items-center gap-3 rounded-[10px] px-3.5 py-2 text-[13.5px] text-ink-300 data-[selected=true]:bg-lift/[0.07] data-[selected=true]:text-foreground"
    >
      <Icon className="size-4 shrink-0 text-ink-500" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {subtitle ? (
          <span className="block truncate text-[12px] text-ink-600">
            {subtitle}
          </span>
        ) : null}
      </span>
      {meta ? (
        <span className="shrink-0 font-mono text-[11px] text-ink-600">
          {meta}
        </span>
      ) : null}
    </Command.Item>
  )
}
