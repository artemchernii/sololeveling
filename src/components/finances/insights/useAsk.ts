import { useAction } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { ProAnswer } from '@/lib/claudeResult'
import type { AskAnswer } from '@/lib/marketAsk'
import type { Fact } from '@/lib/marketRead'
import { parseAsk } from '@/lib/marketAsk'
import type { useMarketRead } from './useMarketRead'

/* ASK (I4): the thread lives on the page, never in the database — kept
   while the rooms are switched, gone on reload. A question goes through
   the same path the read takes: Claude Code on his Mac on localhost (Pro
   plan, nothing counted), else the API action under the month's cap.
   One call per press, no retry; ASK AGAIN is a press. */

const CLAUDE_ASK_PATH = '/__claude/market-ask'

export type Turn = {
  id: number
  question: string
  web: boolean
  at: number
  state: 'asking' | 'done' | 'failed'
  answer?: AskAnswer
  facts?: Array<Fact>
  stamp?: {
    model: string
    inputTokens: number
    outputTokens: number
    searches: number
    cost: number
    paidBy: 'pro' | 'api'
  }
  error?: string
  cost?: number
}

let kept: Array<Turn> = []
let nextId = 1
const listeners = new Set<(t: Array<Turn>) => void>()
function put(next: Array<Turn>) {
  kept = next
  for (const l of listeners) l(kept)
}
const patch = (id: number, p: Partial<Turn>) =>
  put(kept.map((t) => (t.id === id ? { ...t, ...p } : t)))

type Read = ReturnType<typeof useMarketRead>

export function useAsk(r: Read) {
  const action = useAction(api.ai.ask.ask)
  const [turns, setTurns] = useState(kept)
  useEffect(() => {
    listeners.add(setTurns)
    return () => void listeners.delete(setTurns)
  }, [])

  const busy = turns.some((t) => t.state === 'asking')
  const capped = r.path === 'api' && r.spent >= r.cap

  async function ask(question: string, web: boolean, again?: number) {
    const q = question.trim()
    if (q === '' || busy || capped || r.path === null) return
    const id = again ?? nextId++
    if (again !== undefined)
      patch(id, { state: 'asking', error: undefined, at: Date.now() })
    else
      put([...kept, { id, question: q, web, at: Date.now(), state: 'asking' }])
    try {
      const facts = await r.factsNow()
      if (r.path === 'pro') {
        const pro = await fetch(CLAUDE_ASK_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facts,
            read: r.shown?.read ?? null,
            question: q,
            web,
            today: new Date().toISOString().slice(0, 10),
          }),
        })
          .then((x) => x.json() as Promise<ProAnswer>)
          .catch((): ProAnswer => ({ ok: false, error: 'NOT REACHED' }))
        if (!pro.ok)
          return patch(id, { state: 'failed', error: pro.error, cost: 0 })
        const parsed = parseAsk(
          pro.raw,
          facts.map((f) => f.key),
        )
        if (!parsed.ok)
          return patch(id, { state: 'failed', error: parsed.error, cost: 0 })
        return patch(id, {
          state: 'done',
          answer: parsed.answer,
          facts,
          at: Date.now(),
          stamp: {
            model: pro.model,
            inputTokens: pro.inputTokens,
            outputTokens: pro.outputTokens,
            searches: pro.searches,
            cost: 0,
            paidBy: 'pro',
          },
        })
      }
      const res = await action({ question: q, web, facts })
      if (!res.ok)
        return patch(id, { state: 'failed', error: res.error, cost: res.cost })
      patch(id, {
        state: 'done',
        answer: res.answer,
        facts,
        stamp: res.stamp,
        at: Date.now(),
      })
    } catch {
      patch(id, { state: 'failed', error: 'NOT REACHED', cost: 0 })
    }
  }

  return { turns, busy, capped, ask }
}
