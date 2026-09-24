import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from 'lucide-react'

/* 24 Sep. A pasted screenshot is read, not downloaded: it opens over the
   page at the size it was taken, ← and → step through the others on the same
   note, Esc or a click outside puts it away. The original is one link away. */
export function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: Array<{ _id: string; url: string | null; name: string }>
  index: number
  onIndex: (index: number) => void
  onClose: () => void
}) {
  const image = images[index] as (typeof images)[number] | undefined
  const many = images.length > 1

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (!many) return
      if (e.key === 'ArrowRight') onIndex((index + 1) % images.length)
      if (e.key === 'ArrowLeft')
        onIndex((index - 1 + images.length) % images.length)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, images.length, many, onIndex, onClose])

  if (!image) return null

  const nav =
    'motion-press grid size-10 place-items-center rounded-full bg-sink/60 text-ink-200 ring-1 ring-lift/15 hover:text-foreground'

  /* Portalled to <body>: the tray sits in a frosted panel, and a
     backdrop-filter makes `fixed` mean "fixed to the panel", not the screen. */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      className="motion-fade fixed inset-0 z-[70] flex items-center justify-center bg-sink/85 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <img
        key={image._id}
        src={image.url ?? undefined}
        alt={image.name}
        onClick={(e) => e.stopPropagation()}
        className="motion-arrive max-h-[86vh] max-w-[92vw] rounded-[12px] object-contain shadow-[0_24px_60px_-12px_var(--color-sink)] ring-1 ring-lift/10"
      />

      <div
        className="absolute top-4 right-4 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={image.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="motion-press flex items-center gap-1.5 rounded-full bg-sink/60 px-3 py-1.5 text-[12px] text-ink-200 ring-1 ring-lift/15 hover:text-foreground"
        >
          Original
          <ArrowUpRight className="size-3.5" />
        </a>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={nav}
        >
          <X className="size-4" />
        </button>
      </div>

      {many ? (
        <>
          <button
            type="button"
            aria-label="Previous"
            onClick={(e) => {
              e.stopPropagation()
              onIndex((index - 1 + images.length) % images.length)
            }}
            className={`absolute left-4 ${nav}`}
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={(e) => {
              e.stopPropagation()
              onIndex((index + 1) % images.length)
            }}
            className={`absolute right-4 ${nav}`}
          >
            <ChevronRight className="size-5" />
          </button>
          <span className="absolute bottom-5 font-mono text-[11px] text-ink-400">
            {index + 1} / {images.length}
          </span>
        </>
      ) : null}
    </div>,
    document.body,
  )
}
