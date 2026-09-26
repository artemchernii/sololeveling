import type { ReactNode } from 'react'

import { areaVars } from '@/lib/areas'

/* The frosted card every section of Body and Languages sits in (25 Sep).
   They were bare text on the ground, which read as a page nobody finished.
   A thin edge of the area's colour across the top says whose card it is;
   the title wears the same colour. */
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
      className={`glass motion-arrive relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-[22px] p-5 sm:p-6 ${className}`}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-linear-to-r from-(--area) via-(--area)/35 to-transparent"
      />
      <header className="flex min-w-0 items-baseline justify-between gap-3">
        <h2 className="label-caps truncate text-area">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}
