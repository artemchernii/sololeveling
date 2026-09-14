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

/** --loading-hold from tokens.css, so the number lives in one place. */
function holdMs(): number {
  if (typeof window === 'undefined') return FALLBACK_HOLD_MS
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--loading-hold')
    .trim()
  const ms = raw.endsWith('ms')
    ? parseFloat(raw)
    : raw.endsWith('s')
      ? parseFloat(raw) * 1000
      : NaN
  return Number.isFinite(ms) ? ms : FALLBACK_HOLD_MS
}

/**
 * The query's value, held back as `undefined` until --loading-hold has passed
 * — but only if it was `undefined` when the component mounted. Wrap the
 * query whose `undefined` decides between skeleton and content:
 *
 *   const goals = useHeld(useQuery(api.goals.listActive, {}))
 */
export function useHeld<T>(value: T | undefined): T | undefined {
  const [holding, setHolding] = useState(() => value === undefined)

  useEffect(() => {
    if (!holding) return
    const timer = setTimeout(() => setHolding(false), holdMs())
    return () => clearTimeout(timer)
    // Once, from mount: the hold is measured from when the skeleton appeared.
  }, [])

  return holding ? undefined : value
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
