import { useEffect, useState } from 'react'

/* ✦ ASK on cards: a card's ✦ hands its question to the drawer, which
   opens and puts it in the box. Page memory only, like the thread; `n`
   counts the presses, so the same ✦ twice fills the box twice. */

export type Prefill = { q: string; n: number }

let kept: Prefill | null = null
const listeners = new Set<(p: Prefill) => void>()

/** Opens ASK with `q` in the box. Never sends it. */
export function askAbout(q: string) {
  kept = { q, n: (kept?.n ?? 0) + 1 }
  for (const l of listeners) l(kept)
}

/** The latest ✦ pressed while this component is on screen. */
export function usePrefill() {
  const [p, setP] = useState<Prefill | null>(null)
  useEffect(() => {
    listeners.add(setP)
    return () => void listeners.delete(setP)
  }, [])
  return p
}
