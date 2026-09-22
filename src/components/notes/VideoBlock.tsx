import { Play } from 'lucide-react'
import { useState } from 'react'

import { thumbnailUrl, watchUrl } from '@/lib/youtube'

/* A pasted YouTube link, as the video it points at (R4).

   The poster frame first, and the player only after a click. That ordering is
   the point rather than a detail: an iframe embedded on sight would load
   Google's player into this app every time a note is opened, and a note is
   opened far more often than a video is watched. Until you click, this is one
   image request.

   No title. Asking YouTube for one means a network call on every render of
   the note, and the thumbnail plus a play triangle already says what it is. */
export function VideoBlock({ id }: { id: string }) {
  const [playing, setPlaying] = useState(false)

  if (playing) {
    return (
      <div className="motion-arrive my-2 aspect-video w-full overflow-hidden rounded-[10px] bg-sink/60 ring-1 ring-lift/[0.06] ring-inset">
        <iframe
          src={watchUrl(id)}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label="Play this video"
      className="motion-press group relative my-2 block aspect-video w-full overflow-hidden rounded-[10px] bg-sink/60 ring-1 ring-lift/[0.06] ring-inset"
    >
      <img
        src={thumbnailUrl(id)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover opacity-85 transition-opacity group-hover:opacity-100"
      />
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-[54px] place-items-center rounded-full bg-sink/70 ring-1 ring-lift/20 ring-inset backdrop-blur-sm transition-colors group-hover:bg-sink/85">
          <Play className="size-5 translate-x-[1px] fill-ink-100 text-ink-100" />
        </span>
      </span>
    </button>
  )
}
