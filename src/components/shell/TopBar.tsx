import { UserButton } from '@clerk/tanstack-react-start'
import { Bell, Plus, Search } from 'lucide-react'

/* PLAN.md §3: ■ SOLO LEVELING · Search ⌘K · bell · ARTEM ▾, plus the persistent
   "Log something" button. Full-bleed above the rail at the wireframe's 58px,
   with the brand at the left edge and the controls sized to their content —
   Search is a pill, not a field, because it opens the ⌘K palette and never
   holds a cursor.

   Both controls open the same ⌘K palette — there is one way to log something,
   reachable by mouse or by keyboard. The palette itself lives in the shell, so
   that the mobile pill and these buttons open one instance rather than two
   racing for the same ⌘K.

   Under 768 the two pills are gone: they do not fit beside the brand on a
   phone, and the sticky pill above the bottom nav is the thumb-reachable way
   in that §3 asks for. */
export function TopBar({ onCapture }: { onCapture: () => void }) {
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
          onClick={onCapture}
          className="hidden h-8 items-center gap-2 rounded-[10px] border border-lav-500/60 px-3 text-[11.5px] font-medium text-lav-300 transition-colors hover:bg-lav-900/60 md:flex"
        >
          <Plus className="size-3.5" />
          Log something
        </button>

        <button
          type="button"
          onClick={onCapture}
          className="hidden h-8 items-center gap-[9px] rounded-[10px] border border-white/10 bg-black/20 px-3 text-[11.5px] text-ink-400 transition-colors hover:border-white/20 md:flex"
        >
          <Search className="size-3.5" />
          Search
          <kbd className="font-mono text-[10px] text-ink-500">⌘K</kbd>
        </button>

        <button
          type="button"
          disabled
          className="relative hidden size-8 place-items-center rounded-[10px] border border-white/10 bg-black/20 text-ink-400 disabled:cursor-default md:grid"
          aria-label="Notifications"
        >
          <Bell className="size-3.5" />
          <span className="absolute top-[5px] right-[6px] size-[5px] rounded-full bg-lav-500" />
        </button>

        <UserButton
          appearance={{
            elements: { userButtonAvatarBox: 'size-8 rounded-[10px]' },
          }}
        />
      </div>
    </header>
  )
}
