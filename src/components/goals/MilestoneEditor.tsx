import { useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

/* Add, reorder, delete — the editing the timeline itself stays free of, so a
   tap on the timeline only ever means "reached". Behind a disclosure on the
   Goals page; never on a project page. */
export function MilestoneEditor({ goalId }: { goalId: Id<'goals'> }) {
  const milestones = useQuery(api.milestones.listByGoal, { goalId })
  const create = useMutation(api.milestones.create)
  const move = useMutation(api.milestones.move)
  const remove = useMutation(api.milestones.remove)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0) return
    await create({
      goalId,
      title: trimmed,
      dueDate: dueDate || undefined,
      /* Guarded as well as hidden: a time with no day is refused by the
         mutation, and the form must not be the thing that asks for it. */
      dueTime: dueDate && dueTime ? dueTime : undefined,
    })
    setTitle('')
    setDueDate('')
    setDueTime('')
  }

  const iconButton =
    'text-ink-600 transition-colors hover:text-ink-300 disabled:opacity-30'

  const dateControl =
    'rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 font-mono text-[11.5px] text-ink-300'

  return (
    <div className="flex flex-col">
      {(milestones ?? []).map((m, i, all) => (
        <div
          key={m._id}
          className="flex items-center gap-2 border-b border-lift/[0.05] py-2"
        >
          <span className="w-5 font-mono text-[11px] text-ink-600">
            {i + 1}
          </span>
          <span className="flex-1 truncate text-[12.5px] text-ink-300">
            {m.title}
          </span>
          {m.dueDate ? (
            <span className="font-mono text-[11px] text-ink-600">
              {m.dueDate}
              {m.dueTime ? `, ${m.dueTime}` : ''}
            </span>
          ) : null}
          <button
            type="button"
            aria-label={`Move ${m.title} earlier`}
            disabled={i === 0}
            onClick={() =>
              void move({ milestoneId: m._id, direction: 'earlier' })
            }
            className={iconButton}
          >
            <ArrowUp className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Move ${m.title} later`}
            disabled={i === all.length - 1}
            onClick={() =>
              void move({ milestoneId: m._id, direction: 'later' })
            }
            className={iconButton}
          >
            <ArrowDown className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${m.title}`}
            onClick={() => void remove({ milestoneId: m._id })}
            className={iconButton}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Plus className="size-3.5 text-ink-600" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void add()
          }}
          placeholder="A milestone"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-ink-700"
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="By when"
          className={dateControl}
        />
        {/* An hour only once there is a day to hang it on: the backend
            refuses a time without a date, so the field that would break that
            rule is not offered. */}
        {dueDate ? (
          <input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            aria-label="At what time"
            className={dateControl}
          />
        ) : null}
        {/* Enter still adds. The button is the one you can see: quick
            capture learned the same thing on 17 Sep (#40). */}
        <button
          type="button"
          disabled={title.trim().length === 0}
          onClick={() => void add()}
          className="rounded-[7px] border border-lav-500/60 px-3 py-1 text-[12px] text-lav-300 transition-colors hover:bg-lav-900/60 disabled:border-lift/10 disabled:text-ink-700 disabled:hover:bg-transparent"
        >
          Add
        </button>
      </div>
    </div>
  )
}
