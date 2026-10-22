import { useAction, useConvex } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../convex/_generated/api'
import { findPath } from '@/components/finances/insights/useMarketRead'
import type { Path } from '@/components/finances/insights/useMarketRead'
import type { ProAnswer } from '@/lib/claudeResult'
import { lastDays, monthsOf, periodOf, rowFacts, rowLines } from '@/lib/rowsAsk'
import type { AskRows, Period, RowFact } from '@/lib/rowsAsk'
import { MAX_HISTORY, parseRows } from '@/lib/rowsAskPrompt'
import type { RowsAnswer, Said } from '@/lib/rowsAskPrompt'

/* R7 Ask AI: the thread lives on the page, never in the database — kept
   while the drawer closes and the pages change, gone on reload. A question
   names its period (or keeps the one before, or the last 30 days); the
   rows are read once, the app counts them, and the model is asked —
   Claude Code on his Mac on localhost (Pro plan, nothing counted), else
   the API action under the month's $2. One call per press; ASK AGAIN is a
   press. */

const CLAUDE_ROWS_PATH = '/__claude/rows-ask'

export type RowsTurn = {
  id: number
  question: string
  at: number
  state: 'asking' | 'done' | 'failed'
  period: Period
  rows?: AskRows
  facts?: Array<RowFact>
  /** Area slug → its name, for the strip's legend. */
  labels?: Record<string, string>
  answer?: RowsAnswer
  stamp?: {
    model: string
    inputTokens: number
    outputTokens: number
    cost: number
    paidBy: Path
  }
  error?: string
  cost?: number
}

let kept: Array<RowsTurn> = []
let nextId = 1
const listeners = new Set<(t: Array<RowsTurn>) => void>()
function put(next: Array<RowsTurn>) {
  kept = next
  for (const l of listeners) l(kept)
}
const patch = (id: number, p: Partial<RowsTurn>) =>
  put(kept.map((t) => (t.id === id ? { ...t, ...p } : t)))

export function useRowsAsk() {
  const convex = useConvex()
  const action = useAction(api.ai.rowsAsk.ask)
  const [turns, setTurns] = useState(kept)
  const [path, setPath] = useState<Path | null>(null)
  useEffect(() => {
    listeners.add(setTurns)
    void findPath().then(setPath)
    return () => void listeners.delete(setTurns)
  }, [])
  const busy = turns.some((t) => t.state === 'asking')

  async function ask(question: string, again?: number) {
    const q = question.trim()
    if (q === '' || busy || path === null) return
    const now = new Date()
    const before = kept
      .filter((t) => again === undefined || t.id < again)
      .at(-1)
    const period = periodOf(q, now) ?? before?.period ?? lastDays(now)
    const id = again ?? nextId++
    if (again !== undefined)
      patch(id, { state: 'asking', error: undefined, at: Date.now() })
    else
      put([
        ...kept,
        { id, question: q, at: Date.now(), state: 'asking', period },
      ])
    const offsetMin = now.getTimezoneOffset()
    const history: Array<Said> = kept
      .filter((t) => t.id < id && t.state === 'done' && t.answer)
      .slice(-MAX_HISTORY)
      .map((t) => ({
        q: t.question,
        a: [t.answer!.headline, ...t.answer!.lines.map((l) => l.text)].join(
          ' ',
        ),
      }))
    try {
      const { rows, areas } = await convex.query(api.rowsAsk.forPeriod, {
        from: period.from,
        to: period.to,
      })
      const label = new Map(areas.map((a) => [a.slug, a.label]))
      const facts = rowFacts(
        rows,
        (s) => label.get(s) ?? s,
        offsetMin,
        monthsOf(period),
      )
      /* The strip shows while the model reads. */
      patch(id, { rows, facts, labels: Object.fromEntries(label) })

      if (path === 'pro') {
        const pro = await fetch(CLAUDE_ROWS_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q,
            period,
            facts,
            lines: rowLines(rows, offsetMin),
            goals: rows.goals,
            more: rows.more,
            today: new Date(now.getTime() - offsetMin * 60_000)
              .toISOString()
              .slice(0, 10),
            history,
          }),
        })
          .then((x) => x.json() as Promise<ProAnswer>)
          .catch((): ProAnswer => ({ ok: false, error: 'NOT REACHED' }))
        if (!pro.ok)
          return patch(id, { state: 'failed', error: pro.error, cost: 0 })
        const parsed = parseRows(pro.raw, facts)
        if (!parsed.ok)
          return patch(id, { state: 'failed', error: parsed.error, cost: 0 })
        return patch(id, {
          state: 'done',
          answer: parsed.answer,
          at: Date.now(),
          stamp: {
            model: pro.model,
            inputTokens: pro.inputTokens,
            outputTokens: pro.outputTokens,
            cost: 0,
            paidBy: 'pro',
          },
        })
      }
      const res = await action({
        question: q,
        from: period.from,
        to: period.to,
        title: period.title,
        range: period.range,
        offsetMin,
        history,
      })
      if (!res.ok)
        return patch(id, { state: 'failed', error: res.error, cost: res.cost })
      patch(id, {
        state: 'done',
        answer: res.answer,
        stamp: { ...res.stamp, paidBy: 'api' },
        at: Date.now(),
      })
    } catch {
      patch(id, { state: 'failed', error: 'NOT REACHED', cost: 0 })
    }
  }

  return { turns, busy, path, ask }
}
