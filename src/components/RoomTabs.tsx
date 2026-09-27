import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/* The tabs under a page's hero — Finances' rooms, Body's and a language's
   tabs (27 Sep). Artem wanted them as in the Treasury mockup: one frosted
   capsule, riding under the top bar (58px) as the page scrolls, the open tab lit
   lavender inside it. The icons stay; the area colour marks the open one.
   Left, not centred as the mockup had it: it lines up with the titles and
   cards on each page (27 Sep). */
export function RoomTabs({
  label,
  style,
  children,
}: {
  label: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <nav
      aria-label={label}
      style={style}
      className="glass sticky top-[66px] z-10 bg-lav-400/10 [backdrop-filter:blur(28px)_saturate(160%)] flex w-fit max-w-full self-start gap-0.5 rounded-full p-1 sm:gap-1.5 sm:p-1.5"
    >
      {children}
    </nav>
  )
}

/** A Link's class inside RoomTabs. */
export function roomTabClass(on: boolean): string {
  return `motion-press inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full px-2.5 font-mono text-[10.5px] tracking-[0.08em] uppercase transition-colors sm:px-4 sm:text-[11.5px] sm:tracking-[0.14em] ${
    on
      ? 'bg-lav-400/16 text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-lav-400)_45%,transparent),0_0_18px_-6px_var(--system-shine)]'
      : 'text-ink-400 hover:bg-lift/[0.05] hover:text-foreground'
  }`
}

/** What goes inside the Link: the icon, then the name. */
export function RoomTabLabel({
  on,
  Icon,
  label,
}: {
  on: boolean
  Icon: LucideIcon
  label: string
}) {
  return (
    <>
      <Icon className={`size-4 ${on ? 'text-area' : ''}`} />
      {label}
    </>
  )
}
