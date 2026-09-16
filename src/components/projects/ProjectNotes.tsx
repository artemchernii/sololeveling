import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { SaveGlyph, useSave } from '@/components/Saving'
import { SkeletonRows } from '@/components/Skeleton'
import { agoLabel } from '@/lib/format'

/* The notes attached to a project (R3). Writing one here creates it already
   attached and opens it, because a note is written on its own page. Files
   arrive in R4, on notes — and so on the project through this card. */
export function ProjectNotes({ projectId }: { projectId: Id<'projects'> }) {
  const notes = useQuery(api.notes.listByProject, { projectId })
  const create = useMutation(api.notes.create)
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const writing = useSave()

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0 || writing.busy) return
    const noteId = await writing.run(() =>
      create({ title: trimmed, projectId }),
    )
    setTitle('')
    await navigate({ to: '/notes/$id', params: { id: noteId } })
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

      <div className="flex items-center gap-2 border-t border-lift/[0.07] pt-3">
        <SaveGlyph
          status={writing.status}
          onSettled={writing.settle}
          idle={<Plus className="size-3.5" />}
          className="text-ink-600"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder="A note on this project"
          className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
        />
      </div>
    </div>
  )
}
