import { describe, expect, test } from 'vitest'

import { THEME_KEY, THEME_SCRIPT, readPreference, resolveTheme } from './theme'

/* THEME_SCRIPT runs before React and resolveTheme runs after; if they ever
   disagree, the page paints one theme and React switches it to the other.
   So the script itself is run here, against a fake page, for every case. */
function runScript(
  getItem: (key: string) => string | null,
  systemLight: boolean,
): Record<string, string> {
  const attrs: Record<string, string> = {}
  new Function('window', 'document', 'localStorage', THEME_SCRIPT)(
    { matchMedia: () => ({ matches: systemLight }) },
    {
      documentElement: {
        setAttribute: (name: string, value: string) => (attrs[name] = value),
      },
    },
    { getItem },
  )
  return attrs
}

describe('the theme follows the device unless told otherwise', () => {
  test('system follows the device', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })

  test('a choice overrides the device', () => {
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('light', false)).toBe('light')
  })

  test('anything unreadable is System', () => {
    expect(readPreference(null)).toBe('system')
    expect(readPreference('sepia')).toBe('system')
  })
})

describe('the head script agrees with resolveTheme', () => {
  const cases: Array<[string | null, boolean]> = [
    [null, true],
    [null, false],
    ['system', true],
    ['system', false],
    ['light', false],
    ['dark', true],
    ['sepia', true],
  ]
  for (const [stored, systemLight] of cases) {
    test(`stored ${String(stored)}, device ${systemLight ? 'light' : 'dark'}`, () => {
      const attrs = runScript(
        (key) => (key === THEME_KEY ? stored : null),
        systemLight,
      )
      expect(attrs['data-theme']).toBe(
        resolveTheme(readPreference(stored), systemLight),
      )
    })
  }

  test('a browser that refuses storage does not throw', () => {
    expect(() =>
      runScript(() => {
        throw new Error('denied')
      }, false),
    ).not.toThrow()
  })
})
