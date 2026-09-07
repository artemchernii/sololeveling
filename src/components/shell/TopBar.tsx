import { UserButton } from '@clerk/tanstack-react-start'
import { Bell, Plus, Search } from 'lucide-react'

/* PLAN.md §3: ■ SOLO LEVELING · Search ⌘K · bell · ARTEM ▾, plus the persistent
   "Log something" button. The ⌘K palette itself is Phase 3 — these two controls
   are inert until then, and say so rather than pretending to work. */
export function TopBar() {
  return (
    <header className="flex items-center gap-3 pb-4">
      <button
        type="button"
        disabled
        title="Quick capture arrives in Phase 3"
        className="glass flex h-9 flex-1 items-center gap-2 rounded-[11px] px-3 text-left text-[12.5px] text-ink-600 disabled:cursor-default"
      >
        <Search className="size-3.5" />
        Search
        <kbd className="label-caps ml-auto rounded-[4px] bg-white/5 px-1.5 py-0.5">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        disabled
        title="Quick capture arrives in Phase 3"
        className="flex h-9 items-center gap-2 rounded-[11px] border border-lav-500/60 px-3 text-[12.5px] font-medium text-lav-300 transition-colors hover:bg-lav-900/60 disabled:cursor-default disabled:opacity-60"
      >
        <Plus className="size-3.5" />
        Log something
      </button>

      <button
        type="button"
        disabled
        className="glass grid size-9 place-items-center rounded-[11px] text-ink-500 disabled:cursor-default"
        aria-label="Notifications"
      >
        <Bell className="size-3.5" />
      </button>

      <UserButton
        appearance={{
          elements: { userButtonAvatarBox: 'size-9 rounded-[11px]' },
        }}
      />
    </header>
  )
}
