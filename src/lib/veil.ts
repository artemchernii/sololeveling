import { useSyncExternalStore } from 'react'

/* Money you hold, hidden until asked (26 Sep, Artem: "balance / networth by
   default is blurred and button to show"). One switch for the whole app,
   kept in memory only: every visit to a page with the eye starts hidden
   again (the eye re-hides as it leaves), and a reload always does. Never
   in storage — "shown" is not a preference, it is this moment. */

let shown = false
const listeners = new Set<() => void>()

function set(next: boolean) {
  if (shown === next) return
  shown = next
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useVeil(): {
  shown: boolean
  toggle: () => void
  hide: () => void
} {
  const value = useSyncExternalStore(
    subscribe,
    () => shown,
    () => false,
  )
  return { shown: value, toggle: () => set(!shown), hide: () => set(false) }
}

/** For tests: back to hidden. */
export function resetVeil() {
  set(false)
}
