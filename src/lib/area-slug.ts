/* An area's identity, and the three pure things that make one.

   The slug is permanent and the label is not (PLAN.md §4, R6 decision 1).
   That split exists because the slug is written into six tables, indexed by
   `logs.by_owner_area_time`, and named literally by seventeen capture verbs
   and by monthCounts' tile rules — so renaming an area must not be able to
   touch it. What you read on screen is the label; what is stored is this.

   Nothing here imports React or Convex, because both sides import it: the
   client for its pickers and `convex/areas.ts` for its guards. */

export const BUILTIN_AREAS = [
  /* The ten, in the order every picker lists them, with the hues they were
     given in tokens.css. `projects` leads because it is the one most tasks
     want. Its 352° sits 22° from style and 23° from social rather than the
     ~35° the other nine keep — the honest cost of a tenth area on a wheel
     with a gap in it, and half the argument for R6 existing. */
  { slug: 'projects', label: 'Projects', hue: 352 },
  { slug: 'business', label: 'Business', hue: 50 },
  { slug: 'portuguese', label: 'Portuguese', hue: 190 },
  { slug: 'body', label: 'Body', hue: 155 },
  { slug: 'money', label: 'Money', hue: 88 },
  { slug: 'social', label: 'Social', hue: 15 },
  { slug: 'career', label: 'Career', hue: 250 },
  { slug: 'style', label: 'Style', hue: 330 },
  { slug: 'knowledge', label: 'Knowledge', hue: 225 },
  { slug: 'life', label: 'Life', hue: 122 },
] as const

/** The ten the code may still name literally — capture verbs, tile rules, nav
    items. Anything Artem invents is a plain `string`. */
export type BuiltinArea = (typeof BUILTIN_AREAS)[number]['slug']

/* The hues the lavender accent owns (§3d, tokens.css item 5). The accent
   means live and focus, and no area may be mistaken for it — which used to be
   a convention whoever edited the stylesheet had to remember, and is now a
   number two functions read. */
export const ACCENT_FROM = 265
export const ACCENT_TO = 305

/**
 * A label as a slug, or null when the label cannot make one.
 *
 * The result is interpolated straight into `--area-<slug>` in a `<style>`
 * element (AreaStyles.tsx), so it is restricted to `[a-z0-9-]` starting with a
 * letter: that is a valid CSS ident, and it is also why nothing a person types
 * can close the element or inject a declaration.
 */
export function slugify(label: string): string | null {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length === 0 || !/^[a-z]/.test(slug)) {
    return null
  }
  return slug
}

/**
 * The hue for a new area: the middle of the widest gap between the hues
 * already taken, with the accent's span treated as taken.
 *
 * Assigned once, at creation, and stored — never recomputed. Recomputing
 * would re-colour every existing area each time one is added, and an area's
 * colour is the thing you recognise it by before you have read it.
 */
export function nextHue(taken: ReadonlyArray<number>): number {
  const points = [...taken, ACCENT_FROM, ACCENT_TO].sort((a, b) => a - b)
  let best = 0
  let width = -1
  for (let i = 0; i < points.length; i++) {
    const from = points[i]
    /* Past the last point the wheel wraps to the first one, 360° on. */
    const to = i + 1 < points.length ? points[i + 1] : points[0] + 360
    /* The accent's own span is not a gap to put an area in. */
    if (from === ACCENT_FROM && to === ACCENT_TO) {
      continue
    }
    if (to - from > width) {
      width = to - from
      best = Math.round((from + to) / 2) % 360
    }
  }
  return best
}

/**
 * Where a slug's rows should be filed *now*: itself, unless it was retired
 * with a replacement, in which case that one.
 *
 * One hop, deliberately. `areas.retire` refuses to point at a retired area,
 * so a chain cannot form — and a loop here would be a hang in the capture
 * path, which is the one place in the app that may never wait.
 */
export function resolveSlug(
  slug: string,
  areas: ReadonlyArray<{ slug: string; replacedBy?: string }>,
): string {
  const row = areas.find((a) => a.slug === slug)
  return row?.replacedBy ?? slug
}
