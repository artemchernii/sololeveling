import { useAction } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { FunctionReturnType } from 'convex/server'
import type { Period } from '@/lib/insightsMarket'

/* The market, asked once when the room opens and once for each period not
   yet seen (spec I1). One action call, never a reactive query: the answer
   lives in this page's memory for ten minutes and nowhere else — not in
   the database ("DONT SAVE IT TO DB"), not in the browser's storage. */

export type Answer = FunctionReturnType<typeof api.insightsMarket.market>
export type Rate = Answer['rates'][number]

const KEEP_MS = 10 * 60_000
const kept = new Map<Period, { at: number; answer: Answer }>()

function fresh(p: Period): Answer | null {
  const hit = kept.get(p)
  return hit && Date.now() - hit.at < KEEP_MS ? hit.answer : null
}

export function useMarket(period: Period) {
  const ask = useAction(api.insightsMarket.market)
  const [answers, setAnswers] = useState<Partial<Record<Period, Answer>>>(
    () => {
      const a = fresh(period)
      return a ? { [period]: a } : {}
    },
  )
  const [failed, setFailed] = useState<ReadonlySet<Period>>(new Set())
  /* The answer last shown, kept on screen (dimmed) while another period is
     read, so the cards keep their size. */
  const [last, setLast] = useState<Answer | null>(() => fresh(period))

  useEffect(() => {
    const hit = fresh(period)
    if (hit) {
      setAnswers((was) => ({ ...was, [period]: hit }))
      setLast(hit)
      return
    }
    let live = true
    setFailed((was) => {
      const next = new Set(was)
      next.delete(period)
      return next
    })
    ask({ period })
      .then((a) => {
        kept.set(period, { at: Date.now(), answer: a })
        if (!live) return
        setAnswers((was) => ({ ...was, [period]: a }))
        setLast(a)
      })
      .catch(() => {
        if (live) setFailed((was) => new Set(was).add(period))
      })
    return () => {
      live = false
    }
  }, [ask, period])

  const answer = answers[period] ?? null
  return {
    answer,
    /** What to draw: this period's answer, else the last one while reading. */
    shown: answer ?? last,
    reading: answer === null && !failed.has(period),
    failed: failed.has(period),
  }
}

/** The month's answer for the read (I3): the kept one, or asked now. */
export async function monthAnswer(
  ask: (a: { period: Period }) => Promise<Answer>,
): Promise<Answer> {
  const hit = fresh('1M')
  if (hit) return hit
  const a = await ask({ period: '1M' })
  kept.set('1M', { at: Date.now(), answer: a })
  return a
}
