import { useAction, useConvex } from 'convex/react'
import type { ConvexReactClient } from 'convex/react'
import { useEffect, useState } from 'react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { findPath } from '@/components/finances/insights/useMarketRead'
import type { Path } from '@/components/finances/insights/useMarketRead'
import type { ProAnswer } from '@/lib/claudeResult'
import { localModel } from '@/lib/localModel'
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
  /** N4: the server's copy of the answer (askReplies), a day long. */
  replyId?: Id<'askReplies'>
  /** N4: when it rang the phone, for a turn opened from the push. */
  rang?: number
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

/* The rows of a period, read and counted: what the strip and the tiles
   show, for a question and for an answer reopened from the push. */
async function readRows(
  convex: ConvexReactClient,
  period: Period,
  offsetMin: number,
) {
  const { rows, areas } = await convex.query(api.rowsAsk.forPeriod, {
    from: period.from,
    to: period.to,
  })
  const label = new Map(areas.map((a) => [a.slug, a.label]))
  const facts = rowFacts(
    rows,
    (s) => label.get(s) ?? s,
    offsetMin,
    monthsOf(period, offsetMin),
  )
  return { rows, facts, labels: Object.fromEntries(label) }
}

/* N4 (22 Oct). An answer that lands on screen is seen and does not ring;
   one that lands while the page is hidden is marked seen when the page
   comes back (unless it rang already). */
const unseen = new Set<Id<'askReplies'>>()
const onScreen = () => document.visibilityState === 'visible'

function settle(convex: ConvexReactClient, id: Id<'askReplies'>) {
  if (!onScreen()) return void unseen.add(id)
  /* A locked iPhone can still say "visible" (22 Oct: both his answers
     were marked seen 0.1 s after they landed, and nothing rang). A frame
     is drawn only on a lit screen, so seen waits for two of them; locked,
     they come on unlock — after the ring, if it took longer. */
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (onScreen()) void convex.mutation(api.askReplies.seen, { id })
      else unseen.add(id)
    }),
  )
}

/** A kept answer into the thread: in place of the turn that lost it (the
    phone locked while it ran), else at the end. */
async function restore(convex: ConvexReactClient, r: Doc<'askReplies'>) {
  if (kept.some((t) => t.replyId === r._id)) return false
  const period: Period = {
    from: r.from,
    to: r.to,
    title: r.title,
    range: r.range,
  }
  const lost = kept.find(
    (t) =>
      t.replyId === undefined &&
      t.state !== 'done' &&
      t.question === r.question,
  )
  const id = lost?.id ?? nextId++
  const turn: RowsTurn = {
    id,
    question: r.question,
    at: lost?.at ?? r._creationTime,
    state: r.answer ? 'done' : 'failed',
    period,
    answer: r.answer,
    stamp: r.stamp && { ...r.stamp, paidBy: 'api' },
    error: r.error,
    cost: r.cost,
    replyId: r._id,
    rang: r.rangAt,
  }
  if (lost) patch(id, turn)
  else put([...kept, turn])
  void convex.mutation(api.askReplies.seen, { id: r._id })
  try {
    patch(id, await readRows(convex, period, new Date().getTimezoneOffset()))
  } catch {
    /* the answer still shows; only its strip and tiles are missing */
  }
  return true
}

/** The push or a bell row: `?ask=<id>`. False when it is gone. */
export async function openReply(convex: ConvexReactClient, id: string) {
  const r = await convex
    .query(api.askReplies.get, { id: id as Id<'askReplies'> })
    .catch(() => null)
  if (r === null) return false
  await restore(convex, r)
  return true
}

/* Back on screen: answers that landed while away are seen now, and a
   turn the page lost (its call cut when the phone locked) gets its
   answer from the server. */
async function comeBack(convex: ConvexReactClient) {
  for (const id of unseen) void convex.mutation(api.askReplies.seen, { id })
  unseen.clear()
  const lost = kept.filter((t) => t.replyId === undefined && t.state !== 'done')
  if (lost.length === 0) return
  const from = Math.min(...lost.map((t) => t.at)) - 5_000
  const found = await convex
    .query(api.askReplies.since, { from })
    .catch(() => [])
  for (const r of found) await restore(convex, r)
}

export function useRowsAsk() {
  const convex = useConvex()
  const action = useAction(api.ai.rowsAsk.ask)
  const [turns, setTurns] = useState(kept)
  const [path, setPath] = useState<Path | null>(null)
  useEffect(() => {
    listeners.add(setTurns)
    void findPath().then(setPath)
    const back = () => {
      if (onScreen()) void comeBack(convex)
    }
    document.addEventListener('visibilitychange', back)
    return () => {
      listeners.delete(setTurns)
      document.removeEventListener('visibilitychange', back)
    }
  }, [convex])
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
      const { rows, facts, labels } = await readRows(convex, period, offsetMin)
      /* The strip shows while the model reads. */
      patch(id, { rows, facts, labels })

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
            model: localModel(),
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
      /* Restored from the server meanwhile (the page came back first). */
      if (res.replyId && kept.some((t) => t.replyId === res.replyId)) return
      if (res.replyId) settle(convex, res.replyId)
      if (!res.ok)
        return patch(id, {
          state: 'failed',
          error: res.error,
          cost: res.cost,
          replyId: res.replyId,
        })
      patch(id, {
        state: 'done',
        answer: res.answer,
        stamp: { ...res.stamp, paidBy: 'api' },
        at: Date.now(),
        replyId: res.replyId,
      })
    } catch {
      patch(id, { state: 'failed', error: 'NOT REACHED', cost: 0 })
    }
  }

  return { turns, busy, path, ask }
}
