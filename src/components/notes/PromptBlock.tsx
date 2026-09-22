import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

/* A pasted prompt, and the one thing you want to do with it (R4).

   A prompt exists to be copied back out, so the copy is one click and the
   text is shown exactly as it was pasted — `whitespace-pre` rather than
   `pre-wrap`, because a prompt's indentation is part of it and re-wrapping
   would quietly rewrite what you then paste elsewhere. Long lines scroll.

   The button says "Copied" for a moment afterwards: a copy leaves no trace on
   screen, so without it you press twice to be sure. */
export function PromptBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setFailed(false)
      setCopied(true)
      return
    } catch {
      /* Falls through. The Clipboard API is refused in more places than it
         looks — a webview, an embedded pane, a window that lost focus — and
         "your prompt did not copy" is a bad answer when there is a second
         way that works. */
    }

    /* The older way: a hidden field, selected, copied, removed. Deprecated
       and still the one that works where the API above is blocked. */
    const carrier = document.createElement('textarea')
    carrier.value = text
    carrier.setAttribute('readonly', '')
    carrier.style.position = 'fixed'
    carrier.style.top = '-1000px'
    carrier.style.opacity = '0'
    document.body.appendChild(carrier)
    try {
      carrier.select()
      const done = document.execCommand('copy')
      setFailed(!done)
      setCopied(done)
    } catch {
      /* Both refused. Say so rather than showing a tick for something that
         did not happen — a copy leaves no trace, so a false tick is worse
         than no button. */
      setFailed(true)
    } finally {
      carrier.remove()
    }
  }

  return (
    <div className="group relative my-1.5 rounded-[10px] bg-sink/40 ring-1 ring-lift/[0.06] ring-inset">
      <pre className="overflow-x-auto px-3.5 py-3 pr-12 font-mono text-[12.5px] leading-[1.55] whitespace-pre text-ink-200">
        {text}
      </pre>

      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : 'Copy this prompt'}
        className="motion-press absolute top-2 right-2 flex h-7 items-center gap-1.5 rounded-[7px] px-2 font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase opacity-0 transition-colors group-hover:opacity-100 hover:bg-lift/10 hover:text-ink-300 focus-visible:opacity-100"
      >
        {copied ? (
          <>
            <Check className="size-3.5 text-state-good" />
            copied
          </>
        ) : failed ? (
          <>
            <Copy className="size-3.5" />
            press ⌘C
          </>
        ) : (
          <>
            <Copy className="size-3.5" />
            copy
          </>
        )}
      </button>
    </div>
  )
}
