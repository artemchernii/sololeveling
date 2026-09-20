import { describe, expect, it } from 'vitest'

import { attachmentArgs } from './attachment-parent'
import type { AttachmentParent } from './attachment-parent'

import type { Id } from '../../convex/_generated/dataModel'

const noteId = 'jh79txkvmrctnrck86qqtaq1eh8erxf4' as Id<'notes'>
const taskId = 'k577fc4zdsj45w5q7daxhhp6v98erwmr' as Id<'tasks'>

describe('attachmentArgs', () => {
  it('sends a note by its id alone', () => {
    expect(attachmentArgs({ noteId })).toEqual({ noteId })
  })

  it('sends a task by its id alone', () => {
    expect(attachmentArgs({ taskId })).toEqual({ taskId })
  })

  /* The regression, 20 Sep. A props object was being handed to Convex as
     query args, and in dev the TanStack plugin had written `data-tsd-source`
     onto it, so the argument validator refused the call and the note page
     went down. Anything riding along on a parent stops here. */
  it('drops whatever else the caller was carrying', () => {
    const contaminated = {
      noteId,
      'data-tsd-source': '/src/routes/_app/notes.$id.tsx:191:9',
      compact: true,
      children: 'a whole React tree',
    } as unknown as AttachmentParent

    expect(attachmentArgs(contaminated)).toEqual({ noteId })
    expect(Object.keys(attachmentArgs(contaminated))).toEqual(['noteId'])
  })

  it('never sends both halves at once — the validator allows it, the query does not', () => {
    const both = { noteId, taskId } as unknown as AttachmentParent
    expect(Object.keys(attachmentArgs(both))).toEqual(['noteId'])
  })
})
