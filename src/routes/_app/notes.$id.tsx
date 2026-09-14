import { useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ArrowLeft, PenLine, Trash2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { NoteView } from '@/components/notes/NoteView'
import { joinNote, splitNote } from '@/lib/note-text'

export const Route = createFileRoute('/_app/notes/$id')({
  component: NotePage,
})

const SAVE_AFTER_MS = 700

/* One note, readable. A note long enough to have sections — a purchase list, a
   technique — needs a page of its own, not a row that expands.

   Editing saves itself, the way Notes does: a pause in typing writes the note,
   and the page says when it last did. There is no Save button to forget. A
   first line left empty is not saved, because a note without a title cannot be
   found again, and the page says that instead. */
function NotePage() {
  const { id } = Route.useParams()
  const noteId = id as Id<'notes'>
  const note = useQuery(api.notes.get, { noteId })
  const update = useMutation(api.notes.update)
  const remove = useMutation(api.notes.remove)
  const navigate = useNavigate()

  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'saved' | 'saving' | 'untitled' | null>(
    null,
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /* The save waiting for a pause in typing. Run, not dropped, when the pause
     never comes — Done, or leaving the page mid-sentence — so the last words
     typed are never the ones lost. */
  const pending = useRef<(() => void) | null>(null)

  function flush() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current?.()
    pending.current = null
  }

  /* Refs only, so no dependencies: this runs the pending save on unmount. */
  useEffect(() => flush, [])

  if (note === undefined) {
    return (
      <div className="glass flex flex-col gap-3 rounded-[22px] p-6" aria-hidden>
        <div className="h-6 w-2/5 rounded-full bg-white/[0.06]" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-3/5 rounded-full bg-white/[0.04]" />
        ))}
      </div>
    )
  }

  if (note === null) {
    return (
      <div className="glass rounded-[22px] p-6">
        <p className="text-[13px] text-ink-500">
          This note does not exist — it may have been deleted.
        </p>
        <Link
          to="/notes"
          className="mt-3 inline-block text-[13px] text-foreground"
        >
          Back to notes
        </Link>
      </div>
    )
  }

  function change(next: string) {
    setText(next)
    if (timer.current) clearTimeout(timer.current)
    const { title, body } = splitNote(next)
    if (title.length === 0) {
      pending.current = null
      setStatus('untitled')
      return
    }
    setStatus('saving')
    pending.current = () => {
      void update({ noteId, title, body }).then(() => setStatus('saved'))
    }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_AFTER_MS)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          to="/notes"
          className="motion-press flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] text-ink-500 hover:bg-white/[0.05] hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Notes
        </Link>
        <span className="ml-auto text-[11.5px] text-ink-600">
          {status === 'saving'
            ? 'saving…'
            : status === 'saved'
              ? 'saved'
              : status === 'untitled'
                ? 'not saved — the first line is the title'
                : null}
        </span>
        <button
          type="button"
          onClick={() => {
            if (editing) {
              flush()
              setEditing(false)
            } else {
              setText(joinNote(note.title, note.body))
              setEditing(true)
            }
          }}
          style={{ '--area': 'var(--area-knowledge)' } as React.CSSProperties}
          className={`motion-press flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] ring-1 ${
            editing
              ? 'bg-(--area)/16 text-(--area) ring-(--area)/40'
              : 'text-ink-400 ring-white/10 hover:text-foreground'
          }`}
        >
          <PenLine className="size-3.5" />
          {editing ? 'Done' : 'Edit'}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!confirmDelete) {
              setConfirmDelete(true)
              return
            }
            await remove({ noteId })
            void navigate({ to: '/notes' })
          }}
          onBlur={() => setConfirmDelete(false)}
          className={`motion-press flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] ring-1 ${
            confirmDelete
              ? 'bg-white/[0.08] text-foreground ring-white/25'
              : 'text-ink-600 ring-transparent hover:text-ink-300'
          }`}
        >
          <Trash2 className="size-3.5" />
          {confirmDelete ? 'Delete for good?' : 'Delete'}
        </button>
      </div>

      <article
        className={`glass rounded-[22px] px-6 py-5 transition-shadow duration-(--motion-base) ${
          editing ? 'ring-1 ring-area-knowledge/35' : ''
        }`}
      >
        {editing ? (
          <NoteEditor
            value={text}
            onChange={change}
            autoFocus
            onSubmit={() => {
              flush()
              setEditing(false)
            }}
          />
        ) : (
          <div className="motion-arrive">
            <h1 className="mb-4 text-[24px] leading-tight font-light text-foreground">
              {note.title}
            </h1>
            <NoteView body={note.body} />
          </div>
        )}
      </article>
    </div>
  )
}
