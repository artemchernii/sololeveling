import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import { areaVars } from '@/lib/areas'
import type { Area } from '@/lib/capture-parser'
import { daysLeftInMonth, monthRange, targetLine } from '@/lib/month'
import { MONTH_TILES } from '@/lib/tiles'
import type { MonthTile, Tile } from '@/lib/tiles'

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
  target: { value: number; label?: string } | null | undefined
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
        {target && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="Change the monthly target"
            className="-mx-1 rounded-[5px] px-1 text-[15px] font-light text-ink-400 transition-colors hover:bg-lift/10"
          >
            of {target.value}
          </button>
        ) : null}
        <span className="text-[12.5px] text-ink-500">{tile.noun}</span>
      </div>

      {/* What the count is in aid of, in the person's own words. No bar grows
          from it and no arithmetic touches it — a money target is a sum of
          amounts, which is not one of the four sources (PLAN.md §4). */}
      {target?.label && !editing ? (
        <div className="mt-1 text-[12px] text-ink-600 italic">
          {target.label}
        </div>
      ) : null}

      {target && count ? (
        <TargetBar count={count.now} target={target.value} area={tile.area} />
      ) : null}

      <div className="mt-1.5 flex items-baseline justify-between gap-2 font-mono text-[11px]">
        {editing ? (
          <TargetInput
            tile={tile.key}
            current={target ?? undefined}
            onClose={() => setEditing(false)}
          />
        ) : target ? (
          <span className="text-ink-500">
            {count ? targetLine(count.now, target.value, daysLeft) : ''}
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
   there rather than silently dropped here.

   Since 20 Sep there are two fields: the number, and the words beside it.
   Only the number is a denominator — the bar divides by it — and the words
   are free text nothing computes with (PLAN.md §4). Emptying the number
   clears the target outright, words and all: words with no count have
   nothing to sit beside. Moving from one field to the other is not leaving,
   so the blur that saves is the one that lands outside both. */
function TargetInput({
  tile,
  current,
  onClose,
}: {
  tile: Tile
  current: { value: number; label?: string } | undefined
  onClose: () => void
}) {
  const setTarget = useMutation(api.goals.setTileTarget)
  const clearTarget = useMutation(api.goals.clearTileTarget)
  const [draft, setDraft] = useState(
    current === undefined ? '' : String(current.value),
  )
  const [words, setWords] = useState(current?.label ?? '')
  const closed = useRef(false)

  function finish(commit: boolean) {
    if (closed.current) return
    closed.current = true

    if (commit) {
      const trimmed = draft.trim()
      const label = words.trim()
      if (trimmed.length === 0) {
        if (current !== undefined) void clearTarget({ tile })
      } else {
        const value = Number(trimmed)
        const changed =
          current === undefined ||
          value !== current.value ||
          label !== (current.label ?? '')
        if (changed) {
          void setTarget({
            tile,
            targetValue: value,
            targetLabel: label || null,
          })
        }
      }
    }
    onClose()
  }

  /* One escape and one commit for the pair: leaving the number for the words
     is not leaving the field, so blur only counts when focus lands outside
     both. */
  function onBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget)) return
    finish(true)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') finish(true)
    if (e.key === 'Escape') finish(false)
  }

  return (
    <div
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className="flex min-w-0 flex-1 items-center gap-1.5"
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        inputMode="numeric"
        placeholder="a month"
        title="Empty clears the target"
        aria-label={`Monthly target for ${tile}`}
        className="w-16 shrink-0 rounded-[6px] border border-lav-500/50 bg-sink/20 px-2 py-0.5 font-mono text-[12px] text-foreground outline-none"
      />
      <input
        value={words}
        onChange={(e) => setWords(e.target.value)}
        placeholder="aiming at…"
        aria-label={`What the ${tile} target is for`}
        className="min-w-0 flex-1 rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-0.5 text-[12px] text-ink-300 outline-none placeholder:text-ink-700"
      />
    </div>
  )
}
