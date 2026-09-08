import { Plus } from 'lucide-react'

/* PLAN.md §3, mobile: a sticky "+ Log something" pill, above the bottom nav
   and inside the thumb's reach.
 
   It opens the same ⌘K palette as the desktop buttons — capture has one
   implementation and one parser, and a phone-shaped second one would drift
   from it within a week. Hidden from 768 up, where the TopBar's pill is
   already visible. */
export function LogPill({ onCapture }: { onCapture: () => void }) {
  return (
    <button
      type="button"
      onClick={onCapture}
      className="glass fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-20 mx-auto flex h-12 w-[min(320px,86vw)] items-center justify-center gap-2 rounded-full text-[13px] font-medium text-lav-300 md:hidden"
    >
      <Plus className="size-4" />
      Log something
    </button>
  )
}
