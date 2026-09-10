import { Command } from 'cmdk'
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
      <div className="glass-modal overflow-hidden rounded-[22px]">
        <div className="flex items-center gap-3 px-5">
          <Icon className="size-5 shrink-0 text-ink-500" aria-hidden />
          <Command.Input
            autoFocus
            value={value}
            onValueChange={onValueChange}
            onKeyDown={onInputKeyDown}
            placeholder={placeholder}
            className="w-full bg-transparent py-[18px] text-[18px] text-foreground outline-none placeholder:text-ink-600"
          />
        </div>

        <div className="border-t border-white/[0.07]">{children}</div>

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
