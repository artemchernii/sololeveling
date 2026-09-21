import type { ReactNode } from 'react'
import { CornerDownLeft } from 'lucide-react'

import { SaveGlyph } from '@/components/Saving'
import type { SaveStatus } from '@/components/Saving'

/* The one way into a card (20 Sep). Artem, at the task and note cards: "I see
   two stupid small input for simple one line string text. WTF IS THIS?"

   He was right. They were bare text with a placeholder, sitting on a hairline
   in a card with two thirds of it empty — nothing said you could type there,
   and nothing happened that you could see when you did.

   So: a real field. It has an edge, it fills the width it was given, it lights
   up in the accent when you are in it, and the ⏎ hint appears once there is
   something to send. The glyph runs spinner → tick on the way through, which
   is the same feedback the rest of the app uses and never showed. */
export function AddField({
  value,
  onChange,
  onSubmit,
  placeholder,
  status,
  onSettled,
  idle,
}: {
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  placeholder: string
  status: SaveStatus
  onSettled: () => void
  idle: ReactNode
}) {
  const ready = value.trim().length > 0

  return (
    <div className="group/add flex items-center gap-2.5 rounded-[12px] border border-lift/10 bg-sink/20 px-3 py-2.5 transition-colors focus-within:border-lav-500/60 focus-within:bg-lav-900/20 hover:border-lift/20">
      <SaveGlyph
        status={status}
        onSettled={onSettled}
        idle={idle}
        className="text-ink-600 transition-colors group-focus-within/add:text-lav-300"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit()
        }}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
      />
      {ready ? (
        <button
          type="button"
          onClick={onSubmit}
          aria-label="Add"
          className="motion-pop motion-press grid size-6 shrink-0 place-items-center rounded-[7px] bg-lav-900/70 text-lav-300 ring-1 ring-lav-500/50 ring-inset transition-colors hover:bg-lav-800"
        >
          <CornerDownLeft className="size-3" />
        </button>
      ) : null}
    </div>
  )
}
