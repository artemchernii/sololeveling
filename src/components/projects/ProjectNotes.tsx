import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { AddField } from '@/components/AddField'
import { useSave } from '@/components/Saving'
import { SkeletonRows } from '@/components/Skeleton'
import { agoLabel } from '@/lib/format'

/* The notes attached to a project (R3). Writing one here creates it already
   attached, and stays here: it used to open the note's own page, which threw
   you out of the project you were working in to look at an empty editor
   (20 Sep). The glyph runs spinner → tick, the note appears in the list above
   on its own — Convex reactivity, no refetch — and you open it when you want
   to write in it. Files arrive in R4, on notes, and so on the project through
   this card. */
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
      <div className="label-caps">Notes</div>

      {notes === undefined ? (
        <SkeletonRows rows={3} />
      ) : notes.length === 0 ? (
        <p className="text-[13px] text-ink-500">No notes on this project.</p>
      ) : (
        <div className="flex flex-col">
          {notes.map((note) => (
            <Link
              key={note._id}
              to="/notes/$id"
              params={{ id: note._id }}
              className="group flex items-baseline gap-3 border-b border-lift/[0.05] py-2.5 last:border-b-0"
            >
              <span className="flex-1 truncate text-[13px] text-foreground transition-colors group-hover:text-lav-300">
                {note.title}
              </span>
              <span className="label-caps shrink-0">{note.kind}</span>
              <span className="shrink-0 font-mono text-[11px] text-ink-600">
                {agoLabel(note._creationTime)}
              </span>
            </Link>
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
