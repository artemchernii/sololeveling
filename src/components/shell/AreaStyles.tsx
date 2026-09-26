import { useEffect, useState } from 'react'
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
 * The built-ins are only a floor, though: Body's is green, and his is a bold
 * crimson, so every cold load flashed green for a second (26 Sep). The rows
 * he last saw are kept in this browser and painted from the first frame; the
 * query then overwrites them as before. A convenience only — a private window
 * that refuses storage gets the built-ins, as it always did.
 *
 * `includeRetired` on purpose: a retired area is gone from the pickers, not
 * from the past. The rows that still carry it keep its colour.
 *
 * Interpolation is safe by construction rather than by escaping — a slug is
 * `[a-z0-9-]` starting with a letter (slugify) and a hue is an integer 0–359
 * (areas.setHue), so neither can close the element or add a declaration.
 */
type StyleRow = { slug: string; hue: number; bold: boolean }

const REMEMBERED_KEY = 'sl-area-styles'

function readRemembered(): Array<StyleRow> {
  try {
    const raw = localStorage.getItem(REMEMBERED_KEY)
    const parsed: unknown = raw === null ? [] : JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    /* Re-checked, because the rule above (safe by construction) only holds
       for values that came from a row. */
    return parsed.filter(
      (r): r is StyleRow =>
        typeof r === 'object' &&
        r !== null &&
        typeof r.slug === 'string' &&
        /^[a-z][a-z0-9-]*$/.test(r.slug) &&
        Number.isInteger(r.hue) &&
        r.hue >= 0 &&
        r.hue < 360 &&
        typeof r.bold === 'boolean',
    )
  } catch {
    return []
  }
}

export function AreaStyles() {
  const areas = useQuery(api.areas.list, { includeRetired: true })
  const [remembered] = useState(readRemembered)
  const fromRows: Array<StyleRow> | undefined = areas?.map((a) => ({
    slug: a.slug,
    hue: a.hue,
    bold: a.bold === true,
  }))
  const saved = fromRows === undefined ? null : JSON.stringify(fromRows)
  useEffect(() => {
    if (saved === null) return
    try {
      localStorage.setItem(REMEMBERED_KEY, saved)
    } catch {
      /* Storage refused: the next cold load starts from the built-ins. */
    }
  }, [saved])
  const rows = [
    ...BUILTIN_AREAS.map((a) => ({ slug: a.slug, hue: a.hue, bold: false })),
    ...(fromRows ?? remembered),
  ]
  /* A bold area takes the theme's deep pair (tokens.css item 5) for its
     fills. Its words keep the normal pair: a deep colour is a fine fill
     and hard to read as text on the dark ground (26 Sep, Body in bold
     crimson: "kinda hard to read"). `text-area` reads the `-ink` twin. */
  const css = rows
    .map(({ slug, hue, bold }) => {
      const ink = `oklch(var(--area-l) var(--area-c) ${hue})`
      return bold
        ? `--area-${slug}:oklch(var(--area-bold-l) var(--area-bold-c) ${hue});--area-${slug}-ink:${ink};`
        : `--area-${slug}:${ink};--area-${slug}-ink:${ink};`
    })
    .join('')
  return <style>{`:root{${css}}`}</style>
}
