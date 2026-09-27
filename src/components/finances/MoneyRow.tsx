import { useState } from 'react'
import { useMutation } from 'convex/react'
import { X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Doc } from '../../../convex/_generated/dataModel'
import { useSave } from '@/components/Saving'
import { CategoryChip } from '@/components/track/CategoryChip'
import { clock, whenLabel } from '@/lib/format'
import {
  categoriesFor,
  categoryLabel,
  categoryLabels,
  euros,
} from '@/lib/money'
import type { MoneyKind } from '@/lib/money'

const DATE = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
})

/* One logged amount, where it can be put right (F1): its category is a
   chip to refile, its amount is pressed to correct (logs.setValue keeps it
   to the cent), the cross removes it. The row is the fact behind a sum —
   PLAN.md §1: every sum opens its rows. */
export function MoneyRow({
  row,
  showDay = false,
}: {
  row: Doc<'logs'>
  showDay?: boolean
}) {
  const kind = row.kind as MoneyKind
  const category = row.meta?.category
  const setCategory = useMutation(api.logs.setCategory)
  const remove = useMutation(api.logs.remove)
  const title = row.text ?? categoryLabel(kind, category ?? null)

  return (
    <div className="motion-arrive group flex min-h-10 items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 transition-colors hover:bg-lift/[0.04]">
      <span className="min-w-0 flex-1 truncate text-[14px] text-foreground first-letter:uppercase">
        {title}
      </span>
      <CategoryChip
        category={category}
        options={categoriesFor(kind).map((c) => c.id)}
        labels={categoryLabels(kind)}
        onChange={(next) =>
          void setCategory({ logId: row._id, category: next })
        }
      />
      <Amount row={row} />
      <span className="w-12 shrink-0 text-right font-mono text-[11px] text-ink-600">
        {showDay
          ? DATE.format(new Date(row.occurredAt))
          : clock(new Date(row.occurredAt))}
      </span>
      <button
        type="button"
        aria-label={`Remove ${title} logged ${whenLabel(row.occurredAt)}`}
        onClick={() => void remove({ logId: row._id })}
        className="motion-press grid size-5 shrink-0 place-items-center rounded-[6px] text-ink-700 opacity-0 transition-colors group-hover:opacity-100 hover:bg-state-danger/15 hover:text-state-danger focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <X className="size-3" />
      </button>
    </div>
  )
}

function Amount({ row }: { row: Doc<'logs'> }) {
  const setValue = useMutation(api.logs.setValue)
  const saving = useSave()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const value = row.value ?? 0
  const sign = row.kind === 'income' ? '+' : '−'

  function save() {
    const n = Number(text.replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || n === value) {
      setEditing(false)
      return
    }
    void saving
      .run(() => setValue({ logId: row._id, value: n }))
      .then(() => setEditing(false))
  }

  if (editing) {
    return (
      <input
        autoFocus
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        aria-label="Amount in euros"
        className="w-20 shrink-0 bg-transparent text-right font-mono text-[13px] text-ink-100 focus:outline-none"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        setText(String(value))
        setEditing(true)
      }}
      title="Correct the amount"
      className="w-20 shrink-0 text-right font-mono text-[13px] text-ink-200 hover:text-foreground"
    >
      {sign}
      {euros(value)}
    </button>
  )
}
