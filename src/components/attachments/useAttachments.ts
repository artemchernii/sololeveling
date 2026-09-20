import { useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, RefObject } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'

export type AttachmentParent =
  | { noteId: Id<'notes'>; taskId?: undefined }
  | { taskId: Id<'tasks'>; noteId?: undefined }

/* What `listFor` returns: a projection, not the row — the storage id and the
   owner never need to reach the client. */
type Listed = {
  _id: Id<'attachments'>
  name: string
  contentType: string
  size: number
  url: string | null
}

/* Files on a note or a task, as a hook rather than a component (20 Sep).

   It was all inside `Attachments`, which meant the paste handler was on the
   clip row — and the clip row is a *sibling* of the box you type in. So ⌘V
   with the cursor in a task's notes did nothing at all, which is exactly what
   Artem reported: "I really like when input is focused and I press CMD+V
   leads to paste screenshot. Like we do here in chat."

   The upload does not care which element the paste landed on, so the handlers
   come out as `zone` and go on whichever element should catch them — for an
   open task or note, the whole panel. Text paste is untouched: the event is
   only claimed when the clipboard actually carries files.

   Three ways in, because the one that matters depends on where the thing came
   from: paste a screenshot, drop a PDF from Finder, or press the clip. */
export function useAttachments(parent: AttachmentParent): {
  files: Array<Listed> | undefined
  images: Array<Listed>
  others: Array<Listed>
  remove: (id: Id<'attachments'>) => void
  busy: number
  error: string | null
  over: boolean
  /* Spread on the element that should accept drops and pastes. */
  zone: {
    onDragOver: (e: DragEvent) => void
    onDragLeave: () => void
    onDrop: (e: DragEvent) => void
    onPaste: (e: ClipboardEvent) => void
  }
  pick: () => void
  input: RefObject<HTMLInputElement | null>
  onPicked: (list: FileList | null) => void
} {
  const files: Array<Listed> | undefined = useQuery(
    api.attachments.listFor,
    parent,
  )
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl)
  const add = useMutation(api.attachments.add)
  const removeOne = useMutation(api.attachments.remove)

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
          /* A pasted screenshot arrives as `image.png` every time, so the
             name is the one thing the clipboard cannot tell you. */
          name: file.name === '' ? 'pasted image' : file.name,
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

  return {
    files,
    images: (files ?? []).filter(
      (f) => f.contentType.startsWith('image/') && f.url !== null,
    ),
    others: (files ?? []).filter((f) => !f.contentType.startsWith('image/')),
    remove: (attachmentId) => void removeOne({ attachmentId }),
    busy,
    error,
    over,
    zone: {
      onDragOver: (e) => {
        e.preventDefault()
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e) => {
        e.preventDefault()
        setOver(false)
        void upload([...e.dataTransfer.files])
      },
      /* Claimed only when the clipboard carries files — pasting a prompt into
         the notes box has to go on working, and that is most pastes. */
      onPaste: (e) => {
        const pasted = [...e.clipboardData.files]
        if (pasted.length === 0) return
        e.preventDefault()
        void upload(pasted)
      },
    },
    pick: () => input.current?.click(),
    input,
    onPicked: (list) => void upload([...(list ?? [])]),
  }
}
