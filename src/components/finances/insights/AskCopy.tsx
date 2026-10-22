import { useEffect, useRef, useState } from 'react'

/* ⧉ COPY at the end of an answer's stamp row (22 Oct, mockup
   design/treasury-mockup/copy-answer.html, his "go"). The press answers
   at once: ✓ COPIED in green with a pop and the card glows once, or
   ✕ NOT COPIED in red with a shake; back to ⧉ COPY after a moment.
   Nothing is saved. */

const BACK_MS = 1800

export function CopyPill({
  text,
  onCopied,
}: {
  text: () => string
  onCopied: () => void
}) {
  const [state, setState] = useState<'idle' | 'ok' | 'no'>('idle')
  /* Bumped on every press so the animation runs again on a second one. */
  const [n, setN] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    let ok = true
    try {
      await navigator.clipboard.writeText(text())
    } catch {
      ok = false
    }
    setState(ok ? 'ok' : 'no')
    setN((x) => x + 1)
    if (ok) onCopied()
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), BACK_MS)
  }

  return (
    <button
      key={n}
      type="button"
      data-testid="ask-copy"
      data-state={state}
      className={`ask-pill ask-copy ${state === 'idle' ? '' : state}`}
      onClick={() => void copy()}
    >
      {state === 'ok' ? '✓ COPIED' : state === 'no' ? '✕ NOT COPIED' : '⧉ COPY'}
    </button>
  )
}
