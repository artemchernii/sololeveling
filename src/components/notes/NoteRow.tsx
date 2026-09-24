import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Paperclip,
  Trash2,
} from 'lucide-react'

import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { wasEdited, whenLabel } from '@/lib/note-meta'

type Kind = Doc<'notes'>['kind']
export type NoteListRow = FunctionReturnType<typeof api.notes.list>[number]

export const KIND_LABEL: Record<Kind, string> = {
  note: 'Note',
  idea: 'Idea',
  book: 'Book',
  reference: 'Reference',
}

/** A kind's colour as `--kind`, for `bg-(--kind)/16` and friends (tokens.css 9). */
export function kindVars(kind: Kind): CSSProperties {
  return { '--kind': `var(--kind-${kind})` } as CSSProperties
}

/* One note in the list (24 Sep). Artem: "I can't really delete notes from
   the list … hard to distinguish notes type by color … bulk delete, or
   archive."

   So a row is the note's kind in its own colour, when it was written and
   edited, what is attached — and archive and delete, always shown (24 Sep:
   hidden until hover, they were hard to find). Delete asks once, in place, the way the note's own page does. In
   Select mode the row is a checkbox and nothing else. */
export function NoteRow({
  note,
  now,
  archivedView,
  selecting,
  checked,
  onToggle,
  onArchive,
  onDelete,
}: {
  note: NoteListRow
  now: number
  archivedView: boolean
  selecting: boolean
  checked: boolean
  onToggle: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const edited = wasEdited(note._creationTime, note.updatedAt)

  const meta = (
    <>
      <span className="block truncate text-[14px] text-foreground">
        {note.title}
      </span>
      <span className="mt-0.5 flex min-w-0 items-center gap-2 truncate text-[11.5px] text-ink-500">
        <span className="font-medium text-(--kind)">
          {KIND_LABEL[note.kind]}
        </span>
        <span className="text-ink-700">·</span>
        <span>{whenLabel(note._creationTime, now)}</span>
        {edited && note.updatedAt !== undefined ? (
          <>
            <span className="text-ink-700">·</span>
            <span>edited {whenLabel(note.updatedAt, now)}</span>
          </>
        ) : null}
        {note.images > 0 ? (
          <span className="flex items-center gap-1">
            <ImageIcon className="size-3 text-ink-600" />
            {note.images}
          </span>
        ) : null}
        {note.files > 0 ? (
          <span className="flex items-center gap-1">
            <Paperclip className="size-3 text-ink-600" />
            {note.files}
          </span>
        ) : null}
      </span>
    </>
  )

  if (selecting) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={onToggle}
        style={kindVars(note.kind)}
        /* The row itself never moves (24 Sep). It used to carry
           motion-press, which shrank the whole 900px row to 97% under the
           pointer — and transition-colors overrode its easing, so it
           snapped: a jolt of ~14px at each edge on every tick, with the
           checkbox sliding out from under the finger. The press now lives
           on the box, which is the thing being ticked. */
        className={`group/check flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left transition-colors ${
          checked ? 'bg-(--kind)/10' : 'hover:bg-lift/[0.04]'
        }`}
      >
        <span
          className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] ring-1 transition-[background-color,box-shadow,scale] duration-(--motion-fast) group-active/check:scale-90 ${
            checked
              ? 'bg-(--kind) text-background ring-(--kind)'
              : 'ring-lift/25 group-hover/check:ring-lift/40'
          }`}
        >
          {checked ? <Check className="motion-pop size-3" /> : null}
        </span>
        <span className="min-w-0 flex-1">{meta}</span>
      </button>
    )
  }

  const action =
    'motion-press grid size-8 shrink-0 place-items-center rounded-[9px] text-ink-600 transition-colors hover:bg-lift/[0.06]'

  return (
    <div
      style={kindVars(note.kind)}
      className="group flex items-center gap-1 rounded-[14px] pr-2 hover:bg-lift/[0.04]"
      onMouseLeave={() => setConfirming(false)}
    >
      <Link
        to="/notes/$id"
        params={{ id: note._id }}
        className="motion-press flex min-w-0 flex-1 items-center gap-3 py-3 pl-3.5"
      >
        <span className="size-2 shrink-0 rounded-full bg-(--kind)" />
        <span className="min-w-0 flex-1">{meta}</span>
      </Link>

      {confirming ? (
        <button
          type="button"
          autoFocus
          onClick={onDelete}
          onBlur={() => setConfirming(false)}
          className="motion-arrive shrink-0 rounded-full bg-state-danger/15 px-3 py-1 text-[12px] text-state-danger ring-1 ring-state-danger/40"
        >
          Delete for good?
        </button>
      ) : (
        <>
          <button
            type="button"
            aria-label={archivedView ? 'Unarchive' : 'Archive'}
            title={archivedView ? 'Unarchive' : 'Archive'}
            onClick={onArchive}
            className={`${action} hover:text-ink-200`}
          >
            {archivedView ? (
              <ArchiveRestore className="size-4" />
            ) : (
              <Archive className="size-4" />
            )}
          </button>
          <button
            type="button"
            aria-label="Delete"
            title="Delete"
            onClick={() => setConfirming(true)}
            className={`${action} hover:text-state-danger`}
          >
            <Trash2 className="size-4" />
          </button>
        </>
      )}
      <ChevronRight className="size-4 shrink-0 text-ink-700 transition-transform duration-(--motion-fast) group-hover:translate-x-0.5 group-hover:text-ink-400" />
    </div>
  )
}
