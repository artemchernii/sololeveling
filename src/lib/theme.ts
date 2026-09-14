/* Which theme the app shows, and how it is decided (PLAN §3d; decided with
   Artem 14 Sep): follow the device's appearance — macOS and iOS "Auto" already
   switch at sunset — unless Settings forces Light or Dark.

   The choice lives in this browser's localStorage, not in Convex: appearance
   belongs to a device (the phone in the sun, the laptop at night), and it has
   to be known before the first paint, long before a query could answer. */

export type ThemePreference = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/* On trial: three light palettes, until Artem picks one (tokens.css, 7). */
export type LightPalette = 'milky' | 'paper' | 'dusk'

export const THEME_KEY = 'sl-theme'
export const PALETTE_KEY = 'sl-palette'

export const PREFERENCES: Array<ThemePreference> = ['system', 'light', 'dark']
export const PALETTES: Array<{ value: LightPalette; label: string }> = [
  { value: 'milky', label: 'Milky glass' },
  { value: 'paper', label: 'Cool paper' },
  { value: 'dusk', label: 'Soft dusk' },
]

export function readPreference(raw: string | null): ThemePreference {
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

export function readPalette(raw: string | null): LightPalette {
  return raw === 'paper' || raw === 'dusk' ? raw : 'milky'
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersLight: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersLight ? 'light' : 'dark'
  return preference
}

/* The browser chrome and the phone's status bar, per theme: each palette's
   ground, as hex, because a meta tag cannot read a CSS variable. */
export const THEME_COLOR: Record<ResolvedTheme | LightPalette, string> = {
  dark: '#07070b',
  light: '#f4f0e9',
  milky: '#f4f0e9',
  paper: '#eef0f4',
  dusk: '#d6d2e0',
}

/**
 * Runs in <head> before anything paints, so the page never shows the wrong
 * theme and then corrects itself. Plain ES5 on purpose: it is a string
 * injected into the document, never bundled, and it must not throw — a
 * private window can refuse localStorage, and the fallback is the default.
 * Mirrors readPreference / readPalette / resolveTheme above.
 */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement;var t=localStorage.getItem('${THEME_KEY}');var p=localStorage.getItem('${PALETTE_KEY}');var light=t==='light'||(t!=='dark'&&window.matchMedia('(prefers-color-scheme: light)').matches);d.setAttribute('data-theme',light?'light':'dark');d.setAttribute('data-palette',p==='paper'||p==='dusk'?p:'milky');}catch(e){}})();`
