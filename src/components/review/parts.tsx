import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'

/* The bento's shared pieces (14 Oct, design/review-mockup/index.html). */

/** A number that runs up to its value when it arrives, then holds. */
export function CountUp({
  to,
  format = (n) => String(Math.round(n)),
  testId,
}: {
  to: number
  format?: (n: number) => string
  testId?: string
}) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(to)
      return
    }
    const t0 = performance.now()
    let frame = 0
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 1100)
      setShown(to * (1 - Math.pow(1 - p, 3)))
      if (p < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [to])
  /* It lands on the value within the second; a test waits for it. */
  return (
    <span data-testid={testId} data-value={to}>
      {format(shown)}
    </span>
  )
}

export function Caps({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`font-mono text-[9.5px] tracking-[0.16em] text-ink-400 uppercase ${className}`}
    >
      {children}
    </span>
  )
}

/** A label, a big number and what it was last week. */
export function Stat({
  label,
  children,
  was,
  size = 'text-[30px]',
}: {
  label: ReactNode
  children: ReactNode
  was?: ReactNode
  size?: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Caps>{label}</Caps>
      <span
        className={`${size} leading-none font-light tracking-tight tabular-nums`}
      >
        {children}
      </span>
      {was !== undefined ? (
        <span className="font-mono text-[10.5px] text-ink-500">was {was}</span>
      ) : null}
    </div>
  )
}

/** One tile: glass, its area's breathing light, a head that opens its page. */
export function Tile({
  name,
  icon,
  to,
  area,
  index,
  span,
  extra,
  photo,
  children,
}: {
  name: string
  icon: ReactNode
  to?: string
  /** A CSS colour for this room — a token, never a literal. */
  area: string
  index: number
  span: string
  extra?: ReactNode
  photo?: { src: string; className: string; position?: string }
  children: ReactNode
}) {
  const head = (
    <span className="flex items-center gap-[7px] font-mono text-[10.5px] tracking-[0.26em] text-ink-200 uppercase">
      <span className="grid size-[22px] place-items-center rounded-[7px] border border-(--area)/35 bg-(--area)/18 text-(--area) [&_svg]:size-[13px]">
        {icon}
      </span>
      {name}
    </span>
  )
  return (
    <section
      aria-label={name}
      style={{ '--area': area, '--i': index } as CSSProperties}
      className={`glass bento-tile flex min-w-0 flex-col gap-2.5 rounded-[14px] p-3.5 ${span}`}
    >
      <span
        aria-hidden
        className="bento-glow pointer-events-none absolute -top-20 -left-12 size-56 rounded-full bg-(--area) blur-3xl"
      />
      {photo ? (
        <img
          src={photo.src}
          alt=""
          aria-hidden
          decoding="async"
          style={{
            objectPosition: photo.position ?? '50% 40%',
            maskImage: 'linear-gradient(to left, black 30%, transparent)',
            WebkitMaskImage: 'linear-gradient(to left, black 30%, transparent)',
          }}
          className={`motion-fade pointer-events-none absolute right-0 hidden object-cover opacity-35 select-none sm:block ${photo.className}`}
        />
      ) : null}
      <div className="relative flex items-center justify-between gap-2">
        {to ? (
          <Link to={to} aria-label={name} className="group/open">
            {head}
          </Link>
        ) : (
          head
        )}
        <div className="flex items-center gap-2">
          {extra}
          {to ? (
            <Link
              to={to}
              tabIndex={-1}
              aria-hidden
              className="font-mono text-[13px] text-ink-500 transition group-hover/open:translate-x-0.5 hover:text-(--area)"
            >
              →
            </Link>
          ) : null}
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col gap-2.5">
        {children}
      </div>
    </section>
  )
}

/** "WED 14" */
export const dayLabel = (t: number) =>
  new Date(t)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
    .toUpperCase()
    .replace(',', '')

/** "SEP 24" */
export const dateLabel = (t: number) => {
  const d = new Date(t)
  return `${d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()} ${d.getDate()}`
}

/** A small caps badge in a colour of its own. */
export function Badge({
  children,
  className = 'text-ink-400',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-current px-[7px] py-0.5 font-mono text-[9.5px] tracking-[0.12em] whitespace-nowrap uppercase ${className}`}
    >
      {children}
    </span>
  )
}
