import type { ReactNode } from 'react'

import { areaVars } from '@/lib/areas'

/* The window every section of Body and Languages sits in (25 Sep; the
   System look 26 Sep). They were bare text on the ground, which read as a
   page nobody finished; then frosted cards edged in the area's colour,
   which made a red page and a green page two different apps. Now each is a
   System window — lavender edge, corner brackets, `[ TITLE ]` — and the
   area's colour is the small mark beside the title and the icons inside. */
export function TrackPanel({
  area,
  title,
  aside,
  children,
  className = '',
  delay = 0,
}: {
  area: string
  title: ReactNode
  aside?: ReactNode
  children: ReactNode
  className?: string
  /** Stagger, in ms, so a page's cards arrive one after another. */
  delay?: number
}) {
  return (
    <section
      style={{ ...areaVars(area), animationDelay: `${delay}ms` }}
      className={`system-frame motion-arrive relative flex min-w-0 flex-col gap-4 p-5 sm:p-6 ${className}`}
    >
      <header className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="system-title flex min-w-0 items-center gap-2 truncate">
          <span
            aria-hidden
            className="size-1.5 shrink-0 rotate-45 bg-(--area) shadow-[0_0_6px_var(--area)]"
          />
          <span className="truncate">[ {title} ]</span>
        </h2>
        {aside}
      </header>
      {children}
    </section>
  )
}
