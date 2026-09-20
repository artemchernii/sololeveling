import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, DragEvent, RefObject } from 'react'
import { useMutation } from 'convex/react'
import { useQuery } from 'convex-helpers/react/cache/hooks'
import { ConvexError } from 'convex/values'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { attachmentArgs } from '@/lib/attachment-parent'
import type { AttachmentParent } from '@/lib/attachment-parent'

export type { AttachmentParent }

/* What `listFor` returns: a projection, not the row — the storage id and the
   owner never need to reach the client. */
type Listed = {
  _id: Id<'attachments'>
  name: string
  contentType: string
  size: number
  url: string | null
}

/** The handlers that make an element accept a drop or a paste. */
export type Zone = {
  onDragOver: (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: DragEvent) => void
  onPaste: (e: ClipboardEvent) => void
}

/* A pasted screenshot arrives with no name at all, every time. */
function named(file: File): string {
  return file.name === '' ? 'pasted image' : file.name
}

/* The upload itself, with no opinion about what it is attaching to: bytes to
   storage, then a row pointing at them. Both hooks below share it — one
   attaches straight away, the other waits for its note to exist. */
function useUploader() {
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl)
  const add = useMutation(api.attachments.add)
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(
    async (parent: AttachmentParent, list: Array<File>) => {
      if (list.length === 0) return
      const args = attachmentArgs(parent)
      setError(null)
      setBusy((n) => n + list.length)
      for (const file of list) {
        try {
          const url = await generateUploadUrl()
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
            },
            body: file,
          })
          if (!res.ok) throw new Error(String(res.status))
          const { storageId } = (await res.json()) as {
            storageId: Id<'_storage'>
          }
          await add({
            ...args,
            storageId,
            name: named(file),
            contentType: file.type || 'application/octet-stream',
            size: file.size,
          })
        } catch (e) {
          setError(
            e instanceof ConvexError
              ? String(e.data)
              : `${named(file)} failed.`,
          )
        } finally {
          setBusy((n) => n - 1)
        }
      }
    },
    [generateUploadUrl, add],
  )

  return { upload, busy, error, setError }
}

/* Only claimed when the clipboard carries files — pasting a prompt into the
   box you are typing in has to go on working, and that is most pastes. */
function makeZone(
  take: (files: Array<File>) => void,
  setOver: (over: boolean) => void,
): Zone {
  return {
    onDragOver: (e) => {
      e.preventDefault()
      setOver(true)
    },
    onDragLeave: () => setOver(false),
    onDrop: (e) => {
      e.preventDefault()
      setOver(false)
      take([...e.dataTransfer.files])
    },
    onPaste: (e) => {
      const pasted = [...e.clipboardData.files]
      if (pasted.length === 0) return
      e.preventDefault()
      take(pasted)
    },
  }
}

/* Files on a note or a task that already exists (20 Sep).

   It was all inside `Attachments`, which meant the paste handler was on the
   clip row — and the clip row is a *sibling* of the box you type in. So ⌘V
   with the cursor in a task's notes did nothing at all, which is exactly what
   Artem reported: "I really like when input is focused and I press CMD+V
   leads to paste screenshot. Like we do here in chat."

   The upload does not care which element the paste landed on, so the handlers
   come out as `zone` and go on whichever element should catch them — for an
   open task or note, the whole panel.

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
  zone: Zone
  pick: () => void
  input: RefObject<HTMLInputElement | null>
  onPicked: (list: FileList | null) => void
} {
  /* Narrowed, never passed through — see `attachmentArgs`. A props object
     handed to Convex as args took the note page down on 20 Sep. */
  const args = attachmentArgs(parent)
  const files: Array<Listed> | undefined = useQuery(
    api.attachments.listFor,
    args,
  )
  const removeOne = useMutation(api.attachments.remove)
  const { upload, busy, error } = useUploader()

  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const take = (list: Array<File>) => void upload(parent, list)

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
    zone: makeZone(take, setOver),
    pick: () => input.current?.click(),
    input,
    onPicked: (list) => take([...(list ?? [])]),
  }
}

/** A file waiting for the thing it belongs to to exist. */
export type Pending = {
  id: string
  file: File
  /** An object URL, for showing an image before it has been uploaded. */
  preview: string | null
}

/* Files pasted into something that does not exist yet (20 Sep).

   Artem, pasting a screenshot into the new-note composer on the Notes page:
   "I paste screenshot here and it doesnt work. I think this is what we want?"

   It could not work. `attachments` rows point at a note or a task, and while
   you are still writing the first line there is neither — there is nothing to
   attach to. The fix is not a different handler, it is a waiting room: the
   files are held in the browser, shown as thumbnails from object URLs, and
   uploaded the moment the note has an id.

   Nothing is uploaded if the note is never saved, which is the right way
   round: bytes in storage that no row points at cannot be reached or deleted
   from the app. */
export function usePendingAttachments(): {
  pending: Array<Pending>
  over: boolean
  busy: number
  error: string | null
  zone: Zone
  remove: (id: string) => void
  pick: () => void
  input: RefObject<HTMLInputElement | null>
  onPicked: (list: FileList | null) => void
  /** Upload everything held, now that the parent exists, and empty the room. */
  flush: (parent: AttachmentParent) => Promise<void>
} {
  const { upload, busy, error } = useUploader()
  const [pending, setPending] = useState<Array<Pending>>([])
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  /* Object URLs are a browser-wide allocation, not React state: each one is
     released when its thumbnail goes, and the rest on unmount, or navigating
     away mid-note would leak every screenshot pasted into it. */
  const live = useRef<Array<string>>([])
  useEffect(
    () => () => {
      for (const url of live.current) URL.revokeObjectURL(url)
      live.current = []
    },
    [],
  )

  function take(list: Array<File>) {
    if (list.length === 0) return
    setPending((held) => [
      ...held,
      ...list.map((file) => {
        const preview = file.type.startsWith('image/')
          ? URL.createObjectURL(file)
          : null
        if (preview) live.current.push(preview)
        return { id: crypto.randomUUID(), file, preview }
      }),
    ])
  }

  return {
    pending,
    over,
    busy,
    error,
    zone: makeZone(take, setOver),
    remove: (id) =>
      setPending((held) => {
        const going = held.find((p) => p.id === id)
        if (going?.preview) {
          URL.revokeObjectURL(going.preview)
          live.current = live.current.filter((u) => u !== going.preview)
        }
        return held.filter((p) => p.id !== id)
      }),
    pick: () => input.current?.click(),
    input,
    onPicked: (list) => take([...(list ?? [])]),
    flush: async (parent) => {
      if (pending.length === 0) return
      await upload(
        parent,
        pending.map((p) => p.file),
      )
      for (const p of pending) {
        if (p.preview) URL.revokeObjectURL(p.preview)
      }
      live.current = []
      setPending([])
    },
  }
}
