import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ArrowUpRight, ChevronRight, Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc, Id } from '../../../convex/_generated/dataModel'
import { AddField } from '@/components/AddField'
import { EditorPanel } from '@/components/EditorPanel'
import { useSave } from '@/components/Saving'
import { SkeletonRows } from '@/components/Skeleton'
import { agoLabel } from '@/lib/format'

/* The notes attached to a project (R3, rebuilt 20 Sep). Writing one here
   creates it already attached, and stays here: it used to open the note's own
   page, which threw you out of the project you were working in to look at an
   empty editor.

   Then reading one did the same thing. Artem: "Notes is bad now. Maybe it
   makes sense actually to open note page on click note in project page but
   its kinda boring haha." He was right twice over — every row was the title,
   the word NOTE and a relative time, so three notes looked like one note
   three times, and the only thing you could do with one was leave.

   So a note opens where a task opens, into the same panel: title, body,
   files, Save and Cancel. The arrow in its corner is the door to the note's
   own page, for when you actually mean to write rather than jot.

   `kind` is gone from the row. Every note is 'note' until something sets it
   otherwise, and a type you never chose, printed next to a note filed under a
   project that already says what it is for, is the noise he was reacting
   to. */
export function ProjectNotes({ projectId }: { projectId: Id<'projects'> }) {
  const notes = useQuery(api.notes.listByProject, { projectId })
  const create = useMutation(api.notes.create)
  const [title, setTitle] = useState('')
  const writing = useSave()

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0 || writing.busy) return
    await writing.run(() => create({ title: trimmed, projectId }))
    setTitle('')
  }

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
      <div className="flex items-baseline justify-between gap-3">
        <div className="label-caps">Notes</div>
        {notes !== undefined && notes.length > 0 ? (
          <span className="font-mono text-[11px] text-ink-700">
            {notes.length}
          </span>
        ) : null}
      </div>

      {notes === undefined ? (
        <SkeletonRows rows={3} />
      ) : notes.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing written down for this project yet.
        </p>
      ) : (
        <div className="flex flex-col">
          {notes.map((note) => (
            <NoteRow key={note._id} note={note} />
          ))}
        </div>
      )}

      <AddField
        value={title}
        onChange={setTitle}
        onSubmit={() => void add()}
        placeholder="A note on this project"
        status={writing.status}
        onSettled={writing.settle}
        idle={<Plus className="size-3.5" />}
      />
    </div>
  )
}

/* One note, shut and open. Shut, it carries the first line of what is in it
   — free, because the body is already on the row, and the one thing that
   makes three notes look like three different notes. */
function NoteRow({ note }: { note: Doc<'notes'> }) {
  const update = useMutation(api.notes.update)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const saving = useSave()

  const dirty = title.trim() !== note.title || body !== note.body
  const firstLine = note.body.trim().split('\n')[0] ?? ''

  function shut() {
    setTitle(note.title)
    setBody(note.body)
    setOpen(false)
  }

  return (
    <div className="border-b border-lift/[0.05] py-2.5 last:border-b-0">
      <button
        type="button"
        onClick={() => (open ? shut() : setOpen(true))}
        aria-expanded={open}
        className="group flex w-full items-start gap-1.5 text-left"
      >
        <ChevronRight
          className={`mt-1 size-3 shrink-0 text-ink-700 transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] text-foreground transition-colors group-hover:text-lav-300">
            {note.title}
          </span>
          {!open && firstLine.length > 0 ? (
            <span className="truncate text-[11.5px] text-ink-600">
              {firstLine}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-600">
          {agoLabel(note._creationTime)}
        </span>
      </button>

      {open ? (
        <div className="pt-2 pl-[18px]">
          <EditorPanel
            parent={{ noteId: note._id }}
            /* A note is knowledge — the colour NoteView and the Notes page
               already use for one. */
            area="knowledge"
            title={title}
            onTitle={setTitle}
            titlePlaceholder="What this note is called"
            body={body}
            onBody={setBody}
            bodyPlaceholder="Write it down — or paste a prompt, a link, a screenshot…"
            bodyRows={6}
            dirty={dirty}
            status={saving.status}
            onSettled={saving.settle}
            onSave={() =>
              void saving.run(() => update({ noteId: note._id, title, body }))
            }
            onCancel={shut}
            corner={
              <Link
                to="/notes/$id"
                params={{ id: note._id }}
                title="Open this note on its own page"
                aria-label="Open this note on its own page"
                className="motion-press mt-1 grid size-6 shrink-0 place-items-center rounded-[7px] text-ink-600 transition-colors hover:bg-lift/5 hover:text-lav-300"
              >
                <ArrowUpRight className="size-4" />
              </Link>
            }
          />
        </div>
      ) : null}
    </div>
  )
}
