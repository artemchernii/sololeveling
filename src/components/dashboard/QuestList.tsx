import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { SaveGlyph, useSave } from '@/components/Saving'
import { SkeletonRows } from '@/components/Skeleton'
import { areaVars } from '@/lib/areas'
import { useArrived } from '@/lib/loading'
import { QuestFollowUp } from './QuestFollowUp'
import { QuestRow } from './QuestRow'
import type { PendingEvidence } from './QuestRow'

const TODAY_LIMIT = 3

/** The open slot's field, for anything handing you the day's first move. */
export const PICK_FIELD_ID = 'pick-todays-three'

/* PLAN.md §3 item 2 and §3c.1: three, hard. Three slots are drawn whether or
   not they are filled, numbered 01–03 — the day has that shape before you
   choose anything, and an empty slot is the invitation. The first empty one
   is the field you type into; the rest wait behind it. That replaces the card
   as it was on 16 Sep — a list and a text input under it, which Artem read
   as "a shitty input and nothing more".

   The Quests page lived here until 15 Sep; this card is it now. No backlog
   count anywhere on this screen (§3c.3). */
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
     sits under the slots and survives until it is answered or waved off. */
  const [pending, setPending] = useState<PendingEvidence | null>(null)

  const picked = tasks ?? []
  /* The first slot with nothing in it is the one that takes the typing. */
  const openSlot = picked.length

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
    /* Tall enough for three slots, so the card does not resize when the
       skeleton gives way to what is actually there — a page that steps as
       its data lands reads as flickering (16 Sep). */
    <div className="glass flex min-h-[216px] flex-col gap-3 rounded-[22px] p-5">
      <div className="flex items-baseline justify-between">
        <div className="label-caps">Today&rsquo;s three</div>
        <div className="label-caps">
          {tasks ? `${picked.length} of ${TODAY_LIMIT}` : ''}
        </div>
      </div>

      {tasks === undefined ? (
        <SkeletonRows rows={2} />
      ) : (
        <div className={`flex flex-col gap-1.5 ${arrived}`}>
          {Array.from({ length: TODAY_LIMIT }, (_, slot) => {
            /* `.length`, not a bare index: without noUncheckedIndexedAccess
               TypeScript believes every index is filled. */
            const task = slot < picked.length ? picked[slot] : undefined
            if (task !== undefined) {
              return (
                <Slot key={task._id} number={slot} area={task.area} filled>
                  <QuestRow task={task} onCompleted={setPending} />
                </Slot>
              )
            }

            if (slot === openSlot) {
              return (
                <Slot key={`open-${slot}`} number={slot} open>
                  {/* The same 18px box the tick occupies in a filled slot,
                      so the glyph and the text line up down the card — a
                      bare "+" character sat on its own baseline, low. */}
                  <span className="grid size-[18px] shrink-0 place-items-center">
                    <SaveGlyph
                      status={adding.status}
                      onSettled={adding.settle}
                      idle={<Plus className="size-3.5" />}
                      className="text-ink-600"
                    />
                  </span>
                  <input
                    id={PICK_FIELD_ID}
                    data-slot-field
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void add()
                    }}
                    placeholder={
                      slot === 0
                        ? 'What are you actually doing today?'
                        : 'And then?'
                    }
                    className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
                  />
                </Slot>
              )
            }

            return (
              <Slot key={`empty-${slot}`} number={slot}>
                <span className="text-[13px] text-ink-800">&mdash;</span>
              </Slot>
            )
          })}
        </div>
      )}

      {pending ? (
        <QuestFollowUp pending={pending} onDone={() => setPending(null)} />
      ) : null}

      {picked.length >= TODAY_LIMIT ? (
        <p className="text-[12.5px] text-ink-500">
          Today is full. Finish one or drop one.
        </p>
      ) : null}
    </div>
  )
}

/* One of the three, numbered. A filled slot wears its task's area colour on
   the number and the edge; the open one lights lavender because it is the
   live thing on this card; the rest are outlines waiting to be filled. */
function Slot({
  number,
  area,
  filled,
  open,
  children,
}: {
  number: number
  area?: Doc<'tasks'>['area']
  filled?: boolean
  open?: boolean
  children: React.ReactNode
}) {
  const tone = filled
    ? area
      ? 'border-(--area)/25 bg-(--area)/[0.04]'
      : 'border-lift/10 bg-lift/[0.03]'
    : open
      ? 'border-lav-500/40 bg-lav-900/15 focus-within:border-lav-500/70'
      : 'border-dashed border-lift/[0.08]'

  return (
    <div
      style={area ? areaVars(area) : undefined}
      className={`flex min-h-[44px] items-center gap-2.5 rounded-[12px] border px-3 transition-colors duration-(--motion-fast) ${tone}`}
    >
      <span
        className={`font-mono text-[10px] tracking-[0.1em] ${
          filled ? (area ? 'text-(--area)' : 'text-ink-500') : 'text-ink-800'
        }`}
      >
        {String(number + 1).padStart(2, '0')}
      </span>
      {children}
    </div>
  )
}
