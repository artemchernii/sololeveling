import { useEffect, useRef, useState } from 'react'

/* How a page moves from its skeleton to its content (PLAN §3d.2).

   A Convex query answers in anything from a few milliseconds to a second.
   Shown the instant data lands, a skeleton lives for however long that took —
   often 30ms, which reads as a flicker rather than as loading. So once a page
   has shown its skeleton, it keeps it for --loading-hold, and then the content
   fades in over the space it held.

   Only a page that opened without its data waits. One that already has it —
   a page visited in the last few minutes, whose subscription the query cache
   kept — renders its content on the first frame, with no skeleton and no
   delay. Nothing here slows a page that is already there. */

const FALLBACK_HOLD_MS = 800
const FALLBACK_WAIT_MS = 300

function cssMs(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim()
  const ms = raw.endsWith('ms')
    ? parseFloat(raw)
    : raw.endsWith('s')
      ? parseFloat(raw) * 1000
      : NaN
  return Number.isFinite(ms) ? ms : fallback
}

/** --loading-wait: how long a skeleton stays invisible before it shows. */
function waitMs(): number {
  return cssMs('--loading-wait', FALLBACK_WAIT_MS)
}

/** --loading-hold from tokens.css, so the number lives in one place. */
function holdMs(): number {
  return cssMs('--loading-hold', FALLBACK_HOLD_MS)
}

/**
 * The query's value, held back as `undefined` until --loading-hold has passed
 * — but only if it was `undefined` when the hold began. Wrap the query whose
 * `undefined` decides between skeleton and content:
 *
 *   const goals = useHeld(useQuery(api.goals.listActive, {}))
 *
 * A hold begins at mount, and again whenever `key` changes — pass one when the
 * same component loads something new in place, like paging to another week.
 * The key must be a primitive; an array made during render is new every time.
 */
export function useHeld<T>(value: T | undefined, key?: unknown): T | undefined {
  /* quiet — loading, and the skeleton not yet visible (it waits
     --loading-wait before it shows, in CSS); shown — the skeleton is on
     screen, so it stays at least --loading-hold; free — the value passes.
     27 Sep, "FUCKING FLICK AGAIN": a load that lands inside the wait now
     shows its content straight away, with no skeleton at all. */
  const [phase, setPhase] = useState<'quiet' | 'shown' | 'free'>(() =>
    value === undefined ? 'quiet' : 'free',
  )
  const [heldKey, setHeldKey] = useState(key)
  const shownAt = useRef(0)

  if (key !== heldKey) {
    setHeldKey(key)
    setPhase(value === undefined ? 'quiet' : 'free')
  }
  /* Landed while nothing was visible yet: through, this render. */
  if (phase === 'quiet' && value !== undefined) setPhase('free')

  useEffect(() => {
    if (phase !== 'quiet') return
    const timer = setTimeout(() => {
      shownAt.current = Date.now()
      setPhase('shown')
    }, waitMs())
    return () => clearTimeout(timer)
  }, [phase, heldKey])

  useEffect(() => {
    if (phase !== 'shown' || value === undefined) return
    const left = shownAt.current + holdMs() - Date.now()
    const timer = setTimeout(() => setPhase('free'), Math.max(0, left))
    return () => clearTimeout(timer)
  }, [phase, value])

  return phase === 'free' ? value : undefined
}

/**
 * `motion-fade` for the content that has just replaced a skeleton, and
 * nothing for content that was there from the first frame — so a page you
 * return to does not fade every time you open it.
 */
export function useArrived(value: unknown): string {
  const wasLoading = useRef(value === undefined)
  if (value === undefined) wasLoading.current = true
  return wasLoading.current && value !== undefined ? 'motion-fade' : ''
}
