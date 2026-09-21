import { useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../convex/_generated/api'
import { BUILTIN_AREAS } from './area-slug'

export type AreaRow = { slug: string; label: string; hue: number }

const BUILTIN_ROWS: Array<AreaRow> = BUILTIN_AREAS.map((a) => ({ ...a }))

/**
 * The areas, in his order, as every picker lists them.
 *
 * This was a hard-coded array of ten until R6 (21 Sep). The built-ins are
 * returned while the query is in flight rather than an empty list, because an
 * empty list is a picker with nothing in it — and the ten are what the rows
 * say anyway until he has edited one.
 */
export function useAreas(): Array<AreaRow> {
  const areas = useQuery(api.areas.list, {})
  if (areas === undefined) {
    return BUILTIN_ROWS
  }
  return areas.map((a) => ({ slug: a.slug, label: a.label, hue: a.hue }))
}

/**
 * A slug as the word he reads.
 *
 * Falls back to the slug itself for an area that was retired (it is not in
 * the live list, but rows still carry it) or one this client has not loaded
 * yet. A slug is a real word, so showing it is always better than showing
 * nothing — and it is exactly what every badge showed before R6.
 */
export function useAreaLabel(): (slug: string | undefined) => string {
  const areas = useQuery(api.areas.list, { includeRetired: true })
  return useCallback(
    (slug: string | undefined) => {
      if (slug === undefined) {
        return 'unfiled'
      }
      return (
        areas?.find((a) => a.slug === slug)?.label ??
        BUILTIN_ROWS.find((a) => a.slug === slug)?.label ??
        slug
      )
    },
    [areas],
  )
}

/* An area's colour, handed to an element as a custom property so one static
   set of classes — `bg-(--area)/14 text-(--area)` — can paint any of them.
   Assembling `bg-area-${area}` from a string would compile to nothing:
   Tailwind generates the classes it can read in source, and it cannot read a
   template literal.

   Unchanged by R6, deliberately. The twenty-odd call sites hand it a slug and
   get back `--area`, exactly as before; what changed is only who declares
   `--area-<slug>` (AreaStyles.tsx, from a row) and how many there can be. */
export function areaVars(area: string): CSSProperties {
  return { '--area': `var(--area-${area})` } as CSSProperties
}
