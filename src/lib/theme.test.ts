import { describe, expect, test } from 'vitest'

import {
  PALETTE_KEY,
  THEME_KEY,
  THEME_SCRIPT,
  readPalette,
  readPreference,
  resolveTheme,
} from './theme'

/* THEME_SCRIPT runs before React and resolveTheme runs after; if they ever
   disagree, the page paints one theme and React switches it to the other.
   So the script itself is run here, against a fake page, for every case. */
function runScript(stored: Record<string, string>, systemLight: boolean) {
  const attrs: Record<string, string> = {}
  const fakeWindow = {
    matchMedia: () => ({ matches: systemLight }),
  }
  const fakeDocument = {
    documentElement: {
      setAttribute: (name: string, value: string) => (attrs[name] = value),
    },
  }
  const fakeStorage = { getItem: (key: string) => stored[key] ?? null }
  new Function('window', 'document', 'localStorage', THEME_SCRIPT)(
    fakeWindow,
    fakeDocument,
    fakeStorage,
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

  test('anything unreadable falls back to the defaults', () => {
    expect(readPreference(null)).toBe('system')
    expect(readPreference('sepia')).toBe('system')
    expect(readPalette(null)).toBe('milky')
    expect(readPalette('neon')).toBe('milky')
  })
})

describe('the head script agrees with resolveTheme', () => {
  const cases: Array<[string | undefined, boolean]> = [
    [undefined, true],
    [undefined, false],
    ['system', true],
    ['light', false],
    ['dark', true],
    ['sepia', true],
  ]
  for (const [stored, systemLight] of cases) {
    test(`stored ${String(stored)}, device ${systemLight ? 'light' : 'dark'}`, () => {
      const attrs = runScript(
        stored === undefined ? {} : { [THEME_KEY]: stored },
        systemLight,
      )
      expect(attrs['data-theme']).toBe(
        resolveTheme(readPreference(stored ?? null), systemLight),
      )
    })
  }

  test('and on the palette', () => {
    for (const raw of [undefined, 'milky', 'paper', 'dusk', 'neon']) {
      const attrs = runScript(raw ? { [PALETTE_KEY]: raw } : {}, true)
      expect(attrs['data-palette']).toBe(readPalette(raw ?? null))
    }
  })

  test('a browser that refuses storage still gets a theme, silently', () => {
    const attrs: Record<string, string> = {}
    expect(() =>
      new Function('window', 'document', 'localStorage', THEME_SCRIPT)(
        { matchMedia: () => ({ matches: false }) },
        {
          documentElement: {
            setAttribute: (n: string, v: string) => (attrs[n] = v),
          },
        },
        {
          getItem: () => {
            throw new Error('denied')
          },
        },
      ),
    ).not.toThrow()
  })
})
