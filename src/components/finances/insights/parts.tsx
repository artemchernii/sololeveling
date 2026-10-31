import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { DrawnMark, Flag } from './Flag'
import { AccountLogo, TickerLogo } from '@/components/finances/Logo'
import { PERIODS } from '@/lib/insightsMarket'
import type { Mark, Period, Point } from '@/lib/insightsMarket'

/* Small pieces of the Insights room: words for times and months, a
   market's mark, its line, and the ⓘ card. */

const MONTHS = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')

/** "2026-09" → "SEP". */
export const monthWord = (ym: string | null) =>
  ym ? (MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym) : ''

/** "2026-09-17" → "17 SEP"; with the year when it is not this one. */
export function dayWord(d: string | number, now = Date.now()) {
  const date = typeof d === 'number' ? new Date(d) : new Date(`${d}T12:00:00Z`)
  const year = date.getUTCFullYear()
  const word = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
  return year === new Date(now).getUTCFullYear() ? word : `${word} ${year}`
}

/** Whole days from today to a YYYY-MM-DD. */
export function daysTo(d: string, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10)
  return Math.round(
    (Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  )
}

/** A fetch time on the clock, "09:14". */
export const clock = (at: number) =>
  new Date(at).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })

/** ▲ 2.4% / ▼ 0.19 PTS — a change with its arrow, one decimal for percent. */
export function changeWord(change: number, points = false) {
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '='
  const n = Math.abs(change)
  return points ? `${arrow} ${n.toFixed(2)} PTS` : `${arrow} ${n.toFixed(1)}%`
}

/** +8.1% on a heat box. */
export const signed = (change: number) =>
  `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change).toFixed(1)}%`

/** A heat box's colour: the state colour mixed into a dark ground. */
export function heatColour(change: number | null, mix: number) {
  if (change === null) return 'var(--mark-ink)'
  const state = change >= 0 ? 'var(--state-good)' : 'var(--state-danger)'
  return `color-mix(in srgb, ${state} ${Math.round(mix * 0.72)}%, var(--mark-ink))`
}

/** A market's mark: a flag, a drawn icon, a site's icon, a coin. */
export function MarkLogo({ mark, size = 30 }: { mark: Mark; size?: number }) {
  if ('flag' in mark)
    return <Flag code={mark.flag} tag={mark.tag} size={size} />
  if ('icon' in mark) return <DrawnMark icon={mark.icon} size={size} />
  if ('site' in mark)
    return (
      <span className="mark">
        <AccountLogo name={mark.site} domain={mark.site} size={size} />
      </span>
    )
  return (
    <span className="mark">
      <TickerLogo symbol={mark.coin} type="CRYPTOCURRENCY" size={size} />
    </span>
  )
}

/** A card's line over the period: drawn, with a faint fill under it. */
export function Line({ points, h = 34 }: { points: Array<Point>; h?: number }) {
  if (points.length < 2) return <svg aria-hidden viewBox={`0 0 100 ${h}`} />
  const vs = points.map((p) => p.v)
  const lo = Math.min(...vs)
  const hi = Math.max(...vs)
  const xy = points
    .map(
      (p, i) =>
        `${((i / (points.length - 1)) * 100).toFixed(2)},${(h - 2 - ((p.v - lo) / (hi - lo || 1)) * (h - 8)).toFixed(2)}`,
    )
    .join(' ')
  return (
    <svg aria-hidden viewBox={`0 0 100 ${h}`} preserveAspectRatio="none">
      <polygon points={`0,${h} ${xy} 100,${h}`} />
      <polyline points={xy} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export type InfoText = {
  title: string
  what: string
  why: string
  now: Array<string>
}

/**
 * ⓘ — the one place on this room where sentences live (19 Oct: "for not
 * smart person like me I want more like explanation"). What it is, why it
 * moves the money, and the numbers now. Closes on Escape, on a press
 * outside, or on ⓘ again. Drawn on the page itself (a tile lifting on
 * hover would carry a fixed card with it), so it scrolls with the page.
 */
export function Info({ info }: { info: InfoText }) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const width = Math.min(310, window.innerWidth - 16)
    setAt({
      left:
        window.scrollX +
        Math.max(8, Math.min(r.left - 10, window.innerWidth - width - 8)),
      top: window.scrollY + r.bottom + 8,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!card.current?.contains(t) && !button.current?.contains(t))
        setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        className="ins-i"
        aria-label={`About ${info.title}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && at
        ? createPortal(
            <div
              ref={card}
              role="dialog"
              aria-label={info.title}
              className="ins-card motion-pop"
              style={at}
            >
              <h4>{info.title}</h4>
              {info.what ? (
                <>
                  <span className="k">WHAT IT IS</span>
                  <p>{info.what}</p>
                </>
              ) : null}
              {info.why ? (
                <>
                  <span className="k">WHY IT MOVES THE MONEY</span>
                  <p>{info.why}</p>
                </>
              ) : null}
              {info.now.map((n) => (
                <div key={n} className="now">
                  {n}
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

/** The period switch, the same on SECTORS, THE TREND and MINE: every
    period, one choice for all three (30 Oct: "3 month and no possibility
    to change is crap"). */
export function PeriodSwitch({
  period,
  onPeriod,
}: {
  period: Period
  onPeriod: (p: Period) => void
}) {
  return (
    <div className="ins-seg" role="group" aria-label="Period">
      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={p === period}
          onClick={() => onPeriod(p)}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
