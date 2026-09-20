import { Paperclip, X } from 'lucide-react'

import { useAttachments } from './useAttachments'
import type { AttachmentParent } from './useAttachments'

/* Files on a note or a task (20 Sep). Images show as images. Everything else
   is a named link — a PDF is opened, not previewed, and pretending otherwise
   would put a grey box where a filename is more useful.

   The tray is now separate from the plumbing that feeds it (`useAttachments`),
   because an open task or note wants the paste to work anywhere inside the
   panel, not only over this row. `Attachments` keeps the old shape for
   callers that are only a tray. */
export function Attachments({
  compact = false,
  ...parent
}: AttachmentParent & { compact?: boolean }) {
  const att = useAttachments(parent)
  return (
    <div
      {...att.zone}
      className={`rounded-[12px] transition-colors ${
        att.over ? 'bg-lav-900/30 ring-1 ring-lav-500/50 ring-inset' : ''
      }`}
    >
      <AttachmentTray att={att} compact={compact} />
    </div>
  )
}

/* The tray proper: whatever is attached, and the one way to add more. Draws
   nothing above the clip row when there is nothing attached — an empty frame
   for files you have not added yet is the kind of graphic §3d says not to
   draw. */
export function AttachmentTray({
  att,
  compact = false,
}: {
  att: ReturnType<typeof useAttachments>
  compact?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      {att.images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {att.images.map((f) => (
            <div key={f._id} className="group/att motion-pop relative">
              <a href={f.url ?? undefined} target="_blank" rel="noreferrer">
                <img
                  src={f.url ?? undefined}
                  alt={f.name}
                  className={`rounded-[8px] object-cover ring-1 ring-lift/10 transition-transform hover:scale-[1.03] ${
                    compact ? 'size-14' : 'size-20'
                  }`}
                />
              </a>
              <Remove onClick={() => att.remove(f._id)} />
            </div>
          ))}
        </div>
      ) : null}

      {att.others.length > 0 ? (
        <div className="flex flex-col">
          {att.others.map((f) => (
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
                onClick={() => att.remove(f._id)}
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
          onClick={att.pick}
          className="flex items-center gap-1.5 text-[11.5px] text-ink-700 transition-colors hover:text-ink-400"
        >
          <Paperclip className="size-3" />
          {att.busy > 0
            ? `adding ${att.busy}…`
            : 'Attach — or paste a screenshot, or drop a file'}
        </button>
        <input
          ref={att.input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            att.onPicked(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {att.error ? (
        <p className="text-[12px] text-state-danger">{att.error}</p>
      ) : null}
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
