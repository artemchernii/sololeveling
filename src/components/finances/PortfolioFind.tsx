import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

import { PILL_QUIET } from '@/components/finances/bits'
import type { Order } from '@/lib/owned'

/* Find and sort on the Portfolio list (17 Oct, mockup find.html): Artem
   holds 20+ positions. A field by name or ticker over the rows already
   loaded — nothing new is read — and the sort kept on this device. */

const KEPT = 'portfolio-sort'
const ORDERS: ReadonlyArray<Order> = ['worth', 'up', 'down', 'name']

export const keptOrder = (): Order => {
  try {
    const got = localStorage.getItem(KEPT)
    return ORDERS.find((o) => o === got) ?? 'worth'
  } catch {
    return 'worth'
  }
}

export const keepOrder = (order: Order) => {
  try {
    localStorage.setItem(KEPT, order)
  } catch {
    /* A private window keeps nothing: the sort still turns. */
  }
}

/** The field; "/" anywhere outside a field jumps to it, Esc clears. */
export function FindField({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const jump = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      )
        return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener('keydown', jump)
    return () => window.removeEventListener('keydown', jump)
  }, [])
  return (
    <label className="group flex h-10 items-center gap-2 rounded-[12px] bg-lift/[0.045] pr-1.5 pl-3 ring-1 ring-lift/10 transition-[box-shadow,background-color] duration-300 ring-inset focus-within:bg-lav-400/[0.06] focus-within:shadow-[0_0_24px_-12px_var(--color-lav-400)] focus-within:ring-lav-400/55">
      <Search className="size-3.5 shrink-0 text-ink-500 group-focus-within:text-lav-300" />
      <input
        ref={ref}
        type="search"
        aria-label="name or ticker"
        placeholder="name or ticker"
        value={value}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onChange('')
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:font-mono placeholder:text-[10.5px] placeholder:tracking-[0.14em] placeholder:text-ink-500 placeholder:uppercase [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="clear name or ticker"
          onClick={() => {
            onChange('')
            ref.current?.focus()
          }}
          className="motion-press grid size-7 place-items-center rounded-[8px] text-ink-400 hover:bg-lift/[0.08] hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      ) : (
        <kbd className="hidden rounded-[6px] px-[7px] py-[2px] font-mono text-[10.5px] text-ink-500 ring-1 ring-lift/14 ring-inset sm:block">
          /
        </kbd>
      )}
    </label>
  )
}

/** Nothing matches: the count, what was typed, and one way back. */
export function NoneFound({
  typed,
  onClear,
}: {
  typed: string
  onClear: () => void
}) {
  return (
    <div className="motion-arrive flex flex-wrap items-center justify-center gap-2 py-6">
      <span className="rounded-full bg-state-warn/14 px-2.5 py-[5px] font-mono text-[10.5px] tracking-[0.12em] text-state-warn uppercase">
        0 found
      </span>
      <span className="max-w-[60vw] truncate rounded-full bg-lift/[0.06] px-2.5 py-[5px] font-mono text-[10.5px] tracking-[0.12em] text-ink-300 uppercase">
        “{typed.trim()}”
      </span>
      <button type="button" onClick={onClear} className={PILL_QUIET}>
        <X className="size-3" />
        clear
      </button>
    </div>
  )
}

/** The letters typed, lit in a name or a ticker. */
export function Lit({ text, typed }: { text: string; typed: string }) {
  const q = typed.trim().toLowerCase()
  const at = q ? text.toLowerCase().indexOf(q) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent text-lav-400 underline decoration-lav-400/50 underline-offset-[3px]">
        {text.slice(at, at + q.length)}
      </mark>
      {text.slice(at + q.length)}
    </>
  )
}
