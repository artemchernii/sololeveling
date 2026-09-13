import { Command } from 'cmdk'
import type { CSSProperties, Ref } from 'react'
import type { LucideIcon } from 'lucide-react'

/* The chrome both palettes wear: the scrim, the frosted box, the field with
   its icon, and the strip of keys along the bottom.

   Search and Log are two modals because their Enter keys do opposite things —
   one navigates, one writes a row you will be counting for a month — but they
   are one object to look at, and that part belongs in one file. The last bug
   in this area existed because a keycap was defined twice. */
export function PaletteShell({
  open,
  onOpenChange,
  label,
  icon: Icon,
  placeholder,
  value,
  onValueChange,
  onInputKeyDown,
  footer,
  children,
  ghost,
  inputRef,
  iconClassName = 'text-ink-500',
  panelStyle,
  fieldClassName = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: string
  icon: LucideIcon
  placeholder: string
  value: string
  onValueChange: (value: string) => void
  onInputKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  footer: React.ReactNode
  children: React.ReactNode
  /** The rest of a word the field is about to become, drawn in grey after
      what has been typed. */
  ghost?: string
  inputRef?: Ref<HTMLInputElement>
  iconClassName?: string
  /** Inline, so it wins over `.glass-modal`'s own border without depending on
      the order Tailwind emits two utilities in. */
  panelStyle?: CSSProperties
  fieldClassName?: string
}) {
  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={label}
      /* Both palettes filter their own rows: capture parses rather than
         matches, and search has to treat a leading slash differently from a
         word. cmdk's filter would fight both. */
      shouldFilter={false}
      /* The blur belongs on the overlay, not the panel. `.glass-modal` already
         asks to blur what is behind it — but behind it was a flat 60% black
         sheet, so it was faithfully blurring nothing and reading as plain
         transparency. Dim less, blur the page itself, and the panel has
         something to sit on.

         `outline-none` is on the content because Radix focuses this element
         when the dialog opens, and the browser's default ring traces the
         square content box just outside the panel's rounded corners. The input
         autofocuses, so nothing is lost by removing it. */
      overlayClassName="glass-scrim fixed inset-0 z-40"
      contentClassName="fixed top-[18vh] left-1/2 z-50 w-[min(640px,92vw)] -translate-x-1/2 outline-none"
    >
      {/* overflow-hidden so the footer's tint stops at the rounded corner: the
          regions run edge to edge. */}
      <div
        style={panelStyle}
        className="glass-modal overflow-hidden rounded-[22px] transition-[border-color] duration-(--motion-base) ease-(--motion-ease)"
      >
        <div
          className={`flex items-center gap-3 px-5 transition-colors duration-(--motion-base) ease-(--motion-ease) ${fieldClassName}`}
        >
          <Icon
            className={`size-5 shrink-0 transition-colors duration-(--motion-base) ${iconClassName}`}
            aria-hidden
          />
          <div className="relative w-full">
            {/* The completion sits under the field, in the same face and
                size, behind an invisible copy of what has been typed — so the
                grey letters start exactly where the caret is. */}
            {ghost ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-[18px] whitespace-pre"
              >
                <span className="invisible">{value}</span>
                <span className="text-ink-600">{ghost}</span>
              </span>
            ) : null}
            <Command.Input
              ref={inputRef}
              autoFocus
              value={value}
              onValueChange={onValueChange}
              onKeyDown={onInputKeyDown}
              placeholder={placeholder}
              className="relative w-full bg-transparent py-[18px] text-[18px] text-foreground outline-none placeholder:text-ink-600"
            />
          </div>
        </div>

        {/* cmdk handles Enter on its root and prevents the default, so a
            focused button inside the body — a chip, a picker option — never
            received the click Enter means. Stopped here, for buttons only:
            list items are not buttons, and still get cmdk's selection. */}
        <div
          className="border-t border-white/[0.07]"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target instanceof HTMLButtonElement) {
              e.stopPropagation()
            }
          }}
        >
          {children}
        </div>

        <div className="flex items-center gap-4 border-t border-white/[0.07] bg-black/20 px-5 py-2.5 text-[11px] text-ink-500">
          {footer}
        </div>
      </div>
    </Command.Dialog>
  )
}

/** One key and what it does, for the footer strip. */
export function Hint({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={`flex items-center gap-[7px] ${className ?? ''}`}>
      {children}
    </span>
  )
}
