import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from '@tanstack/react-router'
import { Search } from 'lucide-react'

import { Hint, PaletteShell } from './PaletteShell'
import { Key } from './Key'
import { matchPalette } from '@/lib/palette'
import type { PaletteEntry } from '@/lib/palette'

/* ⌘K. Type a word to find a page, a slash to name one, `/log` to hand over to
   the capture modal.

   Enter here only ever navigates or opens another modal — it never writes. The
   one thing in this app that writes a row lives behind its own door, because a
   mistaken Enter there invents evidence, and every count on the dashboard is
   made of that evidence.

   Content — a note, a task, a project by its text — is the next layer, and
   needs search indexes in convex/schema.ts that do not exist yet. */
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
  const slashed = query.trim().startsWith('/')

  /* Cleared on close, not on open: reopening should be a blank box, and doing
     it here means the next open renders empty rather than flashing the last
     query for a frame. */
  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  function run(entry: PaletteEntry) {
    onOpenChange(false)
    if (entry.target.kind === 'capture') {
      onLog(prefill)
      return
    }
    void navigate({ to: entry.target.to })
  }

  const empty = commands.length === 0 && pages.length === 0

  return (
    <PaletteShell
      open={open}
      onOpenChange={onOpenChange}
      label="Search"
      icon={Search}
      placeholder="Search, or / for commands"
      value={query}
      onValueChange={setQuery}
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
        {empty ? (
          <div className="px-5 py-4 text-[13px] text-ink-500">
            Nothing here matches “{query.trim()}”. Pages and commands only for
            now — notes and tasks are next.
          </div>
        ) : null}

        {commands.length > 0 ? (
          <Command.Group heading="Commands">
            {commands.map((entry) => (
              <Row key={entry.slash} entry={entry} onRun={run} showSlash />
            ))}
          </Command.Group>
        ) : null}

        {pages.length > 0 ? (
          <Command.Group heading="Pages">
            {pages.map((entry) => (
              <Row
                key={entry.slash}
                entry={entry}
                onRun={run}
                showSlash={slashed}
              />
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </PaletteShell>
  )
}

function Row({
  entry,
  onRun,
  showSlash,
}: {
  entry: PaletteEntry
  onRun: (entry: PaletteEntry) => void
  showSlash: boolean
}) {
  const Icon = entry.icon
  return (
    <Command.Item
      value={entry.slash}
      onSelect={() => onRun(entry)}
      className="mx-1.5 flex cursor-pointer items-center gap-3 rounded-[10px] px-3.5 py-2 text-[13.5px] text-ink-300 data-[selected=true]:bg-white/[0.07] data-[selected=true]:text-foreground"
    >
      <Icon className="size-4 shrink-0 text-ink-500" aria-hidden />
      {entry.label}
      {/* The route, shown while you are typing one, so the slash vocabulary is
          learnable from the list rather than from documentation. */}
      {showSlash ? (
        <span className="ml-auto font-mono text-[11px] text-ink-600">
          {entry.slash}
        </span>
      ) : null}
    </Command.Item>
  )
}
