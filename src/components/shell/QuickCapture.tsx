import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useMutation } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import { CAPTURE_VERBS, parseCapture } from '@/lib/capture-parser'

/* PLAN.md §3: three seconds, no form. The palette parses as you type and shows
   what it is about to write, so Enter is a confirmation rather than a gamble.
 
   Deliberately not a form with fields: every control added here is paid for on
   every capture, forever, and capture is the thing this app has to be fastest
   at. Area is inferred from the verb and corrected later on the badge. */

export function QuickCapture({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const createLog = useMutation(api.logs.create)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const result = parseCapture(input)

  async function submit() {
    if (!result.ok) {
      setError(result.message)
      return
    }
    await createLog({ ...result.log, occurredAt: Date.now() })
    setInput('')
    setError(null)
    onOpenChange(false)
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Log something"
      shouldFilter={false}
      /* The blur belongs on the overlay, not the panel. `.glass` already asks
         to blur what is behind it — but behind it was a flat 60% black sheet,
         so it was faithfully blurring nothing and reading as plain
         transparency. Dim less, blur the page itself, and the panel has
         something to sit on.

         `outline-none` is on the content because Radix focuses this element
         when the dialog opens, and the browser's default ring traces the
         square content box just outside the panel's rounded corners. The input
         autofocuses, so nothing is lost by removing it. */
      overlayClassName="fixed inset-0 z-40 bg-black/45 backdrop-blur-md"
      contentClassName="fixed left-1/2 top-[18vh] z-50 w-[min(560px,92vw)] -translate-x-1/2 outline-none"
    >
      <div className="glass rounded-[18px] p-2">
        <Command.Input
          autoFocus
          value={input}
          onValueChange={(v) => {
            setInput(v)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void submit()
            }
          }}
          placeholder="workout 60 · spend 48 groceries · pt 30 · weight 75.4 · note …"
          className="w-full bg-transparent px-3 py-3 text-[14px] text-foreground outline-none placeholder:text-ink-700"
        />

        <div className="border-t border-white/[0.07] px-3 py-2.5">
          {input.trim().length === 0 ? (
            <div className="label-caps">{CAPTURE_VERBS.join(' · ')}</div>
          ) : result.ok ? (
            <div className="flex items-baseline gap-2 text-[12.5px]">
              <span className="label-caps">{result.log.area}</span>
              <span className="text-ink-300">{result.summary}</span>
              <span className="label-caps ml-auto">↵ log it</span>
            </div>
          ) : (
            <div className="text-[12.5px] text-ink-500">{result.message}</div>
          )}
          {error ? (
            <div className="mt-1 text-[12.5px] text-ink-400">{error}</div>
          ) : null}
        </div>
      </div>
    </Command.Dialog>
  )
}
