import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

/* A test about a stylesheet, because the failure it guards was invisible in
   dev: a hand-written `-webkit-backdrop-filter` beside `backdrop-filter` gets
   collapsed by the production minifier into the prefixed one alone, and
   Chrome then draws no blur anywhere. See the note above `@utility glass`. */
describe('the glass survives the production build', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

  test('backdrop-filter is never prefixed by hand', () => {
    expect(css).not.toMatch(/^\s*-webkit-backdrop-filter\s*:/m)
  })

  test('the glass utilities still blur', () => {
    for (const name of [
      'glass',
      'glass-bar',
      'glass-modal',
      'glass-scrim',
      'glass-menu',
    ]) {
      const block = new RegExp(`@utility ${name} \\{[^}]*backdrop-filter:`)
      expect(css, name).toMatch(block)
    }
  })
})

describe('an area colour is a hue on a lightness the theme owns (R6)', () => {
  const tokens = readFileSync(
    new URL('../styles/tokens.css', import.meta.url),
    'utf8',
  )

  test('no area declares its own oklch any more', () => {
    /* The ten moved into rows. A `--area-body: oklch(...)` left behind here
       would win in one theme and lose in the other depending on where the
       generated block lands — which is exactly the bug to keep out. */
    expect(tokens).not.toMatch(/--area-[a-z-]+\s*:\s*oklch/)
  })

  test('both themes declare a lightness and a chroma for areas', () => {
    expect(tokens.match(/--area-l\s*:/g)).toHaveLength(2)
    expect(tokens.match(/--area-c\s*:/g)).toHaveLength(2)
  })
})
