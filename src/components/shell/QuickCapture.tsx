import { useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { Plus } from 'lucide-react'

import { Hint, PaletteShell } from './PaletteShell'
import { Key } from './Key'
import { api } from '../../../convex/_generated/api'
import { CAPTURE_HINTS, parseCapture } from '@/lib/capture-parser'

/* PLAN.md §3: three seconds, no form. The palette parses as you type and shows
   what it is about to write, so Enter is a confirmation rather than a gamble.

   Deliberately not a form with fields: every control added here is paid for on
   every capture, forever, and capture is the thing this app has to be fastest
   at. Area is inferred from the verb and corrected later on the badge.

   Reached three ways — the Log button, `/log` in search, and Enter on the
   first row of an empty search — but written in one place, with one parser. */
export function QuickCapture({
  open,
  onOpenChange,
  initialInput = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What `/log workout 60` typed for you before handing over. */
  initialInput?: string
}) {
  const [input, setInput] = useState(initialInput)
  const [error, setError] = useState<string | null>(null)
  const createLog = useMutation(api.logs.create)

  useEffect(() => {
    if (open) {
      setInput(initialInput)
      setError(null)
    }
  }, [open, initialInput])

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
    <PaletteShell
      open={open}
      onOpenChange={onOpenChange}
      label="Log"
      icon={Plus}
      placeholder="What happened?"
      value={input}
      onValueChange={(v) => {
        setInput(v)
        setError(null)
      }}
      onInputKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          void submit()
        }
      }}
      footer={
        <>
          <Hint>
            <Key>↵</Key>
            log it
          </Hint>
          <Hint className="ml-auto">
            <Key>esc</Key>
            close
          </Hint>
        </>
      }
    >
      <div className="px-5 py-3.5">
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
    </PaletteShell>
  )
}
