import { useState } from 'react'
import { useMutation } from 'convex/react'
import { CornerDownLeft } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { areaVars } from '@/lib/areas'
import { SaveGlyph, useSave } from '@/components/Saving'
import { whenLabel } from '@/lib/format'

/* A CEFR level is words, not a scale — A2 is not worse than B1, it is
   earlier. So this never draws a bar, a percentage, or a colour that grades
   it; the only colour it wears is the language's own area hue, the same one
   every other card on this language uses.

   Its shape is EditableMinutes' (ProjectStats.tsx): press the value, type,
   Enter saves, Escape cancels — no blur handler. R6b-a's review found a
   blur-discard that silently threw away an in-progress edit.

   Nothing is seeded, so a language with nothing recorded shows an em dash and
   a one-line prompt, never a placeholder level: "zero is a claim, and absence
   is not" (StateStrip.tsx).

   Task 4's `languageLevels` and Task 3's `cefr_level:<slug>` key are read and
   written here as plain props — this component does not query for them, and
   the panel that will host it (Task 6) passes the current value down. */
export function LevelEditor({
  slug,
  label,
  textValue,
  recordedAt,
}: {
  slug: string
  label: string
  textValue: string | null
  recordedAt: number | null
}) {
  const record = useMutation(api.state.record)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(textValue ?? '')
  const saving = useSave()

  function save() {
    const trimmed = text.trim()
    /* An empty string is not a level — state.record refuses a snapshot with
       neither a value nor a text value anyway, so this just keeps a pointless
       round trip from happening. */
    if (trimmed.length === 0) {
      setText(textValue ?? '')
      setEditing(false)
      return
    }
    if (trimmed === textValue) {
      setEditing(false)
      return
    }
    void saving
      .run(() =>
        /* Append-only: a new level supersedes the old one, it does not edit
           it. currentState()/languageLevels() read the latest row per key. */
        record({
          area: slug,
          key: `cefr_level:${slug}`,
          textValue: trimmed,
          recordedAt: Date.now(),
        }),
      )
      .then(() => setEditing(false))
  }

  return (
    <div style={areaVars(slug)} className="flex flex-col gap-1">
      <span className="label-caps">{label}</span>

      {editing ? (
        <span className="flex items-center gap-1.5">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') {
                setText(textValue ?? '')
                setEditing(false)
              }
            }}
            placeholder="B1"
            aria-label={`Record ${label}'s level`}
            className="w-16 rounded-[6px] border border-(--area)/50 bg-sink/20 px-2 py-0.5 font-mono text-[19px] font-light text-foreground outline-none"
          />
          <button
            type="button"
            onClick={save}
            aria-label="Save level"
            className="motion-press grid size-6 shrink-0 place-items-center rounded-[6px] bg-(--area)/15 text-(--area) ring-1 ring-(--area)/50 ring-inset"
          >
            <SaveGlyph
              status={saving.status}
              onSettled={saving.settle}
              idle={<CornerDownLeft className="size-3" />}
            />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            setText(textValue ?? '')
            setEditing(true)
          }}
          title={`Record ${label}'s level`}
          className="-mx-1 flex flex-wrap items-baseline gap-x-2 rounded-[5px] px-1 text-left transition-colors hover:bg-lift/10"
        >
          <span className="text-[28px] font-light text-foreground">
            {textValue ?? '—'}
          </span>
          <span className="font-mono text-[11px] text-ink-600">
            {recordedAt === null
              ? 'not recorded yet'
              : `as of ${whenLabel(recordedAt)}`}
          </span>
        </button>
      )}
    </div>
  )
}
