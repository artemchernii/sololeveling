import type { CSSProperties } from 'react'

import type { Area } from './capture-parser'

/** The ten, in the order every picker lists them. `projects` leads because it
    is the one most tasks want, and it is listed here rather than derived so
    that R6 has one place to replace. */
export const AREAS: Array<Area> = [
  'projects',
  'business',
  'portuguese',
  'body',
  'money',
  'social',
  'career',
  'style',
  'knowledge',
  'life',
]

/* An area's colour, handed to an element as a custom property so one static
   set of classes — `bg-(--area)/14 text-(--area)` — can paint any of the ten.
   Assembling `bg-area-${area}` from a string would compile to nothing:
   Tailwind generates the classes it can read in source, and it cannot read a
   template literal. */
export function areaVars(area: Area): CSSProperties {
  return { '--area': `var(--area-${area})` } as CSSProperties
}
