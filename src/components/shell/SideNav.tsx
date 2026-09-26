import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Settings } from 'lucide-react'

import { areaVars } from '@/lib/areas'
import { navGroups } from '@/lib/nav'
import type { NavItem } from '@/lib/nav'

/* Desktop rail (≥1024). Ten destinations grouped NOW / BUILD / TRACK
   (lib/nav.ts, PLAN.md §3), with Settings pinned.

   Colour says what a page is: the TRACK pages wear their area's colour, the
   same one their logs wear in the Log modal. The rest stay neutral, because
   they are places, not areas — a group is all colour or none.

   The active page is marked by one pill that slides to it, rather than a
   background that jumps — a state change you caused, so it moves (§3d). */

const SETTINGS: NavItem = { to: '/settings', label: 'Settings', icon: Settings }

function isActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`)
}

export function SideNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const all = [...navGroups.flatMap((g) => g.items), SETTINGS]
  const active = all.find((item) => isActive(pathname, item.to))

  const railRef = useRef<HTMLElement>(null)
  const links = useRef(new Map<string, HTMLAnchorElement>())
  const [pill, setPill] = useState<{
    top: number
    height: number
    animate: boolean
  } | null>(null)

  /* Measured after layout, against the rail itself. The first measurement
     places the pill without animating — it would otherwise slide in from the
     top of the rail on every page load. */
  useLayoutEffect(() => {
    function place() {
      const el = active ? links.current.get(active.to) : undefined
      const rail = railRef.current
      if (!el || !rail) {
        setPill(null)
        return
      }
      const top =
        el.getBoundingClientRect().top - rail.getBoundingClientRect().top
      setPill((prev) => ({
        top,
        height: el.offsetHeight,
        animate: prev !== null,
      }))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [active])

  return (
    <nav
      ref={railRef}
      className="glass relative hidden flex-col gap-[18px] self-start rounded-[22px] p-3 lg:flex"
    >
      {pill && active ? (
        <span
          aria-hidden
          style={{
            ...(active.area ? areaVars(active.area) : {}),
            transform: `translateY(${pill.top}px)`,
            height: pill.height,
            transition: pill.animate
              ? 'transform var(--motion-base) var(--motion-ease), height var(--motion-base) var(--motion-ease), background-color var(--motion-base) var(--motion-ease)'
              : 'none',
          }}
          className={`pointer-events-none absolute inset-x-3 top-0 rounded-[10px] ${
            active.area
              ? 'bg-(--area)/14 ring-1 ring-(--area)/25 ring-inset'
              : 'bg-lift/[0.08] ring-1 ring-lift/10 ring-inset'
          }`}
        >
          {/* The edge in the page's colour, so the pill says where you are
              before the label is read. */}
          <span
            className={`absolute top-1/2 left-0 h-4 w-[3px] -translate-y-1/2 rounded-full ${
              active.area ? 'bg-(--area)' : 'bg-ink-300'
            }`}
          />
        </span>
      ) : null}

      <div className="flex flex-1 flex-col gap-[18px]">
        {navGroups.map((group) => (
          <div key={group.heading} className="flex flex-col gap-[2px]">
            <div className="flex items-center gap-2.5 px-[10px] pb-[6px]">
              <span className="font-mono text-[10px] tracking-[0.18em] text-ink-400">
                {group.heading}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-lift/[0.10] to-transparent" />
            </div>
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                item={item}
                active={active?.to === item.to}
                register={(el) => {
                  if (el) links.current.set(item.to, el)
                  else links.current.delete(item.to)
                }}
              />
            ))}
          </div>
        ))}
      </div>

      <NavLink
        item={SETTINGS}
        active={active?.to === SETTINGS.to}
        register={(el) => {
          if (el) links.current.set(SETTINGS.to, el)
          else links.current.delete(SETTINGS.to)
        }}
      />
    </nav>
  )
}

function NavLink({
  item,
  active,
  register,
}: {
  item: NavItem
  active: boolean
  register: (el: HTMLAnchorElement | null) => void
}) {
  const Icon = item.icon
  return (
    <Link
      ref={register}
      to={item.to}
      style={item.area ? areaVars(item.area) : undefined}
      className={`group relative flex items-center gap-2.5 rounded-[10px] px-[10px] py-[7px] text-[13px] transition-colors duration-(--motion-fast) ${
        active
          ? 'font-medium text-foreground'
          : 'text-ink-400 hover:bg-lift/[0.04] hover:text-foreground'
      }`}
    >
      <Icon
        className={`size-4 shrink-0 transition-[color,transform] duration-(--motion-fast) ease-(--motion-ease) group-hover:translate-x-0.5 ${
          item.area
            ? active
              ? 'text-area'
              : 'text-area/70 group-hover:text-area'
            : active
              ? 'text-foreground'
              : 'text-ink-500 group-hover:text-ink-300'
        }`}
        strokeWidth={active ? 2.2 : 1.9}
      />
      {item.label}
    </Link>
  )
}
