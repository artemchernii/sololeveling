import { describe, expect, test } from 'vitest'

import { BUILTIN_AREAS, nextHue, resolveSlug, slugify } from './area-slug'

describe('a label becomes a slug that is safe in a CSS custom property', () => {
  test('lowercases, and joins words with a hyphen', () => {
    expect(slugify('Gym & Health')).toBe('gym-health')
    expect(slugify('English')).toBe('english')
    expect(slugify('  Side  Projects ')).toBe('side-projects')
  })

  test('keeps letters outside ASCII out of the slug', () => {
    // The slug is interpolated into `--area-<slug>` and must stay an ident.
    expect(slugify('Português')).toBe('portugu-s')
  })

  test('refuses a label that leaves nothing, or starts with a digit', () => {
    expect(slugify('!!!')).toBeNull()
    expect(slugify('   ')).toBeNull()
    expect(slugify('2026 goals')).toBeNull()
  })

  test('the ten built-ins are the ten the schema used to name', () => {
    expect(BUILTIN_AREAS.map((a) => a.slug)).toEqual([
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
    ])
  })

  test('every built-in slug survives slugify unchanged', () => {
    for (const area of BUILTIN_AREAS) {
      expect(slugify(area.slug), area.slug).toBe(area.slug)
    }
  })
})

describe('a new area lands in the widest gap, and never on the accent', () => {
  test('never returns a hue inside the accent gap', () => {
    /* Inside the band, not past it: 345° is a perfectly good area hue, and an
       assertion of `< 265` would have called it a failure. The accent owns
       265–305 and nothing else. */
    const taken: Array<number> = []
    for (let i = 0; i < 12; i++) {
      const hue = nextHue(taken)
      expect(hue >= 265 && hue <= 305, `pick ${i} was ${hue}`).toBe(false)
      taken.push(hue)
    }
  })

  test('splits the widest gap among the ten built-ins', () => {
    const taken = BUILTIN_AREAS.map((a) => a.hue)
    /* Sorted, with the accent's edges thrown in: 15, 50, 88, 122, 155, 190,
       225, 250, [265–305 is the accent], 330, 352. The gaps are 35, 38, 34,
       33, 35, 35, 25, 15, — 25, 22, and 23 to wrap round to 15. The widest is
       50 → 88, so a new area lands halfway along it. */
    expect(nextHue(taken)).toBe(69)
  })

  test('the same hue is never handed out twice in a row', () => {
    const taken = BUILTIN_AREAS.map((a) => a.hue)
    const first = nextHue(taken)
    const second = nextHue([...taken, first])
    expect(second).not.toBe(first)
  })
})

describe('a retired area sends its verbs somewhere', () => {
  const areas = [
    { slug: 'life' },
    { slug: 'knowledge', replacedBy: 'life' },
    { slug: 'body' },
  ]

  test('a live slug resolves to itself', () => {
    expect(resolveSlug('body', areas)).toBe('body')
  })

  test('a retired slug resolves to its replacement', () => {
    expect(resolveSlug('knowledge', areas)).toBe('life')
  })

  test('a slug with no row at all resolves to itself', () => {
    expect(resolveSlug('invented', areas)).toBe('invented')
  })
})
