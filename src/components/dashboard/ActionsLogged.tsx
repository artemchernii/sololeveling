import { useQuery } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import { monthRange } from './StateStrip'

/* PLAN.md §3 item 4. Exactly these six tiles, in this order, each against last
   month. The order and the labels live here; the counts come from
   monthCounts(), which returns the same fixed shape.
 
   "Counts of things you did. There is no score for Portuguese, and there never
   will be." Career, Knowledge and Life have no tile — nothing about them is
   countable per-month yet. Nine areas, six tiles, on purpose. */

const TILES = [
  { key: 'projects', label: 'Projects', noun: 'tasks shipped' },
  { key: 'portuguese', label: 'Portuguese', noun: 'sessions logged' },
  { key: 'body', label: 'Body', noun: 'workouts done' },
  { key: 'money', label: 'Money', noun: 'transfers to the floor' },
  { key: 'style', label: 'Style', noun: 'pieces bought or altered' },
  { key: 'social', label: 'Social', noun: 'events attended' },
] as const

export function ActionsLogged({ today }: { today: number }) {
  const counts = useQuery(api.aggregate.monthCounts, monthRange(today))
  const lastMonth = new Date(today)
  lastMonth.setMonth(lastMonth.getMonth() - 1)
  const lastMonthName = lastMonth.toLocaleDateString(undefined, {
    month: 'long',
  })

  return (
    <div className="glass rounded-[22px] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="label-caps">This month · Actions logged</div>
        <div className="label-caps">
          {counts ? `${counts.total} in total` : ''}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => {
          const count = counts?.[tile.key]
          return (
            <div
              key={tile.key}
              className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-4"
            >
              <div className="label-caps">{tile.label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-[30px] leading-none font-light text-foreground">
                  {count ? count.now : '—'}
                </span>
                <span className="text-[12.5px] text-ink-500">{tile.noun}</span>
              </div>
              {/* Last month, flat — no arrow, no percentage change, no verdict
                  about whether the difference is good (§1). */}
              <div className="mt-1.5 font-mono text-[11px] text-ink-700">
                {count ? `${count.prev} in ${lastMonthName}` : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
