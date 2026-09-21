import { dayBlocks } from '@/lib/day-strip'

/* One row of days, filled where something was logged (R6b).

   Two tones and not a gradient: a supplement is taken or it is not, and a
   shade read back as a quantity would be a number nobody sanctioned. Where a
   day holds more than one row the square is stronger, and the title says the
   real figure — the square only says more or less, the same bargain the
   commit heatmap makes.

   Purely presentational: it counts nothing. Every number beside it comes from
   aggregate.categoryDays. */
export function DayStrip({
  dayStarts,
  days,
  noun,
}: {
  dayStarts: Array<number>
  days: Array<number>
  noun: string
}) {
  const blocks = dayBlocks(dayStarts)
  let index = -1

  return (
    <div className="flex gap-[7px] overflow-x-auto">
      {blocks.map((block, b) => (
        <div
          key={b}
          style={{ animationDelay: `${Math.min(b * 18, 400)}ms` }}
          className="motion-arrive flex shrink-0 gap-[3px]"
        >
          {block.map((day) => {
            index += 1
            const count = days[index] ?? 0
            const date = new Date(day)
            return (
              <span
                key={day}
                title={`${count} ${noun}${count === 1 ? '' : 's'} · ${date.toDateString()}`}
                className={`size-[11px] rounded-[3px] ${
                  count === 0
                    ? 'bg-lift/[0.06]'
                    : count === 1
                      ? 'bg-(--area)/60'
                      : 'bg-(--area)'
                }`}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}
