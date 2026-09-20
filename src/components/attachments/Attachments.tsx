import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'
import { Paperclip, X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

/* Files on a note or a task (20 Sep). Three ways in, because the one that
   matters depends on where the thing came from: paste a screenshot straight
   from the clipboard, drop a PDF from Finder, or press the clip and pick.

   Images show as images. Everything else is a named link — a PDF is opened,
   not previewed, and pretending otherwise would put a grey box where a
   filename is more useful. */
export function Attachments({
  noteId,
  taskId,
  compact = false,
}: {
  noteId?: Id<'notes'>
  taskId?: Id<'tasks'>
  compact?: boolean
}) {
  const parent = noteId !== undefined ? { noteId } : { taskId }
  const files = useQuery(api.attachments.listFor, parent)
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl)
  const add = useMutation(api.attachments.add)
  const remove = useMutation(api.attachments.remove)

  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(list: Array<File>) {
    if (list.length === 0) return
    setError(null)
    setBusy((n) => n + list.length)
    for (const file of list) {
      try {
        const url = await generateUploadUrl()
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        })
        if (!res.ok) throw new Error(String(res.status))
        const { storageId } = (await res.json()) as {
          storageId: Id<'_storage'>
        }
        await add({
          ...parent,
          storageId,
          name: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
        })
      } catch (e) {
        setError(
          e instanceof ConvexError ? String(e.data) : `${file.name} failed.`,
        )
      } finally {
        setBusy((n) => n - 1)
      }
    }
  }

  const images = (files ?? []).filter(
    (f) => f.contentType.startsWith('image/') && f.url !== null,
  )
  const others = (files ?? []).filter(
    (f) => !f.contentType.startsWith('image/'),
  )

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void upload([...e.dataTransfer.files])
      }}
      /* Paste works anywhere inside, so a screenshot goes in without first
         finding a button to press. */
      onPaste={(e) => {
        const pasted = [...e.clipboardData.files]
        if (pasted.length > 0) {
          e.preventDefault()
          void upload(pasted)
        }
      }}
      className={`flex flex-col gap-2 rounded-[12px] transition-colors ${
        over ? 'bg-lav-900/30 ring-1 ring-lav-500/50 ring-inset' : ''
      }`}
    >
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((f) => (
            <div key={f._id} className="group/att relative">
              <a href={f.url ?? undefined} target="_blank" rel="noreferrer">
                <img
                  src={f.url ?? undefined}
                  alt={f.name}
                  className={`rounded-[8px] object-cover ${
                    compact ? 'size-14' : 'size-20'
                  }`}
                />
              </a>
              <Remove onClick={() => void remove({ attachmentId: f._id })} />
            </div>
          ))}
        </div>
      ) : null}

      {others.length > 0 ? (
        <div className="flex flex-col">
          {others.map((f) => (
            <div key={f._id} className="group/att flex items-center gap-2 py-1">
              <Paperclip className="size-3 shrink-0 text-ink-600" />
              <a
                href={f.url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-[12.5px] text-ink-300 transition-colors hover:text-foreground"
              >
                {f.name}
              </a>
              <span className="shrink-0 font-mono text-[11px] text-ink-700">
                {sizeLabel(f.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => void remove({ attachmentId: f._id })}
                className="shrink-0 text-ink-700 opacity-0 transition-opacity group-hover/att:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex items-center gap-1.5 text-[11.5px] text-ink-700 transition-colors hover:text-ink-400"
        >
          <Paperclip className="size-3" />
          {busy > 0
            ? `adding ${busy}…`
            : 'Attach — or paste a screenshot, or drop a file'}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void upload([...(e.target.files ?? [])])
            e.target.value = ''
          }}
        />
      </div>

      {error ? <p className="text-[12px] text-ink-400">{error}</p> : null}
    </div>
  )
}

function Remove({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Remove attachment"
      onClick={onClick}
      className="glass absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full text-ink-400 opacity-0 transition-opacity group-hover/att:opacity-100"
    >
      <X className="size-2.5" />
    </button>
  )
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}k`
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`
}
