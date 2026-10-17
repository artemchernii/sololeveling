import { useCallback, useEffect, useRef, useState } from 'react'
import { useAction, useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import type { Headline } from '@/lib/yahooFundamentals'

/* The verdict's two feeds on a position held now (16 Oct, mockup
   fundamentals.html): the stored fundamentals — read again when the
   latest is a day old, `updating` until the new one lands — and the
   headlines, fetched once on open and never stored. */

export type Fundamentals = FunctionReturnType<typeof api.fundamentals.latest>
export type News =
  | { state: 'loading' }
  | { state: 'failed' }
  | { state: 'ok'; at: number; items: Array<Headline> }

/* A read that never lands stops showing UPDATING after this. */
const GIVE_UP = 60_000

export function usePositionFeeds(instrumentId: Id<'instruments'>, on: boolean) {
  const fund = useQuery(api.fundamentals.latest, on ? { instrumentId } : 'skip')
  const refresh = useMutation(api.fundamentals.refresh)
  /* The reading's day when a new one was asked for; null when none is. */
  const [asked, setAsked] = useState<number | null>(null)
  const done = useRef<Id<'instruments'> | null>(null)
  useEffect(() => {
    if (!on || fund === undefined || done.current === instrumentId) return
    done.current = instrumentId
    const was = fund?.reading.asOf ?? 0
    void refresh({ instrumentId })
      .then((r) => {
        if (r === 'reading') setAsked(was)
      })
      .catch(() => undefined)
  }, [on, fund, instrumentId, refresh])
  useEffect(() => {
    if (asked === null) return
    const t = setTimeout(() => setAsked(null), GIVE_UP)
    return () => clearTimeout(t)
  }, [asked])
  const updating =
    asked !== null && (fund?.reading.asOf ?? 0) <= asked ? true : false

  const read = useAction(api.news.of)
  const [news, setNews] = useState<News>({ state: 'loading' })
  const load = useCallback(() => {
    setNews({ state: 'loading' })
    read({ instrumentId })
      .then((r) => setNews({ state: 'ok', ...r }))
      .catch(() => setNews({ state: 'failed' }))
  }, [read, instrumentId])
  useEffect(() => {
    if (on) load()
  }, [on, load])

  return { fund, updating, news, retry: load }
}
