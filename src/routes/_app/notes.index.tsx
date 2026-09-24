import { useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { PenLine } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { PendingTray } from '@/components/attachments/Attachments'
import { usePendingAttachments } from '@/components/attachments/useAttachments'
import { PageTitle } from '@/components/PageTitle'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { NoteToolbar } from '@/components/notes/NoteToolbar'
import { KIND_LABEL, NoteRow, kindVars } from '@/components/notes/NoteRow'
import { SaveLabel, useSave } from '@/components/Saving'
import { SkeletonRows } from '@/components/Skeleton'
import { Key } from '@/components/shell/Key'
import { splitNote } from '@/lib/note-text'
import { useArrived, useHeld } from '@/lib/loading'

export const Route = createFileRoute('/_app/notes/')({
  component: Notes,
})

type Kind = Doc<'notes'>['kind']

const KINDS: Array<{ value: Kind | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'note', label: 'Notes' },
  { value: 'idea', label: 'Ideas' },
  { value: 'book', label: 'Books' },
  { value: 'reference', label: 'Reference' },
]

/* PLAN.md §2. A note counts towards nothing — it appears in no tile and moves
   no number, which is why this page has no count anywhere on it. "14 notes
   this month" would be an unsanctioned source measuring typing.

   Writing happens at the top, the way it does in Notes: a sheet whose first
   line is the title. Reading happens on the note's own page, which is where a
   long note — a shopping list with sections, a technique — is legible. */
