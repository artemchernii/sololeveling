import { useEffect, useState } from 'react'

import type { LineContext } from '@/lib/marketAsk'

/* ✦ ASK on cards: a card's ✦ hands its question to the drawer, which
   opens and puts it in the box. Page memory only, like the thread; `n`
   counts the presses, so the same ✦ twice fills the box twice. */

export type Prefill = { q: string; n: number; line?: LineContext }

let kept: Prefill | null = null
const listeners = new Set<(p: Prefill) => void>()

/** Opens ASK with `q` in the box — and, from IDEAS, the line it is on.
    Never sends it. */
export function askAbout(q: string, line?: LineContext) {
  kept = { q, n: (kept?.n ?? 0) + 1, ...(line && { line }) }
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

/* IDEAS' own questions (29 Oct): while the board is open, ASK — docked
   or the drawer — offers them instead of the four market ones. */
let offered: Array<unknown> | null = null
const offerListeners = new Set<(o: Array<unknown> | null) => void>()

export function offerQuestions<T>(o: Array<T> | null) {
  offered = o
  for (const l of offerListeners) l(offered)
}

export function useOffered<T>(): Array<T> | null {
  const [o, setO] = useState(offered)
  useEffect(() => {
    offerListeners.add(setO)
    setO(offered)
    return () => void offerListeners.delete(setO)
  }, [])
  return o as Array<T> | null
}
