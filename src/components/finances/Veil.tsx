import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Eye, EyeOff } from 'lucide-react'

import { useVeil } from '@/lib/veil'

/* A number he holds, blurred until the eye is pressed (src/lib/veil.ts).
   The blur is for the person beside him or a shared screen; a screen
   reader is told it is hidden rather than read the figure out. */
export function Veiled({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const { shown } = useVeil()
  if (shown) return <span className={className}>{children}</span>
  return (
    <span className={`relative inline-block ${className}`}>
      <span aria-hidden className="pointer-events-none blur-[9px] select-none">
        {children}
      </span>
      <span className="sr-only">hidden — press show to see it</span>
    </span>
  )
}

/* The one switch — several buttons, one state. The one that lives as long
   as the page (the hero's, the Today cell's) is `hideOnLeave`: leaving the
   page hides again, so every visit starts hidden. A tab's own button does
   not, or switching tabs would hide what he just chose to see. */
export function VeilToggle({
  className = '',
  hideOnLeave = false,
}: {
  className?: string
  hideOnLeave?: boolean
}) {
  const { shown, toggle, hide } = useVeil()
  useEffect(() => (hideOnLeave ? hide : undefined), [hideOnLeave])
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={shown}
      aria-label={shown ? 'Hide amounts' : 'Show amounts'}
      className={`motion-press inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10.5px] tracking-[0.12em] uppercase ring-1 transition-colors ring-inset ${
        shown
          ? 'text-ink-300 ring-lift/15 hover:text-foreground'
          : 'bg-lav-400/12 text-foreground ring-lav-400/40 hover:bg-lav-400/20'
      } ${className}`}
    >
      {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      {shown ? 'hide' : 'show'}
    </button>
  )
}
