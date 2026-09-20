/* Fourteen days of commits, one mark a day, oldest on the left (20 Sep).

   It is counts of stored rows and nothing more: no rate, no streak, no score,
   and no number derived from the shape of it. A day with no commits is a flat
   line rather than a gap, because "nothing happened" is a reading too — the
   strip would otherwise imply the days it omits never existed. */
export function CommitStrip({ days }: { days: Array<number> }) {
  if (days.length === 0) return null
  const most = Math.max(...days, 1)

  return (
    <div className="flex items-end gap-[3px]" aria-hidden>
      {days.map((n, i) => (
        <span
          key={i}
          /* Height is the day's count against the busiest day in view, which
             is a way of drawing the number, not a new number: nothing reads
             the height back as a value. */
          style={{ height: `${Math.max(2, Math.round((n / most) * 18))}px` }}
          className={`w-[4px] rounded-[1px] ${
            n === 0 ? 'bg-lift/10' : 'bg-(--area)/70'
          }`}
        />
      ))}
    </div>
  )
}
