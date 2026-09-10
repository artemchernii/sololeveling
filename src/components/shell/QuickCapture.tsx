import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useMutation } from 'convex/react'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { CAPTURE_HINTS, parseCapture } from '@/lib/capture-parser'
import { Key } from './Key'

/* PLAN.md §3: three seconds, no form. The palette parses as you type and shows
   what it is about to write, so Enter is a confirmation rather than a gamble.

   Deliberately not a form with fields: every control added here is paid for on
   every capture, forever, and capture is the thing this app has to be fastest
   at. Area is inferred from the verb and corrected later on the badge.

   Three regions, edge to edge, in the order you read them: the field, what the
   field means, and the keys. The caps header that used to sit above the field
   is gone — it made the box read as a form, and the field is the top edge in
   every palette worth copying. */

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
      /* The blur belongs on the overlay, not the panel. `.glass-modal` already
         asks to blur what is behind it — but behind it was a flat 60% black sheet,
         so it was faithfully blurring nothing and reading as plain
         transparency. Dim less, blur the page itself, and the panel has
         something to sit on.

         `outline-none` is on the content because Radix focuses this element
         when the dialog opens, and the browser's default ring traces the
         square content box just outside the panel's rounded corners. The input
         autofocuses, so nothing is lost by removing it. */
      overlayClassName="glass-scrim fixed inset-0 z-40"
      contentClassName="fixed left-1/2 top-[18vh] z-50 w-[min(640px,92vw)] -translate-x-1/2 outline-none"
    >
      {/* overflow-hidden so the footer's tint stops at the rounded corner: the
          regions run edge to edge now, where the old panel padded them in. */}
      <div className="glass-modal overflow-hidden rounded-[22px]">
        <div className="flex items-center gap-3 px-5">
          <Plus className="size-5 shrink-0 text-ink-500" aria-hidden />
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
            placeholder="What happened?"
            className="w-full bg-transparent py-[18px] text-[18px] text-foreground outline-none placeholder:text-ink-600"
          />
        </div>

        <div className="border-t border-white/[0.07] px-5 py-3.5">
          {input.trim().length === 0 ? (
            /* A list, not a wrapped mono row. This is the only documentation
               the grammar has — the verb must be typed exactly and nothing
               completes it — so it is worth a line each, with the unit said
               out loud beside it. */
            <ul className="space-y-[7px]">
              {CAPTURE_HINTS.map(({ example, hint }) => (
                <li key={example} className="flex items-baseline gap-3">
                  <span className="w-[176px] shrink-0 font-mono text-[12px] text-ink-300">
                    {example}
                  </span>
                  <span className="text-[12.5px] text-ink-600">{hint}</span>
                </li>
              ))}
            </ul>
          ) : result.ok ? (
            <div className="flex items-baseline gap-2.5 text-[13px]">
              <span className="label-caps">{result.log.area}</span>
              <span className="text-ink-200">{result.summary}</span>
            </div>
          ) : (
            <div className="text-[13px] text-ink-500">{result.message}</div>
          )}
          {error ? (
            <div className="mt-1.5 text-[13px] text-ink-400">{error}</div>
          ) : null}
        </div>

        {/* One place for the keys. They were in two before: a caps label above
            the field and a hint buried in the confirmation row. */}
        <div className="flex items-center border-t border-white/[0.07] bg-black/20 px-5 py-2.5">
          <span className="flex items-center gap-[7px] text-[11px] text-ink-500">
            <Key>↵</Key>
            log it
          </span>
          <span className="ml-auto flex items-center gap-[7px] text-[11px] text-ink-500">
            <Key>esc</Key>
            close
          </span>
        </div>
      </div>
    </Command.Dialog>
  )
}
