import type { RefObject } from 'react'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
} from 'lucide-react'

import {
  insertLink,
  toggleCode,
  toggleHeading,
  toggleList,
  toggleWrap,
} from '@/lib/note-format'
import type { Edit } from '@/lib/note-format'

/* 24 Sep. Artem: "when we create we want to maybe make heading 1,2,3, italic,
   bold, list, code, links". Each button writes the markdown for it into the
   plain text (lib/note-format.ts) and the reading view draws it. */

type Format = (value: string, from: number, to: number) => Edit

/** Runs one edit on the textarea's selection and puts the selection back. */
export function applyFormat(
  el: HTMLTextAreaElement,
  value: string,
  onChange: (value: string) => void,
  format: Format,
) {
  const edit = format(value, el.selectionStart, el.selectionEnd)
  onChange(edit.value)
  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(edit.from, edit.to)
  })
}

const TOOLS: Array<{
  label: string
  keys?: string
  icon: typeof Bold
  format: Format
  gapBefore?: boolean
}> = [
  {
    label: 'Heading 1',
    icon: Heading1,
    format: (v, f, t) => toggleHeading(v, f, t, 1),
  },
  {
    label: 'Heading 2',
    icon: Heading2,
    format: (v, f, t) => toggleHeading(v, f, t, 2),
  },
  {
    label: 'Heading 3',
    icon: Heading3,
    format: (v, f, t) => toggleHeading(v, f, t, 3),
  },
  {
    label: 'Bold',
    keys: '⌘B',
    icon: Bold,
    format: (v, f, t) => toggleWrap(v, f, t, '**'),
    gapBefore: true,
  },
  {
    label: 'Italic',
    keys: '⌘I',
    icon: Italic,
    format: (v, f, t) => toggleWrap(v, f, t, '*'),
  },
  { label: 'List', icon: List, format: toggleList, gapBefore: true },
  { label: 'Code', icon: Code, format: toggleCode },
  { label: 'Link', icon: Link2, format: insertLink },
]

export function NoteToolbar({
  editorRef,
  value,
  onChange,
}: {
  editorRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex items-center gap-0.5"
    >
      {TOOLS.map((tool) => (
        <button
          key={tool.label}
          type="button"
          title={tool.keys ? `${tool.label} ${tool.keys}` : tool.label}
          aria-label={tool.label}
          /* mousedown, not click, and no focus change: the selection being
             formatted is the textarea's, and a click would take it away. */
          onMouseDown={(e) => {
            e.preventDefault()
            const el = editorRef.current
            if (el) applyFormat(el, value, onChange, tool.format)
          }}
          className={`motion-press grid size-7 place-items-center rounded-[7px] text-ink-500 transition-colors hover:bg-area-knowledge/12 hover:text-area-knowledge ${
            tool.gapBefore ? 'ml-2' : ''
          }`}
        >
          <tool.icon className="size-[15px]" />
        </button>
      ))}
    </div>
  )
}
