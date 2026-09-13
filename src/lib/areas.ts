import type { CSSProperties } from 'react'

import type { Area } from './capture-parser'

/** The nine, in the order every picker lists them. */
export const AREAS: Array<Area> = [
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
   set of classes — `bg-(--area)/14 text-(--area)` — can paint any of the nine.
   Assembling `bg-area-${area}` from a string would compile to nothing:
   Tailwind generates the classes it can read in source, and it cannot read a
   template literal. */
export function areaVars(area: Area): CSSProperties {
  return { '--area': `var(--area-${area})` } as CSSProperties
}
