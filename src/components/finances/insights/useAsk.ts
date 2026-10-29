import { useAction } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../../convex/_generated/api'
import type { ProAnswer } from '@/lib/claudeResult'
import { localModel } from '@/lib/localModel'
import type { AskAnswer, LineContext, Said } from '@/lib/marketAsk'
import type { Fact } from '@/lib/marketRead'
import { MAX_HISTORY, parseAsk } from '@/lib/marketAsk'
import { askContext } from './askPrefill'
import type { useMarketRead } from './useMarketRead'

/* ASK (I4): the thread lives on the page, never in the database — kept
   while the rooms are switched, gone on reload. A question goes through
   the same path the read takes: Claude Code on his Mac on localhost (Pro
   plan, nothing counted), else the API action under the month's cap.
   One call per press, no retry; ASK AGAIN is a press. The web is always
   searched (29 Oct). From IDEAS a question carries the line its ✦ opened
   on and a dropped screenshot — both on the page only, never stored. */

const CLAUDE_ASK_PATH = '/__claude/market-ask'

export type Turn = {
  id: number
  question: string
  at: number
  /** The IDEAS line it was asked on. */
  line?: LineContext
  /** What it was asked on, as the asking line names it. */
  given?: Array<string>
  /** A dropped screenshot, as a data URL, and its file name. */
  shot?: { url: string; name: string }
  state: 'asking' | 'done' | 'failed'
  answer?: AskAnswer
  facts?: Array<Fact>
  /** The tickers NEXT showed when it was asked. */
  skip?: Array<string>
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

  async function ask(
    question: string,
    more: { line?: LineContext; shot?: Turn['shot'] } = {},
    again?: number,
  ) {
    const q = question.trim()
    if (q === '' || busy || capped || r.path === null) return
    const id = again ?? nextId++
    if (again !== undefined)
      patch(id, { state: 'asking', error: undefined, at: Date.now() })
    else
      put([
        ...kept,
        { id, question: q, at: Date.now(), state: 'asking', ...more },
      ])
    const { line, shot } = again
      ? (kept.find((t) => t.id === again) ?? {})
      : more
    try {
      /* From IDEAS: his cash, spending, holdings and plan ride along. */
      const ctx = askContext()
      const base = await r.factsNow()
      const had = new Set(base.map((f) => f.key))
      const facts = [
        ...base,
        ...(ctx?.facts ?? []).filter((f) => !had.has(f.key)),
      ]
      const plan = ctx?.plan ?? null
      patch(id, { given: givenOf(facts, plan) })
      /* Since IDEAS became the board (29 Oct) no NEXT cards to skip. */
      const skip: Array<string> = []
      /* The answered turns before this one: a follow-up reads on. */
      const history: Array<Said> = kept
        .filter((t) => t.id < id && t.state === 'done' && t.answer)
        .slice(-MAX_HISTORY)
        .map((t) => ({ q: t.question, a: t.answer!.answer }))
      if (r.path === 'pro') {
        const pro = await fetch(CLAUDE_ASK_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            facts,
            read: r.shown?.read ?? null,
            question: q,
            today: new Date().toISOString().slice(0, 10),
            history,
            line: line ?? null,
            shot: shot?.url ?? null,
            plan,
            model: localModel(),
          }),
        })
          .then((x) => x.json() as Promise<ProAnswer>)
          .catch((): ProAnswer => ({ ok: false, error: 'NOT REACHED' }))
        if (!pro.ok)
          return patch(id, { state: 'failed', error: pro.error, cost: 0 })
        const parsed = parseAsk(
          pro.raw,
          facts.map((f) => f.key),
          skip,
        )
        if (!parsed.ok)
          return patch(id, { state: 'failed', error: parsed.error, cost: 0 })
        return patch(id, {
          state: 'done',
          answer: parsed.answer,
          facts,
          skip,
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
      const res = await action({
        question: q,
        facts,
        history,
        ...(line && { line }),
        ...(shot && { shot: shot.url }),
        ...(plan && { plan }),
      })
      if (!res.ok)
        return patch(id, { state: 'failed', error: res.error, cost: res.cost })
      patch(id, {
        state: 'done',
        answer: res.answer,
        facts,
        skip,
        stamp: res.stamp,
        at: Date.now(),
      })
    } catch {
      patch(id, { state: 'failed', error: 'NOT REACHED', cost: 0 })
    }
  }

  return { turns, busy, capped, ask }
}

/** The asking line's chips: what the question carries of his. */
function givenOf(facts: Array<Fact>, plan: string | null): Array<string> {
  const held = facts.filter((f) => f.key.startsWith('pos-')).length
  const cash = facts.find((f) => f.key === 'cash-idle')?.value.split(' · ')[0]
  return [
    ...(held ? [`${held} HOLDINGS`] : []),
    ...(cash ? [`CASH ${cash}`] : []),
    ...(facts.some((f) => f.key === 'spend-month') ? ['SPENDING'] : []),
    ...(plan ? ['IDEAS PLAN'] : []),
  ]
}
