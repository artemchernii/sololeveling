import { Link } from '@tanstack/react-router'

import { mobileNav } from '@/lib/nav'

/* Bottom nav under 1024. PLAN.md §3 asks for 48–56px rows on mobile, so the
   tap targets here are 56px tall — not the 40px a desktop-first component
   would default to. */
export function MobileNav() {
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-20 flex rounded-t-[18px] px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
      {mobileNav.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className="flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] text-ink-600"
          activeProps={{
            className:
              'flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px] text-lav-300',
          }}
        >
          <item.icon className="size-[18px]" />
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
