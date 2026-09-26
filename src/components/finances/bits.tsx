import type { ReactNode } from 'react'

/* Small shared pieces of the Finances page. */

/**
 * A line through stored readings (a balance's history, a ticker's closes):
 * PLAN.md §1, a state read as a series — a point where a value was
 * recorded, straight segments between, nothing smoothed or projected. It
 * has no axis and no number of its own; the reading beside it is the
 * number.
 */
export function Sparkline({
  points,
  className = 'h-8 w-24',
}: {
  points: ReadonlyArray<{ t: number; v: number }>
  className?: string
}) {
  if (points.length < 2) return <span className={className} aria-hidden />
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const values = points.map((p) => p.v)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const x = (t: number) => (t1 === t0 ? 50 : ((t - t0) / (t1 - t0)) * 100)
  const y = (v: number) => (hi === lo ? 15 : 28 - ((v - lo) / (hi - lo)) * 26)
  const d = points.map((p) => `${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`)
  const last = points[points.length - 1]
  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      aria-hidden
      className={`motion-draw overflow-visible ${className}`}
    >
      <polyline
        points={d.join(' ')}
        fill="none"
        stroke="var(--color-lav-400)"
        strokeWidth="1.6"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      <circle
        cx={x(last.t)}
        cy={y(last.v)}
        r="2"
        fill="var(--color-lav-300)"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/** A Finances tab's glass panel, with its caps title and what sits right. */
export function Panel({
  title,
  aside,
  children,
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="glass flex flex-col gap-4 rounded-[22px] p-4 sm:p-5">
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <span className="label-caps flex-1">{title}</span>
        {aside}
      </div>
      {children}
    </section>
  )
}

export const PILL =
  'motion-press inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10.5px] tracking-[0.12em] uppercase ring-1 ring-inset transition-colors'
export const PILL_QUIET = `${PILL} text-ink-300 ring-lift/15 hover:text-foreground hover:ring-lav-400/40`
export const PILL_LOUD = `${PILL} bg-lav-400/15 text-foreground ring-lav-400/45 hover:bg-lav-400/25`
export const FIELD =
  'rounded-[12px] bg-lift/[0.05] px-3 py-2 text-[14px] text-foreground ring-1 ring-lift/12 ring-inset placeholder:text-ink-500 focus:ring-lav-400/50 focus:outline-none'
