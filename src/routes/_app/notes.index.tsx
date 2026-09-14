import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ChevronRight } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { NoteEditor } from '@/components/notes/NoteEditor'
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

/** The first line of the body worth showing under a title in the list. */
function preview(body: string): string | null {
  const line = body
    .split('\n')
    .map((l) => l.replace(/^\s*([*\-•]|\d+[.)])\s+/, '').trim())
    .find((l) => l.length > 0)
  return line ?? null
}

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

  /* Every note, once, filtered below. A query per tab meant every switch
     started a new subscription, and the list blinked to its skeleton and back
     for a moment each time. Filtering a personal list of notes in the browser
     is instant, and the skeleton now only ever shows on the first load. */
  const allNotes = useHeld(useQuery(api.notes.list, {}))
  const arrived = useArrived(allNotes)
  const notes =
    allNotes === undefined
      ? undefined
      : kind === 'all'
        ? allNotes
        : allNotes.filter((note) => note.kind === kind)
  const create = useMutation(api.notes.create)
  const saving = useSave()

  async function save() {
    if (saving.status === 'saving') return
    const { title, body } = splitNote(text)
    if (title.length === 0) {
      setProblem('A note needs a first line — it becomes the title.')
      return
    }
    await saving.run(() =>
      create({ title, body, kind: kind === 'all' ? 'note' : kind }),
    )
    /* The words clear at once, so the next note can start; the sheet folds
       away when the tick has been seen (below). */
    setText('')
    setProblem(null)
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <h1 className="text-[22px] text-foreground">Notes</h1>
        <p className="label-caps">Written down, and counted towards nothing.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setKind(option.value)}
            style={{ '--area': 'var(--area-knowledge)' } as React.CSSProperties}
            className={[
              'motion-press rounded-full px-3 py-1 text-[12px]',
              kind === option.value
                ? 'bg-(--area)/16 text-(--area) ring-1 ring-(--area)/40'
                : 'bg-white/[0.05] text-ink-500 ring-1 ring-white/10 hover:text-ink-300',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div
        className={`glass rounded-[22px] px-5 py-4 transition-shadow duration-(--motion-base) ${
          writing ? 'ring-1 ring-area-knowledge/35' : ''
        }`}
      >
        <NoteEditor
          value={text}
          onChange={(next) => {
            setText(next)
            setWriting(next.length > 0)
            setProblem(null)
          }}
          onSubmit={() => void save()}
          placeholder={'New note — the first line is its title'}
          className={writing ? '' : 'max-h-[26px] overflow-hidden'}
        />
        {writing ? (
          <div className="motion-arrive mt-3 flex items-center gap-3 border-t border-white/[0.06] pt-3 text-[11.5px] text-ink-500">
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
          Nothing here yet. Write the first line above; the rest can wait.
        </p>
      ) : (
        <div className={`glass flex flex-col rounded-[22px] p-2 ${arrived}`}>
          {notes.map((note) => {
            const line = preview(note.body)
            return (
              <Link
                key={note._id}
                to="/notes/$id"
                params={{ id: note._id }}
                className="group motion-press flex items-center gap-3 rounded-[14px] px-3.5 py-3 hover:bg-white/[0.04]"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-area-knowledge/70" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-foreground">
                    {note.title}
                  </span>
                  {line ? (
                    <span className="block truncate text-[12.5px] text-ink-500">
                      {line}
                    </span>
                  ) : null}
                </span>
                {note.kind !== 'note' ? (
                  <span className="label-caps">{note.kind}</span>
                ) : null}
                <ChevronRight className="size-4 shrink-0 text-ink-700 transition-transform duration-(--motion-fast) group-hover:translate-x-0.5 group-hover:text-ink-400" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
