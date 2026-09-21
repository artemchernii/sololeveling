import type { Id } from '../../convex/_generated/dataModel'

/** A note or a task, whichever owns the files. */
export type AttachmentParent =
  | { noteId: Id<'notes'>; taskId?: undefined }
  | { taskId: Id<'tasks'>; noteId?: undefined }

/* The args `attachments.listFor` and `attachments.add` are given, built one
   field at a time rather than passed through (20 Sep).

   This exists because of a crash. `Attachments` was collecting its parent with
   a rest spread — `function Attachments({ compact, ...parent })` — and handing
   that object straight to Convex. In dev the TanStack plugin writes a
   `data-tsd-source` attribute onto every JSX element, so `parent` arrived
   carrying the source location of the tag, and the validator refused it:

     ArgumentValidationError: Object contains extra field `data-tsd-source`

   The note page went down; the project page did not, because there the parent
   is a constructed object rather than a props bag. So the rule is narrower
   than "mind that one attribute": a props object is never query args. Whatever
   a parent is carrying, only these two fields leave here. */
export function attachmentArgs(parent: AttachmentParent): {
  noteId?: Id<'notes'>
  taskId?: Id<'tasks'>
} {
  return parent.noteId !== undefined
    ? { noteId: parent.noteId }
    : { taskId: parent.taskId }
}
