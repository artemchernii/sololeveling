/* PLAN.md §3: the 12-week movement table, "rising/slipping + absolute delta".
 
   The dashboard's month tiles deliberately show no arrow and no verdict — this
   table is the one place movement is named, because looking at movement is
   what a review is for. Even here it is a delta and the sign of a delta:
   no percentage, no streak, no score. "Rising" is a word for a positive
   subtraction, not a measurement of anything.
 
   The counts come from aggregate.weekCounts; the subtraction happens here, the
   way the dashboard renders "2 of 4" from two source values. */

const ROWS = [
  { key: 'projects', label: 'Projects' },
  { key: 'portuguese', label: 'Portuguese' },
  { key: 'body', label: 'Body' },
  { key: 'money', label: 'Money' },
  { key: 'style', label: 'Style' },
  { key: 'social', label: 'Social' },
] as const

export type WeekCount = {
  start: number
  projects: number
  portuguese: number
  body: number
  money: number
  style: number
  social: number
  total: number
}

function movement(delta: number): { word: string; className: string } {
  if (delta > 0) return { word: 'rising', className: 'text-lav-300' }
  if (delta < 0) return { word: 'slipping', className: 'text-ink-500' }
  return { word: 'level', className: 'text-ink-700' }
}

export function MovementTable({ weeks }: { weeks: Array<WeekCount> }) {
  if (weeks.length < 2) {
    return (
      <div className="glass rounded-[22px] p-5">
        <div className="label-caps">Twelve weeks</div>
        <p className="mt-3 text-[13px] text-ink-500">
          Two weeks of logs and this table starts saying something. Right now it
          would only be repeating one number back at you.
        </p>
      </div>
    )
  }

  const latest = weeks[weeks.length - 1]
  const previous = weeks[weeks.length - 2]

  return (
    <div className="glass overflow-hidden rounded-[22px] p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="label-caps">Twelve weeks</div>
        <div className="label-caps">This week vs last</div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse">
          <tbody>
            {ROWS.map((row) => {
              const now = latest[row.key]
              const before = previous[row.key]
              const delta = now - before
              const { word, className } = movement(delta)

              return (
                <tr
                  key={row.key}
                  className="border-b border-white/[0.05] last:border-b-0"
                >
                  <th
                    scope="row"
                    className="py-2.5 pr-3 text-left text-[13px] font-normal text-foreground"
                  >
                    {row.label}
                  </th>

                  {/* The twelve weeks, as bars of relative height. A sparkline
                      of counts, not of anything derived — the tallest week in
                      the row is the scale, and there is no axis to mislead. */}
                  <td className="py-2.5">
                    <div className="flex h-6 items-end gap-[3px]">
                      {weeks.map((week) => {
                        const peak = Math.max(
                          ...weeks.map((w) => w[row.key]),
                          1,
                        )
                        const height = (week[row.key] / peak) * 100
                        return (
                          <span
                            key={week.start}
                            title={`${week[row.key]} in the week of ${new Date(week.start).toLocaleDateString()}`}
                            className="w-[6px] rounded-[2px] bg-white/[0.16]"
                            style={{ height: `${Math.max(height, 4)}%` }}
                          />
                        )
                      })}
                    </div>
                  </td>

                  <td className="py-2.5 pl-3 text-right font-mono text-[12px] text-foreground">
                    {now}
                  </td>
                  <td className="w-[92px] py-2.5 pl-3 text-right font-mono text-[11px]">
                    <span className={className}>
                      {delta > 0 ? `+${delta}` : delta} {word}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
