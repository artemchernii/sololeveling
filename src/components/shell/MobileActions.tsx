import { Plus, Search } from 'lucide-react'

/* PLAN.md §3, mobile: the way in, above the bottom nav and inside the thumb's
   reach. Two now, because ⌘K does not exist on a phone — without a Search
   button here, half the app's navigation is desktop-only.

   Unequal on purpose. Log is the thing done every day and carries the label
   and the fill; Search is occasional and is an icon. They open the same two
   modals as the desktop buttons — one implementation each, because a
   phone-shaped copy of either would drift from it within a week.

   Floating, so it needs to look like it: 14px of clear ground above the nav's
   56px row, and a z above it. At the same z and touching, the nav painted last
   and its rounded top edge cut across the Log pill — the pair read as one
   welded object rather than two buttons over a bar.

   Hidden from 768 up, where the TopBar's own pair is already visible. */
export function MobileActions({
  onLog,
  onSearch,
}: {
  onLog: () => void
  onSearch: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-[calc(70px+env(safe-area-inset-bottom))] z-30 mx-auto flex w-[min(320px,86vw)] items-center gap-2.5 md:hidden">
      <button
        type="button"
        onClick={onLog}
        className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-lav-500 text-[13.5px] font-medium text-lav-900 shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--sink)_90%,transparent)]"
      >
        <Plus className="size-[18px]" strokeWidth={2.5} />
        Log
      </button>
      <button
        type="button"
        onClick={onSearch}
        aria-label="Search"
        className="glass grid size-12 shrink-0 place-items-center rounded-full text-ink-300"
      >
        <Search className="size-[19px]" />
      </button>
    </div>
  )
}
