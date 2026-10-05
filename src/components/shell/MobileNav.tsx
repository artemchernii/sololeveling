import { useEffect, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'

import { areaVars } from '@/lib/areas'
import { mobileNav, moreNav } from '@/lib/nav'

/* Bottom nav under 1024. PLAN.md §3 asks for 48–56px rows on mobile, so the
   tap targets here are 56px tall — not the 40px a desktop-first component
   would default to.

   More opens every page the bar leaves out (5 Oct: "on mobile i cant open
   a lot of pages" — it went straight to Settings), in the sidebar's
   groups, the TRACK pages in their area's colour. */
export function MobileNav() {
  const [open, setOpen] = useState(false)
  const path = useRouterState({ select: (s) => s.location.pathname })
  const inMore = moreNav.some((g) =>
    g.items.some((i) => path === i.to || path.startsWith(`${i.to}/`)),
  )
  /* A page chosen closes it; so does Escape. */
  useEffect(() => setOpen(false), [path])
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open])

  const tab =
    'flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[10px]'
  const bar = mobileNav.slice(0, -1)
  const More = mobileNav[mobileNav.length - 1].icon

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 bg-background/50 backdrop-blur-[2px] lg:hidden"
        />
      ) : null}
      {open ? (
        <div
          role="dialog"
          aria-label="More pages"
          className="glass motion-arrive fixed inset-x-2 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-3 rounded-[20px] p-3.5 lg:hidden"
        >
          {moreNav.map((g) => (
            <div key={g.heading} className="flex flex-col gap-1.5">
              <span className="label-caps px-1">{g.heading}</span>
              <div className="grid grid-cols-2 gap-1.5">
                {g.items.map((item) => {
                  const here =
                    path === item.to || path.startsWith(`${item.to}/`)
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      style={item.area ? areaVars(item.area) : undefined}
                      className={`flex min-h-12 items-center gap-2.5 rounded-[12px] px-3 text-[14px] ring-1 ring-inset transition-colors ${
                        here
                          ? 'bg-lav-400/12 text-foreground ring-lav-400/35'
                          : 'bg-lift/[0.03] text-ink-200 ring-lift/8 active:bg-lav-400/10'
                      }`}
                    >
                      <item.icon
                        className={`size-[18px] shrink-0 ${item.area ? 'text-area' : 'text-ink-400'}`}
                      />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <nav className="glass fixed inset-x-0 bottom-0 z-30 flex rounded-t-[18px] px-1 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {bar.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`${tab} text-ink-600`}
            activeProps={{ className: `${tab} text-lav-300` }}
          >
            <item.icon className="size-[18px]" />
            {item.label}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={`${tab} ${open || inMore ? 'text-lav-300' : 'text-ink-600'}`}
        >
          <More className="size-[18px]" />
          More
        </button>
      </nav>
    </>
  )
}
