import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Check, LoaderCircle, PenLine } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { Tile } from '@/components/review/parts'

/* The week's one line, and the press that closes the week with it. Every
   press answers: saving at once, then SAVED with a tick, or NOT SAVED with
   the line kept. */
export function NoteTile({
  periodStart,
  review,
  span,
}: {
  periodStart: string
  review: Doc<'reviews'> | null
  span: string
}) {
  const close = useMutation(api.reviews.closeWith)
  const [text, setText] = useState('')
  const [state, setState] = useState<'idle' | 'saving' | 'failed'>('idle')
  const closed = review?.closedAt !== undefined && review.decision

  const press = async () => {
    if (text.trim() === '' || state === 'saving') return
    setState('saving')
    try {
      await close({ periodStart, decision: text })
      setState('idle')
    } catch {
      setState('failed')
    }
  }

  return (
    <Tile
      name="Note"
      area="var(--color-lav-400)"
      icon={<PenLine />}
      index={6}
      span={span}
    >
      {closed ? (
        <>
          <p className="motion-arrive text-[15px] font-light">
            {review.decision}
          </p>
          <span className="motion-pop inline-flex items-center gap-1 self-start rounded-full border border-current bg-state-good/10 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-state-good uppercase">
            <Check className="motion-draw size-3" strokeWidth={3} /> SAVED
          </span>
        </>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Next week…"
            rows={2}
            className="min-h-[50px] w-full flex-1 resize-none rounded-[9px] border border-lift/[0.09] bg-lift/[0.04] p-2.5 text-[14px] outline-none placeholder:text-ink-500 focus:border-lav-400 focus:shadow-[0_0_16px_-6px_var(--system-shine)]"
          />
          <div className="flex items-center justify-end gap-3">
            {state === 'failed' ? (
              <span className="motion-pop rounded-full border border-current bg-state-danger/10 px-2 py-0.5 font-mono text-[9.5px] tracking-[0.12em] text-state-danger uppercase">
                NOT SAVED
              </span>
            ) : null}
            <button
              type="button"
              onClick={press}
              disabled={text.trim() === ''}
              className="motion-press inline-flex items-center gap-1.5 rounded-full border border-lav-400 bg-lav-400/20 px-3.5 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase transition hover:shadow-[0_0_18px_-4px_var(--system-shine)] disabled:opacity-40"
            >
              {state === 'saving' ? (
                <>
                  <LoaderCircle className="save-spinner size-3" /> saving…
                </>
              ) : (
                'CLOSE WEEK'
              )}
            </button>
          </div>
        </>
      )}
    </Tile>
  )
}
