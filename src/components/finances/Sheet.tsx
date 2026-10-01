import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, X } from 'lucide-react'

/* The Treasury's one modal (27 Sep): a sheet from the bottom on a phone, a
   centred panel on a wide screen. `onBack` gives it a way back one step —
   his rule: discard and back never close everything, they return to where
   he came from. Escape does the same: back if there is a back, else close. */
export function Sheet({
  open,
  title,
  onClose,
  onBack,
  wide = false,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  onBack?: () => void
  wide?: boolean
  children: ReactNode
  footer?: ReactNode
}) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (onBack) onBack()
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onBack, onClose])
  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-sink/60 backdrop-blur-[3px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`motion-arrive flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[22px] bg-popover ring-1 ring-lift/10 outline-none sm:rounded-[22px] ${
          wide ? 'sm:max-w-[920px]' : 'sm:max-w-[560px]'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-lift/[0.06] px-4 py-3.5 sm:px-5">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="motion-press inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10.5px] tracking-[0.12em] text-ink-300 uppercase ring-1 ring-lift/15 ring-inset hover:text-foreground"
            >
              <ChevronLeft className="size-3.5" />
              back
            </button>
          ) : null}
          <span className="system-title flex-1 truncate">[ {title} ]</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="motion-press grid size-8 place-items-center rounded-full text-ink-400 ring-1 ring-lift/12 ring-inset hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5 [&>*]:shrink-0">
          {children}
        </div>
        {footer ? (
          <div className="flex gap-2 border-t border-lift/[0.06] px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
