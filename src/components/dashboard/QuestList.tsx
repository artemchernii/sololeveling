import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { SaveGlyph, useSave } from '@/components/Saving'
import { SkeletonRows } from '@/components/Skeleton'
import { useArrived } from '@/lib/loading'
import { QuestFollowUp } from './QuestFollowUp'
import { QuestRow } from './QuestRow'
import type { PendingEvidence } from './QuestRow'

const TODAY_LIMIT = 3

/** The add field, for anything that wants to hand you the day's first move. */
export const PICK_FIELD_ID = 'pick-todays-three'

/* PLAN.md §3 item 2 and §3c.1. Three slots, and when they are full the "add"
   affordance is replaced by a sentence rather than disabled and left there.
   The Quests page lived here until 15 Sep; this card is it now.

   No backlog count anywhere on this screen (§3c.3). */
export function QuestList({
  tasks,
  today,
}: {
  tasks: Array<Doc<'tasks'>> | undefined
  today: string
}) {
  const arrived = useArrived(tasks)
  const createTask = useMutation(api.tasks.create)
  const pickForToday = useMutation(api.tasks.pickForToday)
  const [title, setTitle] = useState('')
  const adding = useSave()

  /* Completing a task removes it from this list, so the §3b.1 follow-up
     cannot live inside the row it belongs to — the row is already gone. It
     sits under the list and survives until it is answered or waved off. */
  const [pending, setPending] = useState<PendingEvidence | null>(null)

  const full = (tasks?.length ?? 0) >= TODAY_LIMIT

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0 || adding.status === 'saving') return
    await adding.run(async () => {
      const id = await createTask({ title: trimmed })
      /* Created here means "I intend to do it today" — so it takes a slot
         immediately. Created anywhere else, it waits in the backlog. */
      await pickForToday({ taskId: id, today })
    })
    setTitle('')
  }

  return (
    /* Tall enough for the empty state and for one or two picks, so the card
       does not resize when the skeleton gives way to what is actually there
       — a page that steps as its data lands reads as flickering (16 Sep). */
    <div className="glass flex min-h-[216px] flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-baseline justify-between">
        <div className="label-caps">Today&rsquo;s three</div>
        <div className="label-caps">
          {tasks ? `${tasks.length} of ${TODAY_LIMIT}` : ''}
        </div>
      </div>

      {tasks === undefined ? (
        <SkeletonRows rows={2} />
      ) : tasks.length === 0 ? (
        <p className={`text-[13px] text-ink-500 ${arrived}`}>
          Nothing picked yet. Three is the whole day.
        </p>
      ) : (
        <div className={`flex flex-col ${arrived}`}>
          {tasks.map((task) => (
            <QuestRow key={task._id} task={task} onCompleted={setPending} />
          ))}
        </div>
      )}

      {pending ? (
        <QuestFollowUp pending={pending} onDone={() => setPending(null)} />
      ) : null}

      {full ? (
        <p className="text-[13px] text-ink-400">
          Today is full. Finish one or drop one.
        </p>
      ) : (
        <div className="flex items-center gap-2 border-t border-lift/[0.07] pt-3">
          <SaveGlyph
            status={adding.status}
            onSettled={adding.settle}
            idle={<Plus className="size-3.5" />}
            className="text-ink-600"
          />
          <input
            /* Named so the principles panel can send you straight here when
               you close it — reading the six and picking the three are the
               same move, a minute apart. */
            id={PICK_FIELD_ID}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add()
            }}
            placeholder="What are you actually doing today?"
            className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
          />
        </div>
      )}
    </div>
  )
}
