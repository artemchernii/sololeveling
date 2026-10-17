import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { WAY_TEXT } from '@/components/finances/ChartLines'
import type { Fundamentals } from '@/components/finances/usePositionFeeds'
import type { Way } from '@/lib/indicators'

/* The pictures of the FUNDAMENTALS tab (PositionFundamentals): the
   analysts' range, the ⓘ card, a fact chip and an empty state. */

type Reading = NonNullable<Fundamentals>['reading']

/* The analysts' low to high, their avg as a tick, the price as a dot
   that slides to its place. */
export function Range({
  target,
  price,
  way,
  say,
}: {
  target: NonNullable<Reading['target']>
  price: number
  way: Way
  say: (v: number) => string
}) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const f = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(f)
  }, [])
  const span = target.high - target.low
  const x = (v: number) =>
    span > 0 ? Math.max(0, Math.min(100, ((v - target.low) / span) * 100)) : 50
  const dot = way === 'up' ? 'bg-state-good' : 'bg-state-danger'
  const lb =
    'absolute font-mono text-[9.5px] whitespace-nowrap tabular-nums -translate-x-1/2'
  return (
    <div className="relative mt-4 mb-3.5 h-[7px] rounded-full bg-lift/8">
      <i
        className={`absolute inset-0 origin-left rounded-full transition-transform duration-700 ${way === 'up' ? 'bg-state-good/30' : 'bg-state-danger/30'} ${shown ? 'scale-x-100' : 'scale-x-0'}`}
      />
      <i
        className="absolute -inset-y-1 w-0.5 rounded-sm bg-ink-200"
        style={{ left: `${x(target.mean)}%` }}
      />
      <i
        className={`absolute top-1/2 -mt-[6.5px] -ml-[6.5px] size-[13px] rounded-full transition-[left] duration-700 ${dot} shadow-[0_0_10px_currentColor]`}
        style={{ left: `${shown ? x(price) : x(target.mean)}%` }}
      />
      <span className={`${lb} bottom-[11px] left-0 translate-x-0 text-ink-500`}>
        low {say(target.low)}
      </span>
      <span
        className={`${lb} bottom-[11px] text-ink-300`}
        style={{ left: `${x(target.mean)}%` }}
      >
        avg {say(target.mean)}
      </span>
      <span
        className={`${lb} right-0 bottom-[11px] translate-x-0 text-ink-500`}
      >
        high {say(target.high)}
      </span>
      <span
        className={`${lb} top-[11px] ${WAY_TEXT[way]}`}
        style={{ left: `${x(price)}%` }}
      >
        price {say(price)}
      </span>
    </div>
  )
}

/* ⓘ: hover or tap opens what it is, this company's number worked
   through, and bars beside its sector and the market. */
export function Info({
  label,
  cap,
  what,
  bars,
  fmt,
  source,
}: {
  label: string
  cap: string
  what: string
  bars: Array<[string, number]>
  fmt: (v: number) => string
  source: string
}) {
  const [open, setOpen] = useState(false)
  const max = Math.max(...bars.map(([, v]) => v)) * 1.15
  const tone = ['bg-lav-400', 'bg-ink-400', 'bg-ink-500']
  return (
    <span data-open={open} className="group relative ml-1.5 inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`grid size-[22px] place-items-center rounded-full font-serif text-[12px] font-semibold italic ring-1 transition-colors ring-inset ${open ? 'bg-lav-400/16 text-lav-300 ring-lav-400/55' : 'text-ink-400 ring-lift/16 hover:text-lav-300'}`}
      >
        i
      </button>
      <span
        data-testid="info-card"
        className={`absolute top-[calc(100%+8px)] right-[-8px] z-20 w-[min(360px,calc(100vw-48px))] rounded-[14px] bg-background p-3.5 text-left text-[13px] leading-normal text-ink-200 shadow-[inset_0_0_0_1px_var(--system-edge),var(--glass-shadow)] transition-[opacity,translate] sm:right-auto sm:left-[-10px] ${open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100'}`}
      >
        <span className="mb-1.5 block font-mono text-[10px] tracking-[0.16em] text-lav-300 uppercase">
          {cap}
        </span>
        {what}
        <span className="my-3 flex flex-col gap-1.5">
          {bars.map(([n, v], k) => (
            <span
              key={n}
              className="grid grid-cols-[140px_minmax(0,1fr)_46px] items-center gap-2 font-mono text-[10.5px] tracking-[0.08em] text-ink-400 uppercase"
            >
              <span className="truncate">{n}</span>
              <i className="relative h-1.5 overflow-hidden rounded-full bg-lift/7">
                <i
                  className={`absolute inset-y-0 left-0 rounded-full ${tone[k]}`}
                  style={{ width: `${Math.min(100, (v / max) * 100)}%` }}
                />
              </i>
              <b className="text-right font-medium text-foreground tabular-nums">
                {fmt(v)}
              </b>
            </span>
          ))}
        </span>
        <span className="block font-mono text-[9.5px] tracking-[0.1em] text-ink-500 uppercase">
          {source}
        </span>
      </span>
    </span>
  )
}

export function Fact({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-lift/5 px-2 py-[3px] font-mono text-[10.5px] tracking-[0.04em] whitespace-nowrap text-ink-300">
      {children}
    </span>
  )
}

export function Empty({
  testid,
  icon,
  tone = 'text-ink-400 bg-lift/[0.06] ring-lift/16',
  children,
}: {
  testid: string
  icon: ReactNode
  tone?: string
  children: ReactNode
}) {
  return (
    <div
      data-testid={testid}
      className="motion-arrive flex items-center gap-3.5 px-2.5 py-[22px]"
    >
      <span
        className={`grid size-10 shrink-0 place-items-center rounded-[12px] ring-1 ring-inset ${tone}`}
      >
        {icon}
      </span>
      <span className="font-mono text-[12px] tracking-[0.14em] text-foreground uppercase">
        {children}
      </span>
    </div>
  )
}
