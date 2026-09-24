import { useState } from 'react'
import { useMutation } from 'convex/react'
import { Plus } from 'lucide-react'

import { api } from '../../../convex/_generated/api'

/* One line to add a routine item — an exercise on Body, a topic on
   Languages. Enter adds and stays open for the next; Escape closes. */
export function AddDrill({
  group,
  area = 'body',
  placeholder = 'add an exercise',
  autoFocus = false,
  onCancelEmpty,
}: {
  group: string
  area?: string
  placeholder?: string
  autoFocus?: boolean
  onCancelEmpty?: () => void
}) {
  const create = useMutation(api.drills.create)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(autoFocus)

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="motion-press inline-flex items-center gap-1.5 self-start rounded-full px-2 py-1 font-mono text-[10.5px] tracking-[0.12em] text-ink-500 uppercase transition-colors hover:bg-(--area)/10 hover:text-(--area)"
      >
        <Plus className="size-3" />
        {placeholder}
      </button>
    )
  }

  function submit() {
    const title = text.trim()
    if (title.length === 0) return
    setText('')
    void create({ area, group, title })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="motion-arrive flex items-center gap-2"
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setText('')
            setOpen(false)
            onCancelEmpty?.()
          }
        }}
        placeholder={`${placeholder} — Enter adds, Esc closes`}
        aria-label={placeholder}
        className="min-w-0 flex-1 rounded-[10px] border border-(--area)/35 bg-sink/20 px-3 py-2 text-[13.5px] text-foreground outline-none placeholder:text-ink-600 focus:border-(--area)/70"
      />
      <button
        type="submit"
        aria-label="Add"
        className="motion-press grid size-8 shrink-0 place-items-center rounded-[10px] bg-(--area)/15 text-(--area) ring-1 ring-(--area)/45 ring-inset"
      >
        <Plus className="size-4" />
      </button>
    </form>
  )
}
