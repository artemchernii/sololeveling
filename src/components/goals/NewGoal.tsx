import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import { AREAS } from '@/components/AreaBadge'
import { SaveLabel, useSave } from '@/components/Saving'
import type { Area } from '@/lib/capture-parser'

/* A goal on its own (R3, 16 Sep). Projects are programming or business work;
   a goal can be "gain 5 kg of muscle" or "a month clean", with no project
   under it and milestones instead. */
export function NewGoal() {
  const createGoal = useMutation(api.goals.create)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<Area>('life')
  const [deadline, setDeadline] = useState('')
  const [target, setTarget] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const saving = useSave()

  async function submit() {
    if (saving.busy) return
    if (title.trim().length === 0) {
      setError('A goal needs a title.')
      return
    }
    try {
      await saving.run(() =>
        createGoal({
          title: title.trim(),
          area,
          deadline: deadline || undefined,
          targetLabel: target.trim() || undefined,
          description: description.trim() || undefined,
        }),
      )
      setError(null)
    } catch {
      setError('That did not work.')
    }
  }

  /* The form closes once the tick has been seen, and only then clears — the
     goal has already appeared below it by then. */
  function finish() {
    saving.settle()
    setTitle('')
    setDeadline('')
    setTarget('')
    setDescription('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="glass flex items-center gap-2 self-start rounded-[14px] px-4 py-2.5 text-[12.5px] text-ink-300 transition-colors hover:text-foreground"
      >
        <Plus className="size-3.5" />
        New goal
      </button>
    )
  }

  const control =
    'rounded-[6px] border border-lift/10 bg-sink/20 px-2 py-1 text-[12px] text-ink-300'

  return (
    <div className="glass flex flex-col gap-3 rounded-[22px] p-6">
      <div className="label-caps">New goal</div>
      <div className="flex flex-col gap-1 border-b border-lift/[0.07] pb-2">
        <span className="label-caps">Goal</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          placeholder="Gain 5 kg of muscle"
          className="w-full bg-transparent text-[13px] text-foreground outline-none placeholder:text-ink-700"
        />
      </div>
      {/* Room for what the title cannot hold: the reasoning, a pasted prompt,
          the paragraph you already wrote somewhere else. Enter is a newline
          here, so the whole sheet's Enter-to-save stops at its edge. */}
      <div className="flex flex-col gap-1 border-b border-lift/[0.07] pb-2">
        <span className="label-caps">Notes</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Why this, what it looks like when it is done, anything you pasted"
          className="w-full resize-y bg-transparent text-[13px] leading-relaxed text-foreground outline-none placeholder:text-ink-700"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          <span className="label-caps">Area</span>
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className={control}
          >
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="label-caps">By</span>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className={`${control} font-mono`}
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="label-caps">Target</span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="+5 kg"
            className={`${control} w-24`}
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={saving.status === 'saved' ? finish : () => setOpen(false)}
            className="text-[12px] text-ink-600 transition-colors hover:text-ink-400"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving.busy}
            onClick={() => void submit()}
            className="rounded-[7px] border border-lav-500/60 px-3 py-1 text-[12px] text-lav-300 transition-colors hover:bg-lav-900/60"
          >
            <SaveLabel status={saving.status} onSettled={finish}>
              Set it
            </SaveLabel>
          </button>
        </div>
      </div>
      {error ? <p className="text-[12.5px] text-ink-400">{error}</p> : null}
    </div>
  )
}
