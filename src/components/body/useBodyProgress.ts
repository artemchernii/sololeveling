import { useDayStarts } from '@/components/track/useDayStarts'
import { useQuery } from 'convex-helpers/react/cache/hooks'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { dayById, lookupRef } from '@/lib/body/library'
import type { RefHit } from '@/lib/body/library'
import { nextRoutine } from '@/lib/body/next'
import type { NextPick } from '@/lib/body/next'

/* His Body drills read against the library: which programs are in Today,
   what each exercise's days look like, and the one routine for today. Every
   figure is from aggregate.drillDays; this only joins it to the reference. */

export type DrillRow = {
  drill: Doc<'drills'>
  hit: RefHit | undefined
  /** Per day, oldest first, over STRIP_WEEKS. */
  days: Array<number>
  lastAt: number | null
}

export type BodyProgress = {
  ready: boolean
  dayStarts: Array<number>
  rows: Array<DrillRow>
  pickedPrograms: ReadonlySet<string>
  pickedDays: ReadonlySet<string>
  pick: NextPick | null
  /** Drills he typed himself, by group. */
  own: Array<DrillRow>
}

export function useBodyProgress(): BodyProgress {
  /* Stable within a day so the query's arguments do not change every
     render, and moved on at midnight (useDayStarts). */
  const dayStarts = useDayStarts()
  const drills = useQuery(api.drills.list, { area: 'body' })
  const days = useQuery(api.aggregate.drillDays, {
    area: 'body',
    dayStarts,
    end: dayStarts[dayStarts.length - 1] + 86_400_000,
  })
  const byDrill = new Map<
    Id<'drills'>,
    { days: Array<number>; lastAt: number }
  >(days?.rows.map((r) => [r.drillId, r]) ?? [])

  const rows: Array<DrillRow> = (drills ?? []).map((drill) => {
    const r = byDrill.get(drill._id)
    return {
      drill,
      hit: lookupRef(drill.ref),
      days: r?.days ?? dayStarts.map(() => 0),
      lastAt: r?.lastAt ?? null,
    }
  })
  const pickedPrograms = new Set<string>()
  const pickedDays = new Set<string>()
  const lastByDay = new Map<string, number>()
  /* Exercises of each routine day ticked today. */
  const doneToday = new Map<string, number>()
  for (const row of rows) {
    if (!row.hit) continue
    pickedPrograms.add(row.hit.program.id)
    pickedDays.add(row.hit.day.id)
    if ((row.days.at(-1) ?? 0) > 0) {
      const id = row.hit.day.id
      doneToday.set(id, (doneToday.get(id) ?? 0) + 1)
    }
    if (row.lastAt !== null) {
      const id = row.hit.day.id
      lastByDay.set(id, Math.max(lastByDay.get(id) ?? 0, row.lastAt))
    }
  }
  const today = dayStarts[dayStarts.length - 1]

  return {
    ready: drills !== undefined && days !== undefined,
    dayStarts,
    rows,
    pickedPrograms,
    pickedDays,
    pick: nextRoutine(
      pickedDays,
      (id) => lastByDay.get(id) ?? null,
      today,
      (id) => doneToday.get(id) === dayById(id)?.exercises.length,
    ),
    own: rows.filter((r) => !r.hit),
  }
}
