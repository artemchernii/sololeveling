import { Link } from '@tanstack/react-router'
import { Settings } from 'lucide-react'

import { navGroups } from '@/lib/nav'

/* Desktop rail (≥1024). Fourteen destinations is too many for a flat list, so
   they are grouped DO / TRACK / KNOW per PLAN.md §3, with Settings pinned. */
export function SideNav() {
  return (
    <nav className="glass hidden w-[214px] shrink-0 flex-col gap-[22px] rounded-[22px] p-4 lg:flex">
      <div className="flex items-center gap-[9px] px-[10px] pt-1">
        <span className="size-3.5 rounded-[4px] bg-lav-500" aria-hidden />
        <span className="text-[11px] font-medium tracking-[0.2em] text-foreground">
          SOLO LEVELING
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-[22px]">
        {navGroups.map((group) => (
          <div key={group.heading} className="flex flex-col gap-[3px]">
            <div className="label-caps px-[10px] pb-[5px]">{group.heading}</div>
            {group.items.map((item) => (
              <NavLink key={item.to} to={item.to} label={item.label} />
            ))}
          </div>
        ))}
      </div>

      <NavLink to="/settings" label="Settings" icon={Settings} />
    </nav>
  )
}

function NavLink({
  to,
  label,
  icon: Icon,
}: {
  to: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-[9px] px-[10px] py-[7px] text-[12.5px] text-ink-400 transition-colors hover:bg-white/5 hover:text-foreground"
      activeProps={{
        className:
          'flex items-center gap-2 rounded-[9px] px-[10px] py-[7px] text-[12.5px] font-medium bg-white/[0.09] text-foreground',
      }}
    >
      {Icon ? <Icon className="size-3.5" /> : null}
      {label}
    </Link>
  )
}
