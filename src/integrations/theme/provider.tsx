import { createContext, useContext, useEffect, useState } from 'react'

import {
  THEME_COLOR,
  THEME_KEY,
  readPreference,
  resolveTheme,
} from '@/lib/theme'
import type { ResolvedTheme, ThemePreference } from '@/lib/theme'

/* Keeps <html data-theme> true after the first paint. The script in <head>
   (THEME_SCRIPT) set it before React existed; this takes over: it follows the
   system appearance live — the switch at sunset happens without a reload — and
   applies a choice made in Settings.

   Outside Clerk's provider, because Clerk's own surfaces (the avatar menu,
   the sign-in card) are themed from `resolved`. */

type Theme = {
  preference: ThemePreference
  setPreference: (next: ThemePreference) => void
  resolved: ResolvedTheme
}

const ThemeContext = createContext<Theme | null>(null)

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* A private window may refuse; the choice still holds for this visit. */
  }
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode
}) {
  /* The server cannot know any of this, so it renders the defaults and the
     real values are read after mount. The page itself is already right: the
     head script coloured it before React hydrated. */
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [prefersLight, setPrefersLight] = useState(false)
  /* Nothing is written to <html> until the stored choice has been read.
     Before then `resolved` is the server default — dark — and stamping it
     would flash a light page dark for a frame, undoing the head script. */
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)')
    setPreferenceState(readPreference(stored(THEME_KEY)))
    setPrefersLight(query.matches)
    setReady(true)

    const onChange = () => setPrefersLight(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved = resolveTheme(preference, prefersLight)

  useEffect(() => {
    if (!ready) return
    document.documentElement.setAttribute('data-theme', resolved)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[resolved])
  }, [ready, resolved])

  const value: Theme = {
    preference,
    setPreference: (next) => {
      store(THEME_KEY, next)
      setPreferenceState(next)
    },
    resolved,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('useTheme is used outside ThemeProvider')
  return theme
}
