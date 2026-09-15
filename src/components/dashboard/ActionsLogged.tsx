import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { areaVars } from '@/lib/areas'
import type { Area } from '@/lib/capture-parser'
import { daysLeftInMonth, targetLine } from '@/lib/month'
import { MONTH_TILES } from '@/lib/tiles'
import type { MonthTile, Tile } from '@/lib/tiles'
import { monthRange } from './StateStrip'

/* PLAN.md §3 item 4. Exactly these six tiles, in this order, each against
   last month — or, since R2, against a monthly target when one is set on the
   tile. The counts come from monthCounts() and the targets from
   tileTargets(); this component composes them and computes neither.

   "Counts of things you did. There is no score for Portuguese, and there never
   will be." A target is the one thing a count may be read against (§1), and
   being short of it reads as words — "4 to go · 16 days left" — in the same
   colours as being past it. The label and the bar wear the tile's area: a
   kind, not a verdict (§3d.3). Career, Knowledge and Life have no tile. Nine
   areas, six tiles, on purpose. */

export function ActionsLogged({ today }: { today: number }) {
  const counts = useQuery(api.aggregate.monthCounts, monthRange(today))
  const targets = useQuery(api.aggregate.tileTargets, {})

  const now = new Date(today)
  const daysLeft = daysLeftInMonth(now)
  /* The first of last month, not today minus a month: 31 March minus a month
     is 3 March, and the tile would say "in March" about February. */
  const lastMonthName = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
  ).toLocaleDateString(undefined, { month: 'long' })

  return (
    <div className="glass rounded-[22px] p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="label-caps">This month · Actions logged</div>
        <div className="label-caps">
          {counts ? `${counts.total} in total` : ''}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {MONTH_TILES.map((tile) => (
          <MonthTileCard
            key={tile.key}
            tile={tile}
            count={counts?.[tile.key]}
            target={targets === undefined ? undefined : targets[tile.key]}
            daysLeft={daysLeft}
            lastMonthName={lastMonthName}
          />
        ))}
      </div>
    </div>
  )
}

function MonthTileCard({
  tile,
  count,
  target,
  daysLeft,
  lastMonthName,
}: {
  tile: MonthTile
  count: { now: number; prev: number } | undefined
  /** undefined while loading, null when no target is set. */
  target: number | null | undefined
  daysLeft: number
  lastMonthName: string
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div
      style={tile.area ? areaVars(tile.area) : undefined}
      className="flex flex-col rounded-[16px] border border-lift/[0.06] bg-lift/[0.02] p-4"
    >
      <div className={`label-caps ${tile.area ? 'text-(--area)' : ''}`}>
        {tile.label}
      </div>

      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[30px] leading-none font-light text-foreground">
          {count ? count.now : '—'}
        </span>
        {typeof target === 'number' && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Change the monthly target"
            className="-mx-1 rounded-[5px] px-1 text-[15px] font-light text-ink-400 transition-colors hover:bg-lift/10"
          >
            of {target}
          </button>
        ) : null}
        <span className="text-[12.5px] text-ink-500">{tile.noun}</span>
      </div>

      {typeof target === 'number' && count ? (
        <TargetBar count={count.now} target={target} area={tile.area} />
      ) : null}

      <div className="mt-1.5 flex items-baseline justify-between gap-2 font-mono text-[11px]">
        {editing ? (
          <TargetInput
            tile={tile.key}
            current={typeof target === 'number' ? target : undefined}
            onClose={() => setEditing(false)}
          />
        ) : typeof target === 'number' ? (
          <span className="text-ink-500">
            {count ? targetLine(count.now, target, daysLeft) : ''}
          </span>
        ) : (
          <>
            {/* Last month, flat — no arrow, no percentage change, no verdict
                about whether the difference is good (§1). */}
            <span className="text-ink-700">
              {count ? `${count.prev} in ${lastMonthName}` : ''}
            </span>
            {target === null ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-ink-700 transition-colors hover:text-ink-300"
              >
                + target
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

/* A bar only because a goal gives it a denominator (§1). Full at the target
   and no further: past it, the words say so. The same colour either side of
   the target — the tile's area is what it is, not how well it went. */
function TargetBar({
  count,
  target,
  area,
}: {
  count: number
  target: number
  area: Area | undefined
}) {
  return (
    <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-lift/10">
      <div
        className={`h-full rounded-full ${area ? 'bg-(--area)' : 'bg-ink-300'}`}
        style={{ width: `${Math.min(count / target, 1) * 100}%` }}
      />
    </div>
  )
}

/* Enter or leaving the field saves; Escape cancels; saved empty, it clears
   the target. Closes exactly once — Enter unmounts the field on its way out,
   and a blur from that must not save a second time. A refused value surfaces
   through the shell's write-failure notice, which shows a ConvexError's
   sentence: the server owns the rule, so a typed "2.5" is sent and refused
   there rather than silently dropped here. */
function TargetInput({
  tile,
  current,
  onClose,
}: {
  tile: Tile
  current: number | undefined
  onClose: () => void
}) {
  const setTarget = useMutation(api.goals.setTileTarget)
  const clearTarget = useMutation(api.goals.clearTileTarget)
  const [draft, setDraft] = useState(
    current === undefined ? '' : String(current),
  )
  const closed = useRef(false)

  function finish(commit: boolean) {
    if (closed.current) return
    closed.current = true

    if (commit) {
      const trimmed = draft.trim()
      if (trimmed.length === 0) {
        if (current !== undefined) void clearTarget({ tile })
      } else {
        const value = Number(trimmed)
        if (value !== current) void setTarget({ tile, targetValue: value })
      }
    }
    onClose()
  }

  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      inputMode="numeric"
      placeholder="a month"
      title="Empty clears the target"
      aria-label={`Monthly target for ${tile}`}
      className="w-24 rounded-[6px] border border-lav-500/50 bg-sink/20 px-2 py-0.5 font-mono text-[12px] text-foreground outline-none"
    />
  )
}
