import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Check, Plus, Trash2, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { AreaBadge } from '@/components/AreaBadge'
import type { Area } from '@/lib/capture-parser'
import { localToday, startOfLocalDay } from '@/lib/today'

export const Route = createFileRoute('/_app/quests')({
  component: Quests,
})

const TODAY_LIMIT = 3

/* PLAN.md §3 item 5 and §3c.1. Three slots, and when they are full the "add"
   affordance is replaced by a sentence rather than disabled and left there.
 
   There is no count of the backlog on this page. That number lives on its own
   route or nowhere (§3c.3). */
function Quests() {
  const today = localToday()
  const tasks = useQuery(api.tasks.listToday, { today })
  const logs = useQuery(api.logs.listSince, { since: startOfLocalDay() })

  const createTask = useMutation(api.tasks.create)
  const pickForToday = useMutation(api.tasks.pickForToday)
  const [title, setTitle] = useState('')

  /* Completing a task removes it from this list, so the §3b.1 follow-up cannot
     live inside the row it belongs to — the row is already gone. It sits here,
     under the list, and survives until it is answered or waved off. */
  const [pending, setPending] = useState<PendingEvidence | null>(null)

  const full = (tasks?.length ?? 0) >= TODAY_LIMIT

  async function add() {
    const trimmed = title.trim()
    if (trimmed.length === 0) return
    const id = await createTask({ title: trimmed })
    /* Created from this screen means "I intend to do it today" — so it takes a
       slot immediately. Created anywhere else, it waits in the backlog. */
    await pickForToday({ taskId: id, today })
    setTitle('')
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="glass flex flex-col gap-4 rounded-[22px] p-6">
        <div className="flex items-baseline justify-between">
          <div className="label-caps">Today&rsquo;s quests</div>
          <div className="label-caps">
            {tasks === undefined ? '' : `${tasks.length} of ${TODAY_LIMIT}`}
          </div>
        </div>

        {tasks === undefined ? (
          <p className="text-[12.5px] text-ink-600">Reading&hellip;</p>
        ) : tasks.length === 0 ? (
          <p className="text-[13px] text-ink-500">
            Nothing picked yet. Three is the whole day.
          </p>
        ) : (
          <div className="flex flex-col">
            {tasks.map((task) => (
              <QuestRow key={task._id} task={task} onCompleted={setPending} />
            ))}
          </div>
        )}

        {pending ? (
          <FollowUp pending={pending} onDone={() => setPending(null)} />
        ) : null}

        {full ? (
          <p className="text-[13px] text-ink-400">
            Today is full. Finish one or drop one.
          </p>
        ) : (
          <div className="flex items-center gap-2 border-t border-white/[0.07] pt-3">
            <Plus className="size-3.5 text-ink-600" />
            <input
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

      <LoggedToday logs={logs} />
    </div>
  )
}

/* §3b.1: ticking the box is intent. The follow-up is the only path from a
   completed task to a row of evidence, and it is one explicit tap. Only body
   and portuguese have a countable action behind them today. */
type PendingEvidence = {
  title: string
  kind: 'workout' | 'session'
  area: Area
}

function evidenceFor(task: Doc<'tasks'>): PendingEvidence | null {
  if (task.area === 'body') {
    return { title: task.title, kind: 'workout', area: 'body' }
  }
  if (task.area === 'portuguese') {
    return { title: task.title, kind: 'session', area: 'portuguese' }
  }
  return null
}

function QuestRow({
  task,
  onCompleted,
}: {
  task: Doc<'tasks'>
  onCompleted: (pending: PendingEvidence | null) => void
}) {
  const complete = useMutation(api.tasks.complete)
  const drop = useMutation(api.tasks.dropFromToday)
  const setArea = useMutation(api.tasks.setArea)

  return (
    <div className="flex flex-col gap-2 border-b border-white/[0.05] py-2.5 last:border-b-0">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Complete ${task.title}`}
          onClick={async () => {
            const pending = evidenceFor(task)
            await complete({ taskId: task._id })
            onCompleted(pending)
          }}
          className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-white/15 text-transparent transition-colors hover:border-lav-500 hover:text-lav-300"
        >
          <Check className="size-3" />
        </button>

        <span className="flex-1 text-[13px] text-foreground">{task.title}</span>

        <AreaBadge
          area={task.area}
          onChange={(area: Area) => void setArea({ taskId: task._id, area })}
        />

        {task.durationMin ? (
          <span className="font-mono text-[11px] text-ink-600">
            {task.durationMin} min
          </span>
        ) : null}

        <button
          type="button"
          aria-label={`Drop ${task.title}`}
          onClick={() => void drop({ taskId: task._id })}
          className="text-ink-700 transition-colors hover:text-ink-400"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

/* Intent and evidence stay apart in both directions (§3b.1). This writes the
   second row only when it is tapped, and never as a consequence of the tick. */
function FollowUp({
  pending,
  onDone,
}: {
  pending: PendingEvidence
  onDone: () => void
}) {
  const createLog = useMutation(api.logs.create)
  const [minutes, setMinutes] = useState('')

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3 text-[12.5px]">
      <span className="text-ink-400">{pending.title}</span>
      <span className="text-ink-600">
        &mdash; done. Log it as a {pending.kind}?
      </span>
      <input
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        placeholder="min"
        inputMode="numeric"
        className="w-12 rounded-[5px] border border-white/10 bg-black/20 px-1.5 py-0.5 text-center font-mono text-[11px] text-foreground outline-none"
      />
      <button
        type="button"
        onClick={async () => {
          const value = Number(minutes.replace(',', '.'))
          await createLog({
            kind: pending.kind,
            area: pending.area,
            occurredAt: Date.now(),
            value: Number.isFinite(value) && value > 0 ? value : undefined,
            unit: 'min',
          })
          onDone()
        }}
        className="rounded-[5px] border border-lav-500/60 px-2 py-0.5 text-[11.5px] text-lav-300 transition-colors hover:bg-lav-900/60"
      >
        Yes
      </button>
      <button
        type="button"
        onClick={onDone}
        className="text-[11.5px] text-ink-600 transition-colors hover:text-ink-400"
      >
        No
      </button>
    </div>
  )
}

function LoggedToday({ logs }: { logs: Array<Doc<'logs'>> | undefined }) {
  const setArea = useMutation(api.logs.setArea)
  const removeLog = useMutation(api.logs.remove)

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
      <div className="label-caps">Logged today</div>

      {logs === undefined ? (
        <p className="text-[12.5px] text-ink-600">Reading&hellip;</p>
      ) : logs.length === 0 ? (
        <p className="text-[13px] text-ink-500">
          Nothing yet. &#8984;K logs something in three seconds.
        </p>
      ) : (
        <div className="flex flex-col">
          {logs.map((log) => (
            <div
              key={log._id}
              className="flex items-center gap-3 border-b border-white/[0.05] py-2 last:border-b-0"
            >
              <span className="font-mono text-[11px] text-lav-300">
                {new Date(log.occurredAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="label-caps">{log.kind.replace('_', ' ')}</span>
              <span className="flex-1 truncate text-[13px] text-ink-300">
                {log.text ?? ''}
              </span>
              {log.value !== undefined ? (
                <span className="font-mono text-[12px] text-foreground">
                  {log.value}
                  {log.unit ? ` ${log.unit}` : ''}
                </span>
              ) : null}
              <AreaBadge
                area={log.area}
                onChange={(area: Area) =>
                  void setArea({ logId: log._id, area })
                }
              />

              <button
                type="button"
                aria-label="Delete this log"
                onClick={() => void removeLog({ logId: log._id })}
                className="text-ink-700 transition-colors hover:text-ink-400"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
