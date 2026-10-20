import { useAction } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { Period } from '@/lib/insightsMarket'

/* Band 3's answer (spec I2), as useMarket keeps band 1's: one action call
   when the room opens — the verdicts and what Yahoo opens up come with
   it — and one more for each period not yet seen, for the moves alone.
   Kept in this page's memory ten minutes, never in the database. */

export type MineAnswer = FunctionReturnType<typeof api.insightsMine.mine>
type Item = {
  instrumentId: Id<'instruments'>
  symbol: string
  type: string
  name: string
}

const KEEP_MS = 10 * 60_000
const kept = new Map<string, { at: number; answer: MineAnswer }>()
const fresh = (k: string) => {
  const hit = kept.get(k)
  return hit && Date.now() - hit.at < KEEP_MS ? hit.answer : null
}

export function useMine(period: Period, items: ReadonlyArray<Item> | null) {
  const ask = useAction(api.insightsMine.mine)
  const held = items?.map((i) => i.instrumentId).join(',') ?? null
  const [answers, setAnswers] = useState<Partial<Record<string, MineAnswer>>>(
    {},
  )
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  /* The moves last shown stay (dimmed) while another period is read. */
  const [last, setLast] = useState<MineAnswer | null>(null)
  const key = `${held}|${period}`
  const baseKey = `${held}|base`

  useEffect(() => {
    if (items === null || items.length === 0) return
    const hit = fresh(key)
    const base = fresh(baseKey)
    if (hit && base) {
      setAnswers((was) => ({ ...was, [key]: hit, [baseKey]: base }))
      setLast(hit)
      return
    }
    let live = true
    setFailed((was) => new Set([...was].filter((k) => k !== key)))
    ask({ period, items: [...items], first: base === null })
      .then((a) => {
        const at = Date.now()
        kept.set(key, { at, answer: a })
        if (base === null) kept.set(baseKey, { at, answer: a })
        if (!live) return
        setAnswers((was) => ({ ...was, [key]: a, [baseKey]: base ?? a }))
        setLast(a)
      })
      .catch(() => {
        if (live) setFailed((was) => new Set(was).add(key))
      })
    return () => {
      live = false
    }
    /* `items` are read by `held`, which is in `key`. */
  }, [ask, key])

  const answer = answers[key] ?? null
  return {
    answer,
    shown: answer ?? last,
    base: answers[baseKey] ?? null,
    reading: answer === null && !failed.has(key),
    failed: failed.has(key),
  }
}
