import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { SaveLabel, useSave } from '@/components/Saving'
import { cn } from '@/lib/utils'

/* PLAN.md §3: five questions, then the one sentence, then close the week.
 
   The questions are fixed and in this order because a review with a different
   shape every week is not a review. The sentence is the only part that changes
   anything next week, which is why the backend refuses to close without it —
   the button below says so rather than failing silently. */

const QUESTIONS = [
  { key: 'didHappen', label: 'What actually happened' },
  { key: 'movedForward', label: 'What moved forward' },
  { key: 'avoided', label: 'What I avoided' },
  { key: 'overthought', label: 'What I overthought' },
  { key: 'shouldChange', label: 'What should change' },
] as const

type Answers = Doc<'reviews'>['answers']

export function CloseWeek({
  weekKey,
  review,
}: {
  weekKey: string
  review: Doc<'reviews'> | null | undefined
}) {
  const save = useMutation(api.reviews.save)
  const close = useMutation(api.reviews.close)
  const reopen = useMutation(api.reviews.reopen)

  const [answers, setAnswers] = useState<Answers>({})
  const [decision, setDecision] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const saving = useSave()
  const closing = useSave()
  /* The week this screen closed, so the Closed tag pops for the press — not
     for a week that was already closed when the page loaded, or paged to. */
  const [closedHere, setClosedHere] = useState<string | null>(null)

  /* Reload whenever the week changes, or when the row arrives after the first
     render — a query is undefined before it resolves, and typing into a form
     that then overwrites itself is the worst version of this screen. */
  useEffect(() => {
    if (review === undefined) return
    setAnswers(review?.answers ?? {})
    setDecision(review?.decision ?? '')
    setStatus(null)
  }, [review, weekKey])

  const closed = review?.closedAt !== undefined

  async function persist() {
    try {
      await saving.run(() => save({ periodStart: weekKey, answers, decision }))
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'That did not save')
    }
  }

  async function closeWeek() {
    try {
      await closing.run(async () => {
        await save({ periodStart: weekKey, answers, decision })
        await close({ periodStart: weekKey })
      })
      /* The button that would carry the tick has already become Reopen; the
         Closed tag arriving is the confirmation instead. */
      setClosedHere(weekKey)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'That did not close')
    }
  }

  return (
    <div className="glass flex flex-col gap-4 rounded-[22px] p-5">
      <div className="flex items-baseline justify-between">
        <div className="label-caps">Close the week</div>
        {closed ? (
          <span
            className={cn(
              'label-caps text-lav-300',
              closedHere === weekKey && 'motion-pop',
            )}
          >
            Closed
          </span>
        ) : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {QUESTIONS.map((question) => (
          <label key={question.key} className="flex flex-col gap-1">
            <span className="label-caps">{question.label}</span>
            <textarea
              rows={3}
              value={answers[question.key] ?? ''}
              onChange={(e) =>
                setAnswers({ ...answers, [question.key]: e.target.value })
              }
              className="resize-y rounded-[7px] bg-lift/[0.05] px-3 py-2 text-[13px] text-foreground outline-none ring-1 ring-lift/10 focus:ring-lav-300/40"
            />
          </label>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="label-caps">What changes next week</span>
        <input
          value={decision}
          onChange={(e) => setDecision(e.target.value)}
          placeholder="One sentence."
          className="rounded-[7px] bg-lift/[0.05] px-3 py-2 text-[13px] text-foreground outline-none ring-1 ring-lift/10 focus:ring-lav-300/40"
        />
        <span className="text-[11.5px] text-ink-700">
          The week does not close without this. The rest is how you arrive at
          it.
        </span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] text-ink-500">{status ?? ''}</span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={saving.busy}
            onClick={persist}
            className="rounded-[7px] bg-lift/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-lift/10"
          >
            <SaveLabel status={saving.status} onSettled={saving.settle}>
              Save
            </SaveLabel>
          </button>
          {closed ? (
            <button
              type="button"
              onClick={() => reopen({ periodStart: weekKey })}
              className="rounded-[7px] px-3 py-1.5 text-[12.5px] text-ink-600"
            >
              Reopen
            </button>
          ) : (
            <button
              type="button"
              disabled={closing.busy}
              onClick={closeWeek}
              className="rounded-[7px] bg-lav-300/20 px-3 py-1.5 text-[12.5px] text-foreground ring-1 ring-lav-300/40"
            >
              <SaveLabel status={closing.status} onSettled={closing.settle}>
                Close the week
              </SaveLabel>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
