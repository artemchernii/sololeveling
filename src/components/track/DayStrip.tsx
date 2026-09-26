import { useLayoutEffect, useRef } from 'react'

import { blockLabels, dayBlocks } from '@/lib/day-strip'

/* Rows of days, filled where something was logged (R6b; one grid since
   25 Sep).

   Three tones and not a gradient: a supplement is taken or it is not, and a
   shade read back as a quantity would be a number nobody sanctioned. Where a
   day holds more than one row the square is stronger, and the title says the
   real figure — the square only says more or less, the same bargain the
   commit heatmap makes.

   One grid for the month labels and every row, so the squares stretch to fill
   the card on a desktop and the labels stay over their weeks. Below the
   strip's minimum width the grid scrolls sideways inside its own box — one
   scrollbar, where there used to be one per row plus one round them all.

   Purely presentational: it counts nothing. Every number beside it comes from
   aggregate.categoryDays. */

export type StripRow = {
  key: string
  label: string
  days: Array<number>
  /** "12 of the last 30 days" — from aggregate.ts, handed over as text. */
  aside: string
  noun: string
}

export function DayStrips({
  dayStarts,
  rows,
}: {
  dayStarts: Array<number>
  rows: Array<StripRow>
}) {
  const blocks = dayBlocks(dayStarts)
  const labels = blockLabels(blocks)
  /* On a phone the strip is wider than the screen; it opens at today, the
     end you care about, rather than twelve weeks ago. */
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (box.current) box.current.scrollLeft = box.current.scrollWidth
  }, [])

  return (
    <div ref={box} className="overflow-x-auto">
      <div className="grid min-w-[620px] grid-cols-[88px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5">
        <span />
        <div className="flex gap-[5px]">
          {labels.map((label, b) => (
            <span
              key={b}
              className="label-caps flex-1 overflow-visible whitespace-nowrap"
            >
              {label}
            </span>
          ))}
        </div>
        <span />

        {rows.map((row) => (
          <Row key={row.key} row={row} blocks={blocks} />
        ))}
      </div>
    </div>
  )
}

function Row({ row, blocks }: { row: StripRow; blocks: Array<Array<number>> }) {
  let index = -1
  const last = blocks.length - 1
  return (
    <>
      <span className="label-caps truncate text-ink-300">{row.label}</span>
      <div className="flex gap-[5px]">
        {blocks.map((block, b) => (
          <div
            key={b}
            style={{ animationDelay: `${Math.min(b * 30, 400)}ms` }}
            className="motion-arrive flex flex-1 gap-[2px]"
          >
            {block.map((day, d) => {
              index += 1
              const count = row.days[index] ?? 0
              const today = b === last && d === block.length - 1
              return (
                <span
                  key={day}
                  title={`${count} ${row.noun}${count === 1 ? '' : 's'} · ${new Date(day).toDateString()}`}
                  className={`aspect-square flex-1 rounded-[1px] ${
                    count === 0
                      ? 'bg-lift/[0.06]'
                      : count === 1
                        ? 'bg-lav-400/55'
                        : 'bg-lav-400 shadow-[0_0_8px_-1px_var(--system-shine)]'
                  } ${today ? 'system-pulse ring-1 ring-lav-400/80' : ''}`}
                />
              )
            })}
          </div>
        ))}
      </div>
      <span className="font-mono text-[11px] whitespace-nowrap text-ink-500">
        {row.aside}
      </span>
    </>
  )
}
