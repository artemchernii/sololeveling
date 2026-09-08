import type { WeekCount } from './MovementTable'

/* The week's counts, in the same six-tile order as the dashboard's month tiles
   (§3 item 4). Same source, same shape, different period — a review that
   counted different things than the dashboard would be a second version of
   the truth. */

const TILES = [
  { key: 'projects', label: 'Projects', noun: 'tasks shipped' },
  { key: 'portuguese', label: 'Portuguese', noun: 'sessions' },
  { key: 'body', label: 'Body', noun: 'workouts' },
  { key: 'money', label: 'Money', noun: 'transfers' },
  { key: 'style', label: 'Style', noun: 'pieces' },
  { key: 'social', label: 'Social', noun: 'events' },
] as const

export function KpiTiles({
  week,
  previous,
}: {
  week: WeekCount | undefined
  previous: WeekCount | undefined
}) {
  return (
    <div className="glass rounded-[22px] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="label-caps">The week, as it actually went</div>
        <div className="label-caps">
          {week ? `${week.total} logged in total` : ''}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => (
          <div
            key={tile.key}
            className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <div className="label-caps">{tile.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[30px] leading-none font-light text-foreground">
                {week ? week[tile.key] : '—'}
              </span>
              <span className="text-[12.5px] text-ink-500">{tile.noun}</span>
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-ink-700">
              {previous ? `${previous[tile.key]} the week before` : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
