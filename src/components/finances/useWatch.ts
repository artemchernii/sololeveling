import { useEffect, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { WatchFacts } from '@/lib/watch'

/* The watchlist's reads, shared by its box, the ★ on MARKET and TARGET
   (1 Nov, spec docs/specs/2026-11-01-watchlist.md). Each name's year is
   asked once and kept ten minutes in page memory, as MOVERS is: one
   action call, never a reactive query (a year is ~250 closes a name). */

const KEEP_MS = 10 * 60_000
const kept = new Map<string, { at: number; facts: WatchFacts | null }>()

export type Watched = FunctionReturnType<typeof api.watch.list>[number]

export function useWatchList() {
  return useQuery(api.watch.list, {})
}

/** Each listed name's 52W, VS HIGH and SIGNAL, by instrument id. */
export function useWatchFacts(
  ids: ReadonlyArray<Id<'instruments'>>,
  /** Changes when a newer close is stored: a name without its year yet
      is asked again then, never kept empty. */
  stamp = 0,
): ReadonlyMap<string, WatchFacts | null> {
  const ask = useAction(api.watch.facts)
  const fresh = (id: string) => {
    const k = kept.get(id)
    return k !== undefined && Date.now() - k.at < KEEP_MS
  }
  const [, redraw] = useState(0)
  const key = ids.join(',')
  useEffect(() => {
    const missing = ids.filter((id) => !fresh(id))
    if (missing.length === 0) return
    let live = true
    ask({ ids: missing })
      .then((rows) => {
        const at = Date.now()
        for (const r of rows)
          if (r.facts !== null) kept.set(r.instrumentId, { at, facts: r.facts })
        if (live) redraw((n) => n + 1)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [key, stamp, ask])
  return new Map(
    ids.flatMap((id) => {
      const k = kept.get(id)
      return k ? [[id, k.facts] as const] : []
    }),
  )
}

/** What a ★ press says: saving, on the list (with the count), or full. */
export type StarState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'added'; count: number }
  | { kind: 'full' }
  | { kind: 'failed' }

export type Candidate = {
  symbol: string
  name: string
  exchange?: string
  type?: string
}

/** ★ on any ticker the app shows: on the list, or off it again. */
export function useStar() {
  const list = useWatchList()
  const add = useMutation(api.watch.add)
  const remove = useMutation(api.watch.remove)
  const [state, setState] = useState<Record<string, StarState>>({})
  const on = (symbol: string) => list?.find((w) => w.symbol === symbol)
  const set = (symbol: string, s: StarState) =>
    setState((m) => ({ ...m, [symbol]: s }))
  const press = async (c: Candidate) => {
    const had = on(c.symbol)
    set(c.symbol, { kind: 'saving' })
    try {
      if (had) {
        await remove({ instrumentId: had.instrumentId })
        set(c.symbol, { kind: 'idle' })
        return
      }
      await add({
        candidate: {
          symbol: c.symbol,
          name: c.name,
          exchange: c.exchange ?? '',
          type: c.type ?? 'EQUITY',
        },
      })
      set(c.symbol, { kind: 'added', count: (list?.length ?? 0) + 1 })
    } catch (e) {
      const full = e instanceof ConvexError && e.data === 'WATCH_FULL'
      set(c.symbol, { kind: full ? 'full' : 'failed' })
    }
  }
  return {
    ready: list !== undefined,
    isOn: (symbol: string) => on(symbol) !== undefined,
    stateOf: (symbol: string): StarState => state[symbol] ?? { kind: 'idle' },
    settle: (symbol: string) => set(symbol, { kind: 'idle' }),
    press,
  }
}
