/* The last seven days of one item, a dot each, today last and ringed.
   Filled where it was done — the same three tones DayStrip uses, and for
   the same reason: a shade is not a number. Counts nothing. */
export function WeekDots({
  days,
  noun,
  dayStarts,
}: {
  /** Counts per day, oldest first; only the last seven are drawn. */
  days: Array<number>
  noun: string
  dayStarts: Array<number>
}) {
  const from = Math.max(0, days.length - 7)
  return (
    <span className="flex shrink-0 items-center gap-[3px]" aria-hidden>
      {days.slice(from).map((count, i) => {
        const today = from + i === days.length - 1
        return (
          <span
            key={from + i}
            title={`${count} ${noun}${count === 1 ? '' : 's'} · ${new Date(dayStarts[from + i]).toDateString()}`}
            className={`size-[7px] rounded-full transition-colors ${
              count === 0
                ? 'bg-lift/[0.09]'
                : count === 1
                  ? 'bg-(--area)/65'
                  : 'bg-(--area)'
            } ${today ? 'ring-1 ring-(--area)/60 ring-offset-1 ring-offset-transparent' : ''}`}
          />
        )
      })}
    </span>
  )
}
