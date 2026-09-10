import { UserButton } from '@clerk/tanstack-react-start'
import { Bell, Plus, Search } from 'lucide-react'

import { Key } from './Key'

/* PLAN.md §3: ■ SOLO LEVELING · Search ⌘K · bell · ARTEM ▾, plus the persistent
   "Log something" button. Full-bleed above the rail at the wireframe's 58px,
   with the brand at the left edge. Search is a pill, not a field: it opens the
   ⌘K palette and never holds a cursor.

   Search is given a fixed width rather than being sized to the word, so it
   reads as the field it stands for: icon at the left edge, ⌘K pushed to the
   right, the space between them the room a query would occupy. Every control
   in the row is 36px so they share a baseline.

   Log is filled, not outlined. It is the one thing this app exists to make
   fast, and it was the palest object in its own header — an outline beside an
   outline beside an outline. The accent stays reserved for live and focus
   things (§3 Visual); this is the most focused thing on the screen, and the
   fill is the same lavender the border already spent, at full strength.

   The two controls open two different modals, because their Enter keys do
   opposite things: Search navigates, Log writes a row. Both modals live in the
   shell so that the mobile pill and these buttons open one instance rather
   than two racing for the same ⌘K.

   Under 768 the two pills are gone: they do not fit beside the brand on a
   phone, and the sticky pill above the bottom nav is the thumb-reachable way
   in that §3 asks for. */
export function TopBar({
  onLog,
  onSearch,
}: {
  onLog: () => void
  onSearch: () => void
}) {
  return (
    <header className="glass-bar sticky top-0 z-20 flex h-[58px] shrink-0 items-center justify-between px-[18px] lg:px-6">
      <div className="flex items-center gap-[10px]">
        <span className="size-3.5 rounded-[4px] bg-lav-500" aria-hidden />
        <span className="text-[12px] font-medium tracking-[0.2em] text-foreground">
          SOLO LEVELING
        </span>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onLog}
          className="hidden h-9 items-center gap-[7px] rounded-[10px] bg-lav-500 pr-4 pl-3 text-[12.5px] font-medium text-lav-900 transition-colors hover:bg-lav-400 md:flex"
        >
          <Plus className="size-[17px]" strokeWidth={2.5} />
          Log
        </button>

        <button
          type="button"
          onClick={onSearch}
          className="hidden h-9 w-[180px] items-center gap-2.5 rounded-[10px] border border-white/10 bg-black/20 pr-2 pl-3 text-[12.5px] text-ink-400 transition-colors hover:border-white/20 md:flex"
        >
          <Search className="size-[18px] shrink-0 text-ink-500" />
          Search
          <span className="ml-auto">
            <Key>⌘K</Key>
          </span>
        </button>

        <button
          type="button"
          disabled
          className="relative hidden size-9 place-items-center rounded-[10px] border border-white/10 bg-black/20 text-ink-400 disabled:cursor-default md:grid"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          <span className="absolute top-[6px] right-[7px] size-[5px] rounded-full bg-lav-500" />
        </button>

        <UserButton
          appearance={{
            elements: { userButtonAvatarBox: 'size-9 rounded-[10px]' },
          }}
        />
      </div>
    </header>
  )
}
