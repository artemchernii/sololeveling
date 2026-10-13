import { useLayoutEffect, useRef, useState } from 'react'

import { Veiled } from '@/components/finances/Veil'
import { euros } from '@/lib/money'
import { boxAt } from '@/lib/priceChart'
import type { Mark } from '@/lib/priceChart'

/* The box at a buy or sell dot (13 Oct: "when i hover dot i expected
   something like tooltip", mockup chart.html #tip): what was bought or
   sold, for how much, on which day, and the stored close of that day in
   both currencies. It sits beside the dot and inside the plot, above the
   chart and its tools, and never takes the pointer. */
export function DotBox({
  marks,
  dot,
  plot,
  day,
  price,
  eur,
}: {
  /** The buys and sells on this stored close; the first is said. */
  marks: ReadonlyArray<Mark>
  dot: { x: number; y: number }
  plot: { w: number; h: number; room: number }
  day: string
  /** The stored close, in the share's own currency. */
  price: string
  /** The same close in euros; none on a day with no stored rate. */
  eur: string | null
}) {
  const own = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const m = marks[0]
  useLayoutEffect(() => {
    const el = own.current
    if (el && (el.offsetWidth !== size.w || el.offsetHeight !== size.h))
      setSize({ w: el.offsetWidth, h: el.offsetHeight })
  })
  const at = boxAt({ ...dot, side: m.side }, size, plot)
  const buy = m.side === 'buy'
  return (
    <div
      ref={own}
      data-testid="dot-box"
      style={{
        transform: `translate(${at.left}px, ${at.top}px)`,
        visibility: size.w === 0 ? 'hidden' : undefined,
      }}
      className="pointer-events-none absolute top-0 left-0 z-[6] max-w-[calc(100%-12px)] rounded-lg bg-popover px-3 py-[9px] font-mono text-[11px] text-ink-400 shadow-lg ring-1 ring-lav-400/55 ring-inset"
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <b
          className={`rounded-full px-2 py-0.5 text-[11px] font-normal ${buy ? 'bg-state-good/14 text-state-good' : 'bg-state-danger/14 text-state-danger'}`}
        >
          {buy ? 'bought' : 'sold'}
        </b>
        {m.eur === undefined ? null : (
          <span className="text-[13.5px] text-ink-100 tabular-nums">
            <Veiled>{euros(m.eur)}</Veiled>
          </span>
        )}
        <i className="text-ink-200 not-italic">{day}</i>
      </div>
      <div className="mt-1.5">
        at <i className="text-ink-200 not-italic">{price}</i>
        {eur === null ? null : (
          <>
            {' · '}
            <i className="text-ink-200 not-italic">{eur}</i>
          </>
        )}{' '}
        a share
        {marks.length > 1 ? ` · and ${marks.length - 1} more that day` : ''}
      </div>
    </div>
  )
}
