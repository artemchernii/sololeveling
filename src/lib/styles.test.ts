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
