import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'

export const Route = createFileRoute('/_app/notes')({
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
   this month" would be a fourth source measuring typing. */
function Notes() {
  const [kind, setKind] = useState<Kind | 'all'>('all')
  const [title, setTitle] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const notes = useQuery(api.notes.list, kind === 'all' ? {} : { kind })
  const create = useMutation(api.notes.create)
  const update = useMutation(api.notes.update)
  const remove = useMutation(api.notes.remove)

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0) return
    await create({ title: trimmed, kind: kind === 'all' ? 'note' : kind })
    setTitle('')
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
            className={[
              'rounded-[6px] px-2.5 py-1 text-[11.5px] transition-colors',
              kind === option.value
                ? 'bg-lav-300/20 text-foreground ring-1 ring-lav-300/40'
                : 'bg-white/[0.05] text-ink-500 ring-1 ring-white/10',
            ].join(' ')}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder="A title is enough — it is often the whole thought."
          className="flex-1 rounded-[7px] bg-white/[0.05] px-3 py-2 text-[13px] text-foreground outline-none ring-1 ring-white/10 focus:ring-lav-300/40"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-[7px] bg-lav-300/20 px-3 py-1.5 text-[12.5px] text-foreground ring-1 ring-lav-300/40"
        >
          Add
        </button>
      </div>

      {notes === undefined ? (
        <p className="text-[12.5px] text-ink-600">Reading&hellip;</p>
      ) : notes.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing here yet. Write the thought above; the rest can wait.
        </p>
      ) : (
        <div className="glass flex flex-col rounded-[22px] p-2">
          {notes.map((note) => {
            const open = openId === note._id
            return (
              <div
                key={note._id}
                className="border-b border-white/[0.05] px-3 py-3 last:border-b-0"
              >
                <div className="flex items-baseline gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenId(open ? null : note._id)
                      setDraft(note.body)
                    }}
                    className="flex-1 text-left text-[13px] text-foreground"
                  >
                    {note.title}
                  </button>
                  <span className="label-caps">{note.kind}</span>
                  <button
                    type="button"
                    onClick={() => remove({ noteId: note._id })}
                    className="text-[11.5px] text-ink-700 hover:text-red-300/90"
                  >
                    Delete
                  </button>
                </div>

                {open ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <textarea
                      rows={5}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      className="resize-y rounded-[7px] bg-white/[0.05] px-3 py-2 text-[13px] text-foreground outline-none ring-1 ring-white/10 focus:ring-lav-300/40"
                    />
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={async () => {
                          await update({ noteId: note._id, body: draft })
                          setOpenId(null)
                        }}
                        className="rounded-[7px] bg-white/[0.05] px-3 py-1.5 text-[12.5px] text-ink-500 ring-1 ring-white/10"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
