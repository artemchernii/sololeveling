/* A keycap. Shared by the top bar's ⌘K and the palette's footer so the two
   read as one vocabulary — the shortcut on the button and the shortcut inside
   the thing it opens should not be two different objects.

   Sans, not the mono label face: JetBrains Mono has no ⌘ (U+2318), so the
   glyph fell out to a fallback face at a different size and sat crooked and
   undersized beside its own K. Inter draws it. ↵ and esc lose nothing. */
export function Key({
  children,
  onAccent = false,
}: {
  children: React.ReactNode
  /** On the lavender Log button: the same cap, drawn in the button's own
      dark ink so it reads as part of it rather than a grey chip stuck on. */
  onAccent?: boolean
}) {
  const tone = onAccent
    ? 'border-lav-900/25 bg-lav-900/12 text-lav-900/80'
    : 'border-white/12 bg-white/[0.07] text-ink-400'
  return (
    <kbd
      className={`grid h-[19px] min-w-[19px] place-items-center rounded-[5px] border px-[6px] text-[11.5px] leading-none tracking-[0.07em] ${tone}`}
    >
      {children}
    </kbd>
  )
}
