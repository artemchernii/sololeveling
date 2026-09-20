import type { ReactNode } from 'react'

import { AttachmentTray } from '@/components/attachments/Attachments'
import { useAttachments } from '@/components/attachments/useAttachments'
import type { AttachmentParent } from '@/components/attachments/useAttachments'
import { SaveLabel } from '@/components/Saving'
import type { SaveStatus } from '@/components/Saving'
import { areaVars } from '@/lib/areas'
import type { Area } from '@/lib/capture-parser'

/* What a task or a note opens into (20 Sep).

   Artem on the task panel: "this prompt section need borders, ability to
   change task title, cancel button is missing" — and on ⌘V, "I really like
   when input is focused and I press CMD+V leads to paste screenshot. Like we
   do here in chat."

   All four are the same panel, so there is one panel. It is the shape the
   task row already had, made into an edge you can see and given the two
   controls it was missing; the note row now opens into the very same thing,
   which is why the Notes card stopped being a list of links that threw you
   out of the project you were reading.

   The whole panel is the drop and paste target — that is the fix for ⌘V. The
   handler used to sit on the clip row, a sibling of the box you type in, so
   the one gesture he wanted was the one that could not reach it.

   Keys, per his standing rule that Enter does the obvious thing and there is
   a button too: Enter in the title saves, ⌘/Ctrl+Enter in the body saves,
   Escape anywhere gives up and shuts the panel. */
export function EditorPanel({
  parent,
  area,
  title,
  onTitle,
  titlePlaceholder,
  body,
  onBody,
  bodyPlaceholder,
  bodyRows = 3,
  dirty,
  status,
  onSettled,
  onSave,
  onCancel,
  corner,
  children,
}: {
  parent: AttachmentParent
  /* The kind of thing this is, worn as colour (§3d). A note is always
     `knowledge`; a task wears its own. Undefined draws no edge at all —
     an unfiled thing is not a kind, so it does not get a colour. */
  area?: Area
  title: string
  onTitle: (next: string) => void
  titlePlaceholder: string
  body: string
  onBody: (next: string) => void
  bodyPlaceholder: string
  bodyRows?: number
  dirty: boolean
  status: SaveStatus
  onSettled: () => void
  onSave: () => void
  onCancel: () => void
  /* Top-right of the panel: the note's door to its own page. */
  corner?: ReactNode
  /* Controls that belong to this kind of thing only — a task's due date. */
  children?: ReactNode
}) {
  const att = useAttachments(parent)
  const canSave = dirty && title.trim().length > 0

  return (
    <div
      {...att.zone}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onCancel()
        }
      }}
      style={area ? areaVars(area) : undefined}
      className={`motion-arrive relative flex flex-col gap-3 overflow-hidden rounded-[14px] border p-3.5 pl-4 transition-colors ${
        att.over
          ? 'border-lav-500/50 bg-lav-900/25'
          : 'border-lift/10 bg-sink/25'
      }`}
    >
      {/* The panel wears the kind of thing it holds: a 3px edge and a wash,
          the same two moves the focus card uses. Artem, 20 Sep: "feels like
          lack of color and motion (things i keep asking for)". The edge
          grows in rather than appearing, so opening a row is a thing that
          happens. */}
      {area ? (
        <>
          <span className="motion-edge pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-(--area)" />
          <span className="pointer-events-none absolute inset-0 bg-(--area)/[0.05]" />
        </>
      ) : null}

      {/* A dropped file lands on the whole panel, so the whole panel says so
          rather than leaving you to aim at the clip. */}
      {att.over ? (
        <span className="label-caps pointer-events-none absolute inset-x-0 top-2 z-10 text-center text-lav-300">
          drop to attach
        </span>
      ) : null}

      {/* Title, then a rule, then the body. They were two boxes of the same
          grey stacked with a gap, and he could not tell where one ended:
          "title and text area need to be divided somehow". */}
      <div className="relative flex items-start gap-2 border-b border-lift/10 pb-2.5">
        <input
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (canSave) onSave()
            }
          }}
          placeholder={titlePlaceholder}
          aria-label={titlePlaceholder}
          className="min-w-0 flex-1 rounded-[8px] border border-transparent bg-transparent px-1.5 py-1 text-[15px] font-light tracking-[0.01em] text-foreground outline-none transition-colors placeholder:text-ink-700 hover:border-lift/10 focus:border-lav-500/50 focus:bg-sink/40"
        />
        {corner}
      </div>

      <textarea
        value={body}
        onChange={(e) => onBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            if (canSave) onSave()
          }
        }}
        rows={bodyRows}
        placeholder={bodyPlaceholder}
        className="relative w-full resize-y rounded-[8px] border border-transparent bg-transparent px-1.5 py-1 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-200 outline-none transition-colors placeholder:text-ink-700 hover:border-lift/10 focus:border-lav-500/50 focus:bg-sink/40"
      />

      <div className="relative">{children}</div>

      <div className="relative">
        <AttachmentTray att={att} compact />
      </div>

      {/* Save is always here, dim until there is something to save, so the
          panel never changes shape under your hand. Cancel is always here
          because until now there was no way out but saving. */}
      <div className="relative flex items-center gap-1 border-t border-lift/[0.06] pt-2.5">
        <button
          type="button"
          disabled={!canSave && status === 'idle'}
          onClick={onSave}
          className={`motion-press rounded-[8px] border px-3 py-1 text-[12px] transition-colors ${
            canSave || status !== 'idle'
              ? 'border-lav-500/60 bg-lav-900/40 text-lav-200 hover:bg-lav-800'
              : 'border-lift/10 text-ink-700'
          }`}
        >
          <SaveLabel status={status} onSettled={onSettled}>
            Save
          </SaveLabel>
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="motion-press rounded-[8px] px-3 py-1 text-[12px] text-ink-500 transition-colors hover:bg-lift/5 hover:text-ink-200"
        >
          {dirty ? 'Discard' : 'Close'}
        </button>
        <span className="ml-auto hidden font-mono text-[10.5px] text-ink-700 sm:block">
          ⌘V a screenshot · esc to close
        </span>
      </div>
    </div>
  )
}
