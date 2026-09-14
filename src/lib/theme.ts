/* Which theme the app shows, and how it is decided (PLAN §3d.4; decided with
   Artem 14 Sep): follow the device's appearance — macOS and iOS "Auto" already
   switch at sunset — unless Settings forces Light or Dark.

   The choice lives in this browser's localStorage, not in Convex: appearance
   belongs to a device (the phone in the sun, the laptop at night), and it has
   to be known before the first paint, long before a query could answer. */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_KEY = 'sl-theme'

export const PREFERENCES: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function readPreference(raw: string | null): ThemePreference {
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersLight: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersLight ? 'light' : 'dark'
  return preference
}

/* The browser chrome and the phone's status bar: each theme's ground, as hex,
   because a meta tag cannot read a CSS variable. */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: '#07070b',
  light: '#f4f0e9',
}

/**
 * Runs in <head> before anything paints, so the page never shows the wrong
 * theme and then corrects itself. Plain ES5 on purpose: it is a string
 * injected into the document, never bundled, and it must not throw — a
 * private window can refuse localStorage, and the fallback is the default.
 * Mirrors readPreference / resolveTheme above; theme.test.ts runs it to make
 * sure it still does.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var light=t==='light'||(t!=='dark'&&window.matchMedia('(prefers-color-scheme: light)').matches);document.documentElement.setAttribute('data-theme',light?'light':'dark');}catch(e){}})();`