function Notes() {
  const [kind, setKind] = useState<Kind | 'all'>('all')
  const [text, setText] = useState('')
  const [writing, setWriting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  /* What the note being written will be filed as (24 Sep): chosen in the
     sheet, starting from the tab you are on — "All" starts it as a Note. */
  const [newKind, setNewKind] = useState<Kind>('note')
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const now = Date.now()

  /* Every note, once, filtered below. A query per tab meant every switch
     started a new subscription, and the list blinked to its skeleton and back
     for a moment each time. Filtering a personal list of notes in the browser
     is instant, and the skeleton now only ever shows on the first load. */
  /* The Archived tab is a different read, not a filter: archived notes are
     not sent to a page that is not showing them. */
  const [archivedView, setArchivedView] = useState(false)
  const allNotes = useHeld(
    useQuery(api.notes.list, archivedView ? { archived: true } : {}),
  )
  const arrived = useArrived(allNotes)
  const notes =
    allNotes === undefined
      ? undefined
      : kind === 'all'
        ? allNotes
        : allNotes.filter((note) => note.kind === kind)
  const create = useMutation(api.notes.create)
  const setArchived = useMutation(api.notes.setArchived)
  const removeMany = useMutation(api.notes.removeMany)

  /* Select mode (24 Sep): tick several, then archive or delete them. */
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [confirmBulk, setConfirmBulk] = useState(false)
  function stopSelecting() {
    setSelecting(false)
    setSelected(new Set())
    setConfirmBulk(false)
  }
  function toggle(id: string) {
    setConfirmBulk(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const chosen = (notes ?? []).filter((n) => selected.has(n._id))
  function archiveChosen() {
    void setArchived({
      noteIds: chosen.map((n) => n._id),
      archived: !archivedView,
    })
    stopSelecting()
  }
  function deleteChosen() {
    void removeMany({ noteIds: chosen.map((n) => n._id) })
    stopSelecting()
  }
  const saving = useSave()
  /* Screenshots pasted while the note is still being written. They have
     nowhere to go until it is saved — see `usePendingAttachments`. */
  const files = usePendingAttachments()

  async function save() {
    if (saving.status === 'saving') return
    const { title, body } = splitNote(text)
    if (title.length === 0) {
      setProblem('A note needs a first line — it becomes the title.')
      return
    }
    await saving.run(async () => {
      const noteId = await create({
        title,
        body,
        kind: newKind,
      })
      /* Inside the same tick, so the spinner covers the upload too and the
         note never appears in the list below without the screenshot that was
         pasted into it. */
      await files.flush({ noteId })
    })
    /* The words clear at once, so the next note can start; the sheet folds
       away when the tick has been seen (below). */
    setText('')
    setProblem(null)
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <PageTitle
        title="Notes"
        subtitle="Written down, and counted towards nothing."
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setKind(option.value)
              if (option.value !== 'all') setNewKind(option.value)
              stopSelecting()
            }}
            /* Each kind's tab in its own colour; All in the knowledge
               blue every note shared until 24 Sep. */
            style={
              option.value === 'all'
                ? ({ '--kind': 'var(--area-knowledge)' } as React.CSSProperties)
                : kindVars(option.value)
            }
            className={[
              'motion-press flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px]',
              kind === option.value
                ? 'bg-(--kind)/16 text-(--kind) ring-1 ring-(--kind)/40'
                : 'bg-lift/[0.05] text-ink-500 ring-1 ring-lift/10 hover:text-ink-300',
            ].join(' ')}
          >
            {option.value !== 'all' ? (
              <span className="size-1.5 rounded-full bg-(--kind)" />
            ) : null}
            {option.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-lift/10" />
        <button
          type="button"
          aria-pressed={archivedView}
          onClick={() => {
            setArchivedView((a) => !a)
            stopSelecting()
          }}
          className={[
            'motion-press rounded-full px-3 py-1 text-[12px]',
            archivedView
              ? 'bg-lift/[0.1] text-foreground ring-1 ring-lift/25'
              : 'text-ink-500 ring-1 ring-lift/10 hover:text-ink-300',
          ].join(' ')}
        >
          Archived
        </button>
        {notes !== undefined && notes.length > 0 ? (
          <button
            type="button"
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            className="motion-press ml-auto rounded-full px-3 py-1 text-[12px] text-ink-400 ring-1 ring-lift/10 hover:text-foreground"
          >
            {selecting ? 'Done' : 'Select'}
          </button>
        ) : null}
      </div>

      {/* The way in (20 Sep). Artem: "in notes when we create new note its
          bad. Like now our new note creation in project page is better than
          in actually notes page."

          He was right, and it was the fault he had already named once: this
          was a line of placeholder text on a bare panel, which is the "two
          stupid small input" that `AddField` was built to end — and then the
          project page got `AddField` and this page did not. So it gets the
          same shell: an edge, the full width it was given, a glyph, and the
          knowledge colour when you are in it. What it is *not* is an
          `AddField`, because a note is written here, not named: the sheet
          still grows with what you type and ⌘↵ still saves it. */}
      <div
        className={`glass rounded-[22px] transition-shadow duration-(--motion-base) ${
          writing ? 'ring-1 ring-area-knowledge/35' : ''
        }`}
      >
        <div
          {...files.zone}
          className={`flex items-start gap-2.5 rounded-[22px] border px-5 py-4 transition-colors ${
            files.over
              ? 'border-area-knowledge/60 bg-area-knowledge/[0.08]'
              : writing
                ? 'border-transparent'
                : 'border-lift/10 bg-sink/20 hover:border-lift/20 focus-within:border-area-knowledge/50 focus-within:bg-area-knowledge/[0.06]'
          }`}
        >
          <PenLine
            className={`mt-1 size-4 shrink-0 transition-colors ${
              writing ? 'text-area-knowledge' : 'text-ink-600'
            }`}
          />
          <NoteEditor
            value={text}
            onChange={(next) => {
              setText(next)
              setWriting(next.length > 0)
              setProblem(null)
            }}
            onSubmit={() => void save()}
            textareaRef={editorRef}
            placeholder={'New note — the first line is its title'}
            className={writing ? '' : 'max-h-[26px] overflow-hidden'}
          />
        </div>
        {writing ? (
          <div className="motion-arrive mx-5 mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-lift/[0.06] pt-3">
            <NoteToolbar
              editorRef={editorRef}
              value={text}
              onChange={setText}
            />
            <div
              role="radiogroup"
              aria-label="Type"
              className="ml-auto flex flex-wrap gap-1"
            >
              {KINDS.filter((k) => k.value !== 'all').map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={newKind === option.value}
                  /* Keep the caret in the note while choosing its type. */
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setNewKind(option.value as Kind)}
                  style={kindVars(option.value as Kind)}
                  className={[
                    'motion-press rounded-full px-2.5 py-0.5 text-[11.5px]',
                    newKind === option.value
                      ? 'bg-(--kind)/16 text-(--kind) ring-1 ring-(--kind)/40'
                      : 'text-ink-500 ring-1 ring-lift/10 hover:text-ink-300',
                  ].join(' ')}
                >
                  {KIND_LABEL[option.value as Kind]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {writing || files.pending.length > 0 ? (
          <div className="motion-arrive mx-5 mb-3 border-t border-lift/[0.06] pt-3">
            <PendingTray att={files} />
          </div>
        ) : null}
        {writing ? (
          <div className="motion-arrive mx-5 mb-4 flex items-center gap-3 border-t border-lift/[0.06] pt-3 text-[11.5px] text-ink-500">
            <span className="flex items-center gap-[7px]">
              <Key>⌘↵</Key>
              save
            </span>
            {problem ? (
              <span className="text-foreground">{problem}</span>
            ) : null}
            <button
              type="button"
              disabled={saving.busy}
              onClick={() => void save()}
              className="motion-press ml-auto rounded-full bg-area-knowledge/16 px-3 py-1 text-[12px] text-area-knowledge ring-1 ring-area-knowledge/35 hover:bg-area-knowledge/24"
            >
              <SaveLabel
                status={saving.status}
                onSettled={() => {
                  saving.settle()
                  /* Unless a new note was begun while the tick played. */
                  setWriting((w) => w && text.length > 0)
                }}
              >
                Save note
              </SaveLabel>
            </button>
          </div>
        ) : null}
      </div>

      {notes === undefined ? (
        /* Shape, never values (§3d.2). */
        <div className="glass rounded-[22px] p-2">
          <SkeletonRows rows={3} rowClassName="px-3.5 py-3" line="h-[22px]" />
        </div>
      ) : notes.length === 0 ? (
        <p className={`text-[13px] text-ink-500 ${arrived}`}>
          {archivedView
            ? 'Nothing archived. Archive a note from its row to put it here.'
            : 'Nothing here yet. Write the first line above; the rest can wait.'}
        </p>
      ) : (
        <div className={`glass flex flex-col rounded-[22px] p-2 ${arrived}`}>
          {notes.map((note) => (
            <NoteRow
              key={note._id}
              note={note}
              now={now}
              archivedView={archivedView}
              selecting={selecting}
              checked={selected.has(note._id)}
              onToggle={() => toggle(note._id)}
              onArchive={() =>
                void setArchived({
                  noteIds: [note._id],
                  archived: !archivedView,
                })
              }
              onDelete={() => void removeMany({ noteIds: [note._id] })}
            />
          ))}
        </div>
      )}

      {selecting ? (
        /* What to do with the ticked ones. Fixed to the bottom, above the
           phone's nav, so it is reachable from anywhere in a long list. */
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(150px+env(safe-area-inset-bottom))] z-40 flex justify-center px-[18px] md:bottom-6">
          <div className="glass-modal motion-arrive pointer-events-auto flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-4">
            <span className="text-[12.5px] text-ink-300">
              {chosen.length === 0
                ? 'Tick the notes'
                : `${chosen.length} selected`}
            </span>
            <button
              type="button"
              onClick={() =>
                setSelected(
                  chosen.length === notes?.length
                    ? new Set()
                    : new Set((notes ?? []).map((n) => n._id)),
                )
              }
              className="motion-press rounded-full px-2.5 py-1 text-[12px] text-ink-400 hover:text-foreground"
            >
              {chosen.length === notes?.length ? 'None' : 'All'}
            </button>
            <button
              type="button"
              disabled={chosen.length === 0}
              onClick={archiveChosen}
              className="motion-press rounded-full px-3 py-1 text-[12px] text-foreground ring-1 ring-lift/15 hover:bg-lift/[0.06] disabled:opacity-40"
            >
              {archivedView ? 'Unarchive' : 'Archive'}
            </button>
            <button
              type="button"
              disabled={chosen.length === 0}
              onClick={() =>
                confirmBulk ? deleteChosen() : setConfirmBulk(true)
              }
              className={`motion-press rounded-full px-3 py-1 text-[12px] ring-1 disabled:opacity-40 ${
                confirmBulk
                  ? 'bg-state-danger/15 text-state-danger ring-state-danger/40'
                  : 'text-ink-300 ring-lift/15 hover:text-state-danger'
              }`}
            >
              {confirmBulk ? `Delete ${chosen.length} for good?` : 'Delete'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
