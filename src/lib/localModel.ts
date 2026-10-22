import { useSyncExternalStore } from 'react'

import { MARKET_READ_MODEL, isLocalModel } from './marketRead'
import type { LocalModel } from './marketRead'

/* The model Claude Code answers with on his Mac (22 Oct: "locally I want
   to be able to change models"). One pick for every localhost answer —
   ⌘J, Insights ASK and the read — kept per browser. The deployed API path
   never reads it: ⌘J stays on ROWS_ASK_MODEL, Insights on
   MARKET_READ_MODEL. */

const KEY = 'sl.localModel'
const listeners = new Set<() => void>()
let picked: LocalModel | null = null

/** The pick, else Sonnet 5.5. Storage that throws (a private window,
    blocked site data) gives the default, never a crash. */
export function localModel(): LocalModel {
  if (picked) return picked
  let saved: string | null = null
  try {
    saved = localStorage.getItem(KEY)
  } catch {
    saved = null
  }
  picked = isLocalModel(saved) ? saved : MARKET_READ_MODEL
  return picked
}

export function setLocalModel(m: LocalModel) {
  picked = m
  try {
    localStorage.setItem(KEY, m)
  } catch {
    /* kept for this page only */
  }
  for (const l of listeners) l()
}

/** Every switch on the page shows the same pick. */
export function useLocalModel(): LocalModel {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    localModel,
    () => MARKET_READ_MODEL as LocalModel,
  )
}
