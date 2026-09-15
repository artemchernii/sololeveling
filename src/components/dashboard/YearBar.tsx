import { yearOfLevel } from '@/lib/year'

/* LEVEL, the year of it as a bar, and the days left in it (PLAN.md §3 item
   1). Neutral ink, not lavender: a year passing is not a live thing, and not
   an area either. The width is days over days — both calendar facts. */
export function YearBar({ date }: { date: Date }) {
  const { level, daysIn, daysInYear, daysToNext } = yearOfLevel(date)

  return (
    <span className="flex items-center gap-2.5">
      <span className="label-caps">Level {level}</span>
      <span
        role="img"
        aria-label={`${daysIn} of ${daysInYear} days into level ${level}`}
        className="relative h-[3px] w-24 overflow-hidden rounded-full bg-lift/10"
      >
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-ink-400"
          style={{ width: `${(daysIn / daysInYear) * 100}%` }}
        />
      </span>
      <span className="font-mono text-[10px] tracking-[0.1em] text-ink-600 uppercase">
        {daysToNext} {daysToNext === 1 ? 'day' : 'days'} to {level + 1}
      </span>
    </span>
  )
}
