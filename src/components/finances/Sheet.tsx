import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, X } from 'lucide-react'

/* The Treasury's one modal (27 Sep): a sheet from the bottom on a phone, a
   centred panel on a wide screen. `onBack` gives it a way back one step —
   his rule: discard and back never close everything, they return to where
   he came from. Escape does the same: back if there is a back, else close.
   `guard` (10 Oct, "accidentally close modal"): while something is being
   read or saved, the ✕, Escape and a click outside ask first. */
export type SheetGuard = { title: string; text: string }

export function Sheet({
  open,
  title,
  onClose,
  onBack,
  wide = false,
  children,
  footer,
  guard = null,
}: {
  open: boolean
  title: string
  onClose: () => void
  onBack?: () => void
  wide?: boolean
  children: ReactNode
  footer?: ReactNode
  guard?: SheetGuard | null
}) {
  const panel = useRef<HTMLDivElement>(null)
  const [asking, setAsking] = useState(false)
  const guarded = guard !== null
  useEffect(() => {
    if (!guarded || !open) setAsking(false)
  }, [guarded, open])
  const close = () => (guarded ? setAsking(true) : onClose())
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (asking) setAsking(false)
      else if (guarded) setAsking(true)
      else if (onBack) onBack()
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onBack, onClose, guarded, asking])
  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-sink/60 backdrop-blur-[3px] sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`motion-arrive relative flex max-h-[92vh] w-full flex-col transition-[max-width] duration-[var(--motion-linger)] ease-[var(--motion-ease)] overflow-hidden rounded-t-[22px] bg-popover ring-1 ring-lift/10 outline-none sm:rounded-[22px] ${
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
            onClick={close}
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
        {asking && guard ? (
          <div className="motion-land absolute inset-0 z-10 grid place-items-center bg-sink/70 p-4 backdrop-blur-[3px]">
            <div
              role="alertdialog"
              aria-label={guard.title}
              className="flex w-full max-w-[380px] flex-col gap-2.5 rounded-[18px] bg-popover p-[18px] ring-1 ring-lav-400/35"
            >
              <b className="text-[16px] font-normal">{guard.title}</b>
              <p className="text-[13px] leading-normal text-ink-400">
                {guard.text}
              </p>
              <div className="mt-1.5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAsking(false)
                    onClose()
                  }}
                  className="motion-press rounded-full px-4 py-2.5 font-mono text-[11px] tracking-[0.12em] text-ink-300 uppercase ring-1 ring-lift/14 ring-inset"
                >
                  close it
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setAsking(false)}
                  className="motion-press rounded-full bg-gradient-to-br from-lav-300 to-lav-400 px-5 py-2.5 font-mono text-[12px] tracking-[0.14em] text-background uppercase"
                >
                  keep it open
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
