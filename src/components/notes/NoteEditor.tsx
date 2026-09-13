import { useLayoutEffect, useRef } from 'react'
import type { Ref } from 'react'

import { continueList, indentLine } from '@/lib/note-text'

/* Plain text that writes like Apple Notes: the first line is the title, a list
   carries itself on, Tab indents. The behaviour lives in lib/note-text.ts;
   this is only the textarea that applies it.

   It grows with what is written, up to a cap, and scrolls after that — a note
   can be long, and a fixed four-line box is the small input this replaced. */
export function NoteEditor({
  value,
  onChange,
  onSubmit,
  placeholder = 'Title\n\nWrite anything — lists carry on when you press Enter.',
  autoFocus = false,
  className = '',
  textareaRef,
  onEmptyBackspace,
}: {
  value: string
  onChange: (value: string) => void
  /** ⌘↵ / Ctrl+↵. Plain Enter is a new line, as it is in every notes app. */
  onSubmit?: () => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  textareaRef?: Ref<HTMLTextAreaElement>
  /** Backspace with nothing written — the Log sheet uses it to step back to
      the line, the way deleting past the start of a field would. */
  onEmptyBackspace?: () => void
}) {
  const own = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = own.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  function apply(next: { value: string; caret: number }) {
    onChange(next.value)
    requestAnimationFrame(() => {
      own.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  return (
    <textarea
      ref={(el) => {
        own.current = el
        if (typeof textareaRef === 'function') textareaRef(el)
        else if (textareaRef) textareaRef.current = el
      }}
      data-note-editor
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      spellCheck
      rows={6}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        const el = e.currentTarget
        if (e.key === 'Backspace' && value.length === 0 && onEmptyBackspace) {
          e.preventDefault()
          onEmptyBackspace()
          return
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          onSubmit?.()
          return
        }
        /* Only with a collapsed selection: Enter over a highlighted range
           should replace it, which is what the browser already does. */
        if (
          e.key === 'Enter' &&
          !e.shiftKey &&
          el.selectionStart === el.selectionEnd
        ) {
          const next = continueList(value, el.selectionStart)
          if (next) {
            e.preventDefault()
            apply(next)
          }
          return
        }
        if (e.key === 'Tab') {
          e.preventDefault()
          apply(indentLine(value, el.selectionStart, e.shiftKey))
        }
      }}
      className={`w-full resize-none bg-transparent text-[14.5px] leading-[1.6] text-foreground outline-none placeholder:whitespace-pre-line placeholder:text-ink-600 ${className}`}
    />
  )
}
