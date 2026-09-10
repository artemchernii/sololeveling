/* A keycap. Shared by the top bar's ⌘K and the palette's footer so the two
   read as one vocabulary — the shortcut on the button and the shortcut inside
   the thing it opens should not be two different objects.

   Sans, not the mono label face: JetBrains Mono has no ⌘ (U+2318), so the
   glyph fell out to a fallback face at a different size and sat crooked and
   undersized beside its own K. Inter draws it. ↵ and esc lose nothing. */
export function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="grid h-[19px] min-w-[19px] place-items-center rounded-[5px] border border-white/12 bg-white/[0.07] px-[6px] text-[11.5px] leading-none tracking-[0.07em] text-ink-400">
      {children}
    </kbd>
  )
}
