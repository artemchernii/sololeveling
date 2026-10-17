import { useMemo, useRef } from 'react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../convex/_generated/api'
import { joinWorth } from './worthHistory'

export type WorthHistory = FunctionReturnType<typeof api.aggregate.worthHistory>

/**
 * aggregate.worthHistory as the screens read it (18 Oct): the past days
 * from worthPast, which a price saved today does not re-run, and the last
 * day from worthToday, which it does — one point instead of the year.
 *
 * When what was held changes, worthToday is asked again with new args; the
 * pair it had stays on screen until both halves are back, so the line
 * never blinks out. A different range is a different answer: never held.
 */
export function useWorthHistory(
  dayEnds: ReadonlyArray<number>,
): WorthHistory | undefined {
  const past = useQuery(api.aggregate.worthPast, { dayEnds: [...dayEnds] })
  const today = useQuery(
    api.aggregate.worthToday,
    past === undefined ? 'skip' : past.today,
  )
  const joined = useMemo(
    () =>
      past !== undefined && today !== undefined
        ? joinWorth(past, today)
        : undefined,
    [past, today],
  )
  const key = dayEnds.join(',')
  const held = useRef<{ key: string; value: WorthHistory } | null>(null)
  if (joined !== undefined) held.current = { key, value: joined }
  return joined ?? (held.current?.key === key ? held.current.value : undefined)
}
