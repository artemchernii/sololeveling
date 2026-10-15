import { useEffect, useRef, useState } from 'react'

/* A number that counts up from zero the first time it shows (15 Oct,
   mockup verdict.html: "kinda more animation"), then simply changes.
   Only the drawing moves: the value is the one it is given, and with
   reduced motion it is there at once. */
export function CountUp({
  value,
  format,
  ms = 800,
}: {
  value: number
  format: (v: number) => string
  ms?: number
}) {
  const done = useRef(false)
  const [shown, setShown] = useState(() =>
    typeof window === 'undefined' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? value
      : 0,
  )
  useEffect(() => {
    if (done.current || shown === value) {
      done.current = true
      setShown(value)
      return
    }
    const t0 = performance.now()
    let frame = 0
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      setShown(value * (1 - (1 - k) ** 3))
      if (k < 1) frame = requestAnimationFrame(step)
      else done.current = true
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value, ms])
  return <>{format(shown)}</>
}
