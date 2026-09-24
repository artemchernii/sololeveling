import type { CSSProperties } from 'react'

/* A little burst in the area's colour, out of whatever it is placed in —
   the thing that tells a thumb the tap counted (25 Sep, "cool + fun").
   Keyed by the caller so each tap throws a fresh one. */
export function Sparks({
  count = 10,
  reach = 26,
}: {
  count?: number
  reach?: number
}) {
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`motion-spark absolute top-1/2 left-1/2 rounded-full ${
            i % 2 === 1 ? 'bg-lav-200' : 'bg-(--area)'
          } ${i % 3 === 0 ? 'size-[5px]' : 'size-[3px]'}`}
          style={
            {
              '--a': `${(360 / count) * i}deg`,
              '--d': `${reach - (i % 3) * 5}px`,
              animationDelay: `${(i % 4) * 25}ms`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  )
}
