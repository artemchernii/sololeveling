import { useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { X } from 'lucide-react'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { ProjectLogo } from '@/components/projects/ProjectLogo'
import type { Area } from '@/lib/capture-parser'

/* Setting a project's logo (20 Sep). Convex file storage in its two steps:
   ask for a short-lived upload URL, POST the file straight to it, then store
   the storageId that comes back. The file never passes through a mutation.

   The mark itself is the control — press it and the file picker opens. A
   write must be visible when it lands, and here it is: the image replaces the
   letter in place. */
export function LogoUpload({
  projectId,
  url,
  title,
  area,
}: {
  projectId: Id<'projects'>
  url: string | null
  title: string
  area: Area | undefined
}) {
  const generateUploadUrl = useMutation(api.projects.generateUploadUrl)
  const setLogo = useMutation(api.projects.setLogo)
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      const postUrl = await generateUploadUrl()
      const res = await fetch(postUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!res.ok) throw new Error(String(res.status))
      const { storageId } = (await res.json()) as {
        storageId: Id<'_storage'>
      }
      await setLogo({ projectId, storageId })
    } catch {
      /* Said plainly rather than swallowed: an upload that fails silently
         looks exactly like one that worked. */
      setError('That image did not upload.')
    } finally {
      setBusy(false)
    }
  }

  return (
    /* Fixed-size and relative: "Remove" and any error hang off the mark
       instead of sitting in the title row, where they pushed the heading
       sideways (20 Sep). */
    <div className="group/logo relative shrink-0">
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        aria-label={url === null ? 'Add a logo' : 'Replace the logo'}
        className={`block rounded-[8px] transition-opacity hover:opacity-80 ${
          busy ? 'opacity-50' : ''
        }`}
      >
        <ProjectLogo url={url} title={title} area={area} size={40} />
      </button>

      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
          /* Cleared, so picking the same file twice still fires a change. */
          e.target.value = ''
        }}
      />

      {url !== null ? (
        <button
          type="button"
          onClick={() => void setLogo({ projectId, storageId: null })}
          aria-label="Remove the logo"
          className="glass absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full text-[10px] text-ink-400 opacity-0 transition-opacity group-hover/logo:opacity-100 focus-visible:opacity-100"
        >
          <X className="size-2.5" />
        </button>
      ) : null}

      {error ? (
        <p className="absolute top-full left-0 pt-1 text-[11.5px] whitespace-nowrap text-ink-400">
          {error}
        </p>
      ) : null}
    </div>
  )
}
