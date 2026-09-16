import { Command } from 'cmdk'
import type { CSSProperties, Ref } from 'react'
import { X } from 'lucide-react'
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
  onClear,
  iconKey,
  prefix,
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
  /** Empties the field. Shown only while there is something in it. */
  onClear?: () => void
  /** Changes when the icon means something new — the + becoming gym — so it
      pops in rather than swapping silently. */
  iconKey?: string
  /** A word the line has turned into a badge — `todo` — with the field
      holding only what follows it. Backspace on an empty field hands the
      word back as text. */
  prefix?: { label: string; onRemove: () => void }
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
          <span
            key={iconKey}
            className="motion-pop grid shrink-0 place-items-center"
          >
            <Icon
              className={`size-5 shrink-0 transition-colors duration-(--motion-base) ${iconClassName}`}
              aria-hidden
            />
          </span>
          {prefix ? (
            <span className="motion-pop shrink-0 rounded-[6px] bg-lift/[0.09] px-2 py-1 font-mono text-[11px] tracking-[0.14em] text-ink-200 uppercase ring-1 ring-lift/10 ring-inset">
              {prefix.label}
            </span>
          ) : null}
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
              onKeyDown={(e) => {
                if (prefix && e.key === 'Backspace' && value.length === 0) {
                  e.preventDefault()
                  prefix.onRemove()
                  return
                }
                onInputKeyDown?.(e)
              }}
              placeholder={placeholder}
              className="relative w-full bg-transparent py-[18px] text-[18px] text-foreground outline-none placeholder:text-ink-600"
            />
          </div>
          {/* The way back to an empty line from anywhere — a recent taken, a
              verb chosen from the list — without deleting it a character at a
              time. Focus goes back to the field, ready to type. */}
          {onClear && (value.length > 0 || prefix) ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={(e) => {
                onClear()
                const field = e.currentTarget
                  .closest('[cmdk-root]')
                  ?.querySelector<HTMLInputElement>('[cmdk-input]')
                requestAnimationFrame(() => field?.focus())
              }}
              className="motion-press motion-arrive chip-focus grid size-7 shrink-0 place-items-center rounded-full text-ink-500 hover:bg-lift/10 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {/* cmdk handles keys on its root and prevents their defaults: Enter
            to select, the arrows and Home/End to move through the list. Inside
            the body that is wrong in two places, and both are stopped here
            before cmdk sees them.

            A field of its own — the note sheet, a chip's input — needs every
            key: Enter is a new line, the arrows move the caret. Escape still
            goes through, so the dialog closes from anywhere.

            A focused button needs Enter, or it never gets the click Enter
            means. List items are not buttons, and keep cmdk's selection. */}
        <div
          className="border-t border-lift/[0.07]"
          onKeyDown={(e) => {
            if (e.key === 'Escape') return
            const target = e.target
            const ownField =
              target instanceof HTMLTextAreaElement ||
              (target instanceof HTMLInputElement &&
                target.dataset.chipInput !== undefined)
            if (
              ownField ||
              (e.key === 'Enter' && target instanceof HTMLButtonElement)
            ) {
              e.stopPropagation()
            }
          }}
        >
          {children}
        </div>

        <div className="flex items-center gap-4 border-t border-lift/[0.07] bg-sink/20 px-5 py-2.5 text-[11px] text-ink-500">
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
