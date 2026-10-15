import { Activity } from 'lucide-react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { Caps, CountUp, DAY_LETTERS, Tile } from '@/components/review/parts'
import { euros } from '@/lib/money'
import { GROUPS } from '@/lib/review'
import type { Group } from '@/lib/review'

type Week = FunctionReturnType<typeof api.aggregate.weekReview>
type Row = Week['latest'][number]

const NAMES: Record<Group, string> = {
  projects: 'PROJECTS',
  languages: 'LANGUAGES',
  body: 'BODY',
  money: 'FINANCES',
  social: 'SOCIAL',
  other: 'OTHER',
}

function colour(group: Group, languageSlug: string | undefined): string {
  if (group === 'other') return 'var(--kind-note)'
  if (group === 'languages')
    return languageSlug ? `var(--area-${languageSlug})` : 'var(--kind-note)'
  return `var(--area-${group})`
}

/** The badge on a latest row: what kind of thing it was. */
function badge(row: Row): string {
  if (row.kind === 'expense') return 'SPEND'
  if (row.kind === 'income') return 'IN'
  if (row.kind === 'task_done') return 'TASK'
  if (row.kind === 'event') return 'NOTE'
  if (row.category) return row.category.toUpperCase()
  return row.kind.replace('_', ' ').toUpperCase()
}

/** The row's own words, or its amount. */
function words(row: Row): string {
  const amount =
    row.value === null
      ? null
      : row.unit === 'eur'
        ? euros(row.value)
        : `${row.value}${row.unit ? ` ${row.unit}` : ''}`
  return [amount, row.text].filter(Boolean).join(' · ')
}

const day = (t: number) =>
  new Date(t)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })
    .toUpperCase()
    .replace(',', '')

/* Activity: every log is activity ("I called Dyson to fix vacuum" too).
   The week's days as bars by area beside last week's in grey, how many of
   each, and the four newest rows in their own words. */
export function ActivityTile({
  week,
  languageSlug,
}: {
  week: Week
  languageSlug: string | undefined
}) {
  const sums = (d: Record<Group, number>) =>
    GROUPS.reduce((s, g) => s + d[g], 0)
  const last = week.lastWeek.days.map(sums)
  const highest = Math.max(1, ...week.week.days.map(sums), ...last)
  const group = (row: Row): Group => {
    const found = GROUPS.find((g) => g === row.area)
    if (found) return found
    if (row.area === languageSlug) return 'languages'
    return row.area === 'business' ? 'projects' : 'other'
  }

  return (
    <Tile
      name="Activity"
      area="var(--color-lav-400)"
      icon={<Activity />}
      index={4}
      span="col-span-2 lg:col-span-3 lg:row-span-2"
      extra={
        <span className="rounded-full border border-current px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-ink-400 uppercase">
          LAST WEEK · GREY
        </span>
      }
    >
      <div className="flex items-end gap-2.5">
        <span className="text-[30px] leading-none font-light tabular-nums">
          <CountUp to={week.week.total} />
        </span>
        <Caps className="pb-1">LOGGED · was {week.lastWeek.total}</Caps>
      </div>
      {week.week.total === 0 ? (
        <Caps className="my-auto text-ink-500">
          0 LOGGED · was {week.lastWeek.total}
        </Caps>
      ) : (
        <>
          <div className="grid min-h-[110px] flex-1 grid-cols-7 items-end gap-2">
            {week.week.days.map((d, i) => (
              <div
                key={i}
                className="grid h-full grid-cols-2 items-end gap-0.5"
              >
                <div
                  style={{
                    height: `${(sums(d) / highest) * 100}%`,
                    animationDelay: `${i * 60}ms`,
                  }}
                  className="bento-grow flex flex-col-reverse gap-0.5"
                >
                  {GROUPS.filter((g) => d[g] > 0).map((g) => (
                    <span
                      key={g}
                      style={{
                        flex: d[g],
                        background: colour(g, languageSlug),
                      }}
                      className="rounded-[3px]"
                    />
                  ))}
                </div>
                <div
                  style={{
                    height: `${(last[i] / highest) * 100}%`,
                    animationDelay: `${i * 60 + 30}ms`,
                  }}
                  className="bento-grow rounded-[3px] bg-lift/[0.12]"
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2 text-center">
            {DAY_LETTERS.map((d, i) => (
              <Caps key={i} className="text-[8.5px]">
                {d}
              </Caps>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
            {GROUPS.map((g) => (
              <span
                key={g}
                className="inline-flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.08em] text-ink-400 uppercase"
              >
                <i
                  style={{ background: colour(g, languageSlug) }}
                  className="size-2 rounded-[3px]"
                />
                {NAMES[g]} {week.week.days.reduce((s, d) => s + d[g], 0)}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Caps>LATEST</Caps>
            {week.latest.map((row, n) => (
              <div
                key={row._id}
                style={{ animationDelay: `${900 + n * 120}ms` }}
                className="motion-arrive flex items-center gap-2"
              >
                <span
                  style={{ color: colour(group(row), languageSlug) }}
                  className="inline-flex min-w-[62px] justify-center rounded-full border border-current px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] uppercase"
                >
                  {badge(row)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-200">
                  {words(row)}
                </span>
                <Caps className="text-[8.5px]">{day(row.occurredAt)}</Caps>
              </div>
            ))}
          </div>
        </>
      )}
    </Tile>
  )
}
