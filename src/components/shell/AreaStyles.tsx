import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { BUILTIN_AREAS } from '@/lib/area-slug'

/**
 * The one place an area's hue becomes a colour.
 *
 * `areaVars(area)` hands an element `--area: var(--area-<slug>)`, and has done
 * since before areas were data — so every badge, card, tile and nav item in
 * the app already reads a custom property by slug. This element is what makes
 * those properties exist, which is why R6 changed twenty-odd call sites by
 * changing none of them.
 *
 * The built-ins render first and the rows overwrite them, in that order, so a
 * renamed or re-hued built-in wins. The app's pages do not render on the
 * server (see _app.tsx), so without that floor every badge in the app would
 * be colourless for the length of a socket round trip on a cold load.
 *
 * `includeRetired` on purpose: a retired area is gone from the pickers, not
 * from the past. The rows that still carry it keep its colour.
 *
 * Interpolation is safe by construction rather than by escaping — a slug is
 * `[a-z0-9-]` starting with a letter (slugify) and a hue is an integer 0–359
 * (areas.setHue), so neither can close the element or add a declaration.
 */
export function AreaStyles() {
  const areas = useQuery(api.areas.list, { includeRetired: true })
  const rows = [
    ...BUILTIN_AREAS.map((a) => ({ slug: a.slug, hue: a.hue })),
    ...(areas ?? []).map((a) => ({ slug: a.slug, hue: a.hue })),
  ]
  const css = rows
    .map(
      ({ slug, hue }) =>
        `--area-${slug}:oklch(var(--area-l) var(--area-c) ${hue});`,
    )
    .join('')
  return <style>{`:root{${css}}`}</style>
}
