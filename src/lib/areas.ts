import { useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../convex/_generated/api'
import { BUILTIN_AREAS, resolveSlug } from './area-slug'

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
   set of classes — `bg-(--area)/14 text-area` — can paint any of them.
   Assembling `bg-area-${area}` from a string would compile to nothing:
   Tailwind generates the classes it can read in source, and it cannot read a
   template literal.

   Unchanged by R6, deliberately. The twenty-odd call sites hand it a slug and
   get back `--area`, exactly as before; what changed is only who declares
   `--area-<slug>` (AreaStyles.tsx, from a row) and how many there can be. */
export function areaVars(area: string): CSSProperties {
  return {
    '--area': `var(--area-${area})`,
    /* Its readable twin for text — the same colour unless the area is
       bold (AreaStyles.tsx). Read through the `text-area` utility. */
    '--area-ink': `var(--area-${area}-ink)`,
  } as CSSProperties
}

/**
 * Where a slug's new rows should be filed now — itself, unless it was retired
 * with a replacement (R6 decision 5).
 *
 * A capture verb's area is a slug in code, so `note` names `knowledge`
 * forever. When he retires `knowledge` and sends its capture words to `life`,
 * this is what makes `note` actually land there. One hop: `areas.retire`
 * refuses to point at a retired area, so no chain can form.
 *
 * The rows are already in the client's cache — the same query AreaStyles and
 * every picker read — so this costs the capture path nothing, which matters
 * because that path may never wait on anything.
 */
export function useAreaRedirect(): (slug: string) => string {
  const areas = useQuery(api.areas.list, { includeRetired: true })
  return useCallback((slug: string) => resolveSlug(slug, areas ?? []), [areas])
}

/** Slug → label, for searchVerbs: the `/` list should find a verb by the name
    he gave its area, because that is the word he thinks in. */
export function useAreaLabels(): Record<string, string> {
  const areas = useAreas()
  return Object.fromEntries(areas.map((a) => [a.slug, a.label]))
}
